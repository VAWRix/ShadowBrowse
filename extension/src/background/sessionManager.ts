import { AnonymousSession, PrivacyState, SessionStats } from '../shared/types';
import { EventBus } from './eventBus';

export class SessionManager {
  private static instance: SessionManager;
  private currentSession: AnonymousSession | null = null;
  private eventBus: EventBus;

  private constructor() {
    this.eventBus = EventBus.getInstance();
  }

  static getInstance(): SessionManager {
    if (!SessionManager.instance) {
      SessionManager.instance = new SessionManager();
    }
    return SessionManager.instance;
  }

  getCurrentSession(): AnonymousSession | null {
    return this.currentSession;
  }

  /**
   * Restores an active session from persistent storage on service worker restart.
   * Preserves original session ID, start timestamp, and stats without creating duplicates.
   */
  restoreSession(session: AnonymousSession | null): void {
    this.currentSession = session;
  }

  startSession(
    options: {
      networkMode?: AnonymousSession['networkMode'];
      storageIsolation?: boolean;
      fingerprintProtection?: boolean;
      webRTCProtection?: boolean;
      dnsProtection?: boolean;
      killSwitchActive?: boolean;
    } = {}
  ): AnonymousSession {
    // Generate a cryptographically secure random session ID
    // NEVER derived from IP, device ID, user credentials, or fingerprint
    const sessionId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `sb_sess_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    const initialStats: SessionStats = {
      requestsObserved: 0,
      privacyEventsCount: 0,
      potentialTrackersBlockedOrDetected: 0,
      fingerprintSignalsDetected: 0,
      storageAccessEvents: 0,
      networkStatusChanges: 0,
    };

    this.currentSession = {
      sessionId,
      startedAt: Date.now(),
      mode: 'ANONYMOUS',
      networkMode: options.networkMode || 'TOR',
      storageIsolation: options.storageIsolation ?? true,
      fingerprintProtection: options.fingerprintProtection ?? true,
      webRTCProtection: options.webRTCProtection ?? true,
      dnsProtection: options.dnsProtection ?? true,
      killSwitchActive: options.killSwitchActive ?? true,
      temporaryState: true,
      status: 'STARTING',
      stats: initialStats,
    };

    this.eventBus.emit(
      'SESSION',
      'INFO',
      `Session initialized with ephemeral ID: ${sessionId.substring(0, 8)}...`,
      'Anonymous session started. Temporary browsing identity generated.'
    );

    return this.currentSession;
  }

  updateSessionStatus(status: PrivacyState): void {
    if (this.currentSession) {
      this.currentSession.status = status;
    }
  }

  incrementStat(statKey: keyof SessionStats, delta = 1): void {
    if (this.currentSession) {
      this.currentSession.stats[statKey] += delta;
    }
  }

  endSession(): { clearedSessionId: string; durationMs: number } | null {
    if (!this.currentSession) return null;

    const clearedSessionId = this.currentSession.sessionId;
    const durationMs = Date.now() - this.currentSession.startedAt;

    this.eventBus.emit(
      'SESSION',
      'INFO',
      `Session ended. Ephemeral ID destroyed: ${clearedSessionId.substring(0, 8)}...`,
      'Anonymous session ended. Temporary state destroyed.'
    );

    this.currentSession = null;

    return {
      clearedSessionId,
      durationMs,
    };
  }
}
