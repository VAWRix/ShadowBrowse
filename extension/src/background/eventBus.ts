import {
  SecurityEvent,
  PrivacyEvent,
  PrivacyEventInput,
  PrivacyEventOutcome,
  PrivacyEventSeverity,
  PrivacyEventSource,
  PrivacyEventCategory,
} from '../shared/types';
import { PrivacyEventEngine } from './privacyEventEngine';

/**
 * Maps a modern PrivacyEvent record into the legacy SecurityEvent interface
 * for 100% backward compatibility with existing UI components and IPC consumers.
 */
export function toLegacySecurityEvent(pe: PrivacyEvent): SecurityEvent {
  let legacySeverity: SecurityEvent['severity'] = 'INFO';
  if (pe.severity === 'CRITICAL') {
    legacySeverity = 'CRITICAL';
  } else if (pe.severity === 'WARNING') {
    legacySeverity = pe.outcome === 'MITIGATION_ATTEMPTED' || pe.outcome === 'MITIGATION_CONFIRMED' ? 'BLOCKED' : 'WARNING';
  } else if (pe.outcome === 'MITIGATION_CONFIRMED' || pe.outcome === 'MITIGATION_ATTEMPTED') {
    legacySeverity = 'BLOCKED';
  }

  const repeatPrefix = pe.repeatCount > 1 ? `[Repeated ${pe.repeatCount}x] ` : '';

  return {
    id: pe.id,
    timestamp: pe.timestamp,
    severity: legacySeverity,
    category: pe.category,
    technicalReason: `${repeatPrefix}${pe.technicalReason}`,
    userExplanation: pe.userExplanation,
    action: pe.outcome,
  };
}

export class EventBus {
  private static instance: EventBus;
  private engine: PrivacyEventEngine;

  private constructor() {
    this.engine = PrivacyEventEngine.getInstance();
  }

  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus();
    }
    return EventBus.instance;
  }

  /**
   * Legacy emit method preserved for complete backward compatibility.
   * Maps incoming parameters into the centralized, sanitized PrivacyEventEngine.
   */
  emit(
    category: SecurityEvent['category'],
    severity: SecurityEvent['severity'],
    technicalReason: string,
    userExplanation: string
  ): SecurityEvent {
    // Infer honest outcome from category and description
    let outcome: PrivacyEventOutcome = 'INFORMATIONAL';
    let mappedSeverity: PrivacyEventSeverity = 'INFO';
    let source: PrivacyEventSource = 'network_controller';

    if (severity === 'CRITICAL') {
      mappedSeverity = 'CRITICAL';
    } else if (severity === 'WARNING') {
      mappedSeverity = 'WARNING';
    } else if (severity === 'BLOCKED') {
      mappedSeverity = 'WARNING';
    }

    if (category === 'KILL_SWITCH') {
      outcome = 'MITIGATION_CONFIRMED';
      source = 'network_controller';
    } else if (category === 'STORAGE') {
      source = 'storage_controller';
      if (technicalReason.includes('purged') || technicalReason.includes('verified')) {
        outcome = 'MITIGATION_CONFIRMED';
      } else if (technicalReason.includes('FAILED')) {
        outcome = 'FAILED';
        mappedSeverity = 'CRITICAL';
      }
    } else if (category === 'TRACKER') {
      source = 'tracker_defense';
      if (severity === 'BLOCKED' || technicalReason.includes('TRACKER_BLOCKED')) {
        // Technically honest: DNR rule evaluated and dynamic rule active
        outcome = 'MITIGATION_ATTEMPTED';
      } else if (technicalReason.includes('TRACKER_DETECTED')) {
        outcome = 'DETECTED';
        mappedSeverity = 'WARNING';
      }
    } else if (category === 'FINGERPRINT') {
      source = 'fingerprint_controller';
      outcome = 'DETECTED';
      mappedSeverity = 'WARNING';
    } else if (category === 'TRACKING_PARAM') {
      source = 'content_script';
      if (userExplanation.includes('removed') || technicalReason.includes('Sanitized')) {
        outcome = 'MITIGATION_CONFIRMED';
      } else {
        outcome = 'DETECTED';
        mappedSeverity = 'WARNING';
      }
    } else if (category === 'SESSION') {
      source = 'session_manager';
      outcome = 'INFORMATIONAL';
    } else if (category === 'NETWORK') {
      source = 'network_controller';
      outcome = severity === 'CRITICAL' ? 'FAILED' : 'INFORMATIONAL';
    }

    const input: PrivacyEventInput = {
      category,
      type: `${category.toLowerCase()}.event`,
      severity: mappedSeverity,
      outcome,
      source,
      technicalReason,
      userExplanation,
    };

    const recorded = this.engine.recordEvent(input);
    return toLegacySecurityEvent(recorded);
  }

  /**
   * Phase 5A high-fidelity event emission method with structured metadata,
   * sanitized origins, and explicit outcomes.
   */
  emitPrivacyEvent(input: PrivacyEventInput): PrivacyEvent {
    return this.engine.recordEvent(input);
  }

  /**
   * Retrieves events mapped to the legacy SecurityEvent contract.
   */
  getEvents(limit = 50): SecurityEvent[] {
    return this.engine.getEvents(limit).map(toLegacySecurityEvent);
  }

  /**
   * Retrieves typed, versioned PrivacyEvent records.
   */
  getPrivacyEvents(limit = 50, category?: PrivacyEventCategory): PrivacyEvent[] {
    return this.engine.getEvents(limit, category);
  }

  /**
   * Purges session-tagged privacy events upon session termination.
   */
  async purgeSessionEvents(sessionId?: string): Promise<void> {
    await this.engine.purgeSessionEvents(sessionId);
  }

  /**
   * Clears both in-memory and persistent events.
   */
  clear(): void {
    this.engine.clearAll().catch((err) => {
      console.warn('[ShadowBrowse EventBus] Failed to clear engine events:', err);
    });
  }

  /**
   * Subscribes to events with legacy SecurityEvent projection.
   */
  subscribe(listener: (event: SecurityEvent) => void): () => void {
    return this.engine.subscribe((pe) => {
      try {
        listener(toLegacySecurityEvent(pe));
      } catch (err) {
        console.error('[ShadowBrowse EventBus] Subscription listener error:', err);
      }
    });
  }
}
