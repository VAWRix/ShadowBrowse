import {
  PRIVACY_EVENT_SCHEMA_VERSION,
  PrivacyEvent,
  PrivacyEventInput,
  PrivacyEventCategory,
} from '../shared/types';
import { sanitizeOrigin, sanitizeDomain, sanitizeMetadata } from '../shared/sanitizer';

export const DEDUPLICATION_WINDOW_MS = 2500;
export const STORAGE_DEBOUNCE_MS = 1500;
export const FLUSH_DIRTY_THRESHOLD = 10;
export const RATE_LIMIT_CONTENT_PER_SEC = 20;
export const MAX_MEMORY_EVENTS = 100;
export const MAX_PERSISTED_EVENTS = 200;
export const STORAGE_KEY = 'shadowbrowse_privacy_events';

export class PrivacyEventEngine {
  private static instance: PrivacyEventEngine;

  private memoryBuffer: PrivacyEvent[] = [];
  private dirtyQueue: PrivacyEvent[] = [];
  private listeners: ((event: PrivacyEvent) => void)[] = [];

  private isHydrated = false;
  private isWriting = false;
  private pendingWritePromise: Promise<void> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  // Rolling rate-limit counter for content script event emissions
  private contentRateWindow = {
    windowStart: 0,
    count: 0,
  };

  private constructor() {}

  static getInstance(): PrivacyEventEngine {
    if (!PrivacyEventEngine.instance) {
      PrivacyEventEngine.instance = new PrivacyEventEngine();
    }
    return PrivacyEventEngine.instance;
  }

  /**
   * Hydrates the in-memory buffer from chrome.storage.local.
   * Call once during service worker startup.
   */
  async hydrate(): Promise<void> {
    if (this.isHydrated) return;

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const result = await chrome.storage.local.get(STORAGE_KEY);
        const storedEvents = result[STORAGE_KEY];
        if (Array.isArray(storedEvents)) {
          // Filter valid PrivacyEvent objects
          const validEvents = storedEvents
            .filter((e): e is PrivacyEvent => e && typeof e.id === 'string' && typeof e.timestamp === 'number')
            .slice(0, MAX_MEMORY_EVENTS);

          // Prevent race condition: do not overwrite events recorded before rehydration completed
          const existingIds = new Set(this.memoryBuffer.map((e) => e.id));
          const toAppend = validEvents.filter((e) => !existingIds.has(e.id));
          this.memoryBuffer = [...this.memoryBuffer, ...toAppend].slice(0, MAX_MEMORY_EVENTS);
        }
      } catch (err) {
        console.warn('[ShadowBrowse PrivacyEventEngine] Storage rehydration failed:', err);
      }
    }

    this.isHydrated = true;
  }

  /**
   * Ingests, sanitizes, deduplicates, and schedules persistence for a privacy event.
   */
  recordEvent(input: PrivacyEventInput): PrivacyEvent {
    const now = Date.now();
    const isCritical = input.severity === 'CRITICAL' || input.category === 'KILL_SWITCH';

    // 1. Rate-limiting for content-script / in-page signals to prevent DoS
    // Critical system events and kill-switch activations NEVER undergo rate limiting
    if (!isCritical && (input.source === 'content_script' || input.source === 'content_guard')) {
      if (now - this.contentRateWindow.windowStart > 1000) {
        this.contentRateWindow.windowStart = now;
        this.contentRateWindow.count = 1;
      } else {
        this.contentRateWindow.count++;
        if (this.contentRateWindow.count > RATE_LIMIT_CONTENT_PER_SEC) {
          // Exceeded rate limit; coalesce into diagnostic drop event or return most recent
          if (this.memoryBuffer.length > 0) {
            const last = this.memoryBuffer[0];
            last.repeatCount++;
            last.lastObservedAt = now;
            return last;
          }
        }
      }
    }

    // 2. Strict sanitization of external parameters and size bounds
    const sanitizedOrigin = sanitizeOrigin(input.pageOrigin);
    const sanitizedTarget = sanitizeDomain(input.targetDomain);
    const sanitizedMeta = sanitizeMetadata(input.metadata);
    const truncatedSessionId = input.sessionId ? input.sessionId.substring(0, 8) : undefined;
    const boundedType = (input.type || 'generic.event').trim().substring(0, 64);
    const boundedExplanation = (input.userExplanation || '').trim().substring(0, 500);
    const boundedReason = (input.technicalReason || '').trim().substring(0, 500);

    // 3. Deduplication check within sliding window
    // Critical events and kill-switch activations are never suppressed by deduplication
    if (!isCritical) {
      const dedupeKey = `${input.category}:${boundedType}:${sanitizedTarget || ''}:${input.outcome}`;
      for (const existing of this.memoryBuffer) {
        if (now - existing.timestamp > DEDUPLICATION_WINDOW_MS) {
          break; // Events are ordered newest first; if outside window, stop searching
        }
        const existingKey = `${existing.category}:${existing.type}:${existing.targetDomain || ''}:${existing.outcome}`;
        if (existingKey === dedupeKey) {
          existing.repeatCount++;
          existing.lastObservedAt = now;
          this.queueForPersistence(existing);
          this.notifyListeners(existing);
          return existing;
        }
      }
    }

    // 4. Create new versioned PrivacyEvent
    const newEvent: PrivacyEvent = {
      id: `pevt_${now}_${Math.random().toString(36).substring(2, 8)}`,
      schemaVersion: PRIVACY_EVENT_SCHEMA_VERSION,
      timestamp: now,
      category: input.category,
      type: boundedType,
      severity: input.severity,
      outcome: input.outcome,
      source: input.source,
      sessionId: truncatedSessionId,
      targetDomain: sanitizedTarget,
      pageOrigin: sanitizedOrigin,
      userExplanation: boundedExplanation,
      technicalReason: boundedReason,
      repeatCount: 1,
      lastObservedAt: now,
      metadata: sanitizedMeta,
    };

    // Insert at head of memory ring buffer
    this.memoryBuffer.unshift(newEvent);
    if (this.memoryBuffer.length > MAX_MEMORY_EVENTS) {
      this.memoryBuffer.pop();
    }

    // Queue for batched storage write
    this.queueForPersistence(newEvent);
    this.notifyListeners(newEvent);

    return newEvent;
  }

  /**
   * Enqueues an event for batched persistence and manages write triggers.
   */
  private queueForPersistence(event: PrivacyEvent): void {
    const existingIndex = this.dirtyQueue.findIndex((e) => e.id === event.id);
    if (existingIndex >= 0) {
      this.dirtyQueue[existingIndex] = event;
    } else {
      this.dirtyQueue.push(event);
    }

    // If dirty queue hits batch limit, flush immediately; otherwise schedule trailing debounce
    if (this.dirtyQueue.length >= FLUSH_DIRTY_THRESHOLD) {
      this.flush().catch((err) => {
        console.warn('[ShadowBrowse PrivacyEventEngine] Immediate flush failed:', err);
      });
    } else {
      this.scheduleDebouncedFlush();
    }
  }

  private scheduleDebouncedFlush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      this.flush().catch((err) => {
        console.warn('[ShadowBrowse PrivacyEventEngine] Debounced flush failed:', err);
      });
    }, STORAGE_DEBOUNCE_MS);
  }

  /**
   * Serialized persistence flush writing dirty events to chrome.storage.local.
   * Enforces bounded storage (max 200 items, FIFO eviction) and handles storage errors.
   */
  async flush(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (this.dirtyQueue.length === 0) {
      return;
    }

    // If another write is already in progress, chain onto it
    if (this.isWriting && this.pendingWritePromise) {
      return this.pendingWritePromise.then(() => this.flush());
    }

    this.isWriting = true;
    const batchToFlush = [...this.dirtyQueue];
    this.dirtyQueue = [];

    this.pendingWritePromise = (async () => {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        return;
      }

      try {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        let existingList: PrivacyEvent[] = Array.isArray(stored[STORAGE_KEY]) ? stored[STORAGE_KEY] : [];

        // Merge dirty batch into existing list
        for (const item of batchToFlush) {
          const idx = existingList.findIndex((e) => e.id === item.id);
          if (idx >= 0) {
            existingList[idx] = item;
          } else {
            existingList.unshift(item);
          }
        }

        // Enforce hard upper bound with FIFO eviction
        if (existingList.length > MAX_PERSISTED_EVENTS) {
          existingList = existingList.slice(0, MAX_PERSISTED_EVENTS);
        }

        await chrome.storage.local.set({ [STORAGE_KEY]: existingList });
      } catch (err) {
        // Put unwritten batch back in dirty queue, capped at MAX_PERSISTED_EVENTS
        this.dirtyQueue = [...batchToFlush, ...this.dirtyQueue].slice(0, MAX_PERSISTED_EVENTS);

        // Attempt recovery: evict 50% oldest from storage if quota error
        try {
          const stored = await chrome.storage.local.get(STORAGE_KEY);
          if (Array.isArray(stored[STORAGE_KEY]) && stored[STORAGE_KEY].length > 50) {
            const halved = stored[STORAGE_KEY].slice(0, Math.floor(stored[STORAGE_KEY].length / 2));
            await chrome.storage.local.set({ [STORAGE_KEY]: halved });
          }
        } catch {
          // If recovery fails, continue in-memory without crashing
        }
      } finally {
        this.isWriting = false;
        this.pendingWritePromise = null;
      }
    })();

    return this.pendingWritePromise;
  }

  /**
   * Retrieves events from the in-memory ring buffer with optional category filter and limit.
   */
  getEvents(limit = 50, category?: PrivacyEventCategory): PrivacyEvent[] {
    let result = this.memoryBuffer;
    if (category) {
      result = result.filter((e) => e.category === category);
    }
    return result.slice(0, limit);
  }

  /**
   * Purges session-tagged privacy events upon anonymous session termination.
   * Default Privacy Policy: session-tagged events are purged when the session ends.
   */
  async purgeSessionEvents(sessionId?: string): Promise<void> {
    // Ensure any in-flight persistence write completes before calculating purge
    if (this.isWriting && this.pendingWritePromise) {
      await this.pendingWritePromise;
    }

    const targetPrefix = sessionId ? sessionId.substring(0, 8) : undefined;

    // Filter memory buffer
    this.memoryBuffer = this.memoryBuffer.filter((e) => {
      if (!e.sessionId) return true; // Keep system/sessionless events
      if (targetPrefix) {
        return e.sessionId !== targetPrefix;
      }
      return false; // Purge all session events if no specific ID passed
    });

    // Also filter dirty queue
    this.dirtyQueue = this.dirtyQueue.filter((e) => {
      if (!e.sessionId) return true;
      if (targetPrefix) {
        return e.sessionId !== targetPrefix;
      }
      return false;
    });

    // Update persistent storage
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        const stored = await chrome.storage.local.get(STORAGE_KEY);
        if (Array.isArray(stored[STORAGE_KEY])) {
          const filtered = stored[STORAGE_KEY].filter((e: PrivacyEvent) => {
            if (!e.sessionId) return true;
            if (targetPrefix) {
              return e.sessionId !== targetPrefix;
            }
            return false;
          });
          await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
        }
      } catch (err) {
        console.warn('[ShadowBrowse PrivacyEventEngine] Failed to purge session events from storage:', err);
      }
    }
  }

  /**
   * Completely clears all in-memory events and persistent storage records.
   */
  async clearAll(): Promise<void> {
    this.memoryBuffer = [];
    this.dirtyQueue = [];
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      try {
        await chrome.storage.local.remove(STORAGE_KEY);
      } catch (err) {
        console.warn('[ShadowBrowse PrivacyEventEngine] Failed to clear storage:', err);
      }
    }
  }

  /**
   * Subscribes a listener to newly recorded or updated events.
   */
  subscribe(listener: (event: PrivacyEvent) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }

  private notifyListeners(event: PrivacyEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (err) {
        console.error('[ShadowBrowse PrivacyEventEngine] Listener error:', err);
      }
    }
  }
}
