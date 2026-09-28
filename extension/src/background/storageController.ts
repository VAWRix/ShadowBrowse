/**
 * StorageController — Phase 2
 * Manages storage isolation and session data cleanup.
 *
 * PHASE 2 CHANGES:
 * - deactivateAndClean() now verifies browsingData removal success and reports it
 * - WebRTC policy is captured/restored via NetworkController's capturePreSessionState
 *   (WebRTC is no longer directly managed here — it was moved to NetworkController Phase 2
 *   so that restoration uses the captured snapshot rather than resetting to 'default')
 * - getStorageStatus() returns PARTIALLY_PROTECTED (not PROTECTED) because isolation
 *   is by cleanup-on-exit only, not by true storage partitioning
 * - Added cleanupVerified flag to report whether the cleanup actually succeeded
 */
import { ProtectionLevel } from '../shared/types';
import { BrowserAdapter } from './browserAdapter';
import { EventBus } from './eventBus';

export class StorageController {
  private static instance: StorageController;
  private sessionStartTime = 0;
  private isIsolated = false;
  private cleanupVerified = false;
  private eventBus: EventBus;

  private constructor() {
    this.eventBus = EventBus.getInstance();
  }

  static getInstance(): StorageController {
    if (!StorageController.instance) {
      StorageController.instance = new StorageController();
    }
    return StorageController.instance;
  }

  /**
   * Phase 2: Returns PARTIALLY_PROTECTED while isolation is active.
   * Storage is isolated by CLEANUP ON EXIT, not by a true storage partition.
   * A site visited during the session still writes to the normal browser storage.
   * Data is cleared when the session ends, not prevented from being written during the session.
   */
  getStorageStatus(): ProtectionLevel {
    return this.isIsolated ? 'PARTIALLY_PROTECTED' : 'UNAVAILABLE';
  }

  isCleanupVerified(): boolean {
    return this.cleanupVerified;
  }

  getSessionStartTime(): number {
    return this.sessionStartTime;
  }

  getIsIsolated(): boolean {
    return this.isIsolated;
  }

  /**
   * Restores storage boundary state from persistent storage on service worker restart.
   */
  restoreState(sessionStartTime: number, isIsolated: boolean): void {
    this.sessionStartTime = sessionStartTime;
    this.isIsolated = isIsolated;
  }

  async activateIsolation(): Promise<void> {
    this.sessionStartTime = Date.now();
    this.isIsolated = true;
    this.cleanupVerified = false;

    this.eventBus.emit(
      'STORAGE',
      'INFO',
      'Storage isolation boundary initialized.',
      'Session start time recorded. Cookies, localStorage, cache, and IndexedDB created during this session will be purged on exit. NOTE: Data is not prevented from being written during the session — isolation is enforced at exit time only.'
    );
  }

  /**
   * Phase 2: Cleanup is now verified.
   * Reports true only if chrome.browsingData.remove() confirmed success.
   * If cleanup fails, emits a CRITICAL event so the user knows data may persist.
   */
  async deactivateAndClean(): Promise<{ cookiesCleared: boolean; storageCleared: boolean; verified: boolean }> {
    if (!this.isIsolated) {
      return { cookiesCleared: false, storageCleared: false, verified: false };
    }

    // Clear session browsing data created since sessionStartTime
    const cleared = await BrowserAdapter.clearSessionBrowsingData(this.sessionStartTime);
    this.cleanupVerified = cleared;

    this.isIsolated = false;
    this.sessionStartTime = 0;

    if (cleared) {
      this.eventBus.emit(
        'STORAGE',
        'INFO',
        'Session storage, cookies, and cache purged and verified.',
        'All cookies, localStorage, IndexedDB, and cache created during this session have been removed from the browser.'
      );
    } else {
      this.eventBus.emit(
        'STORAGE',
        'CRITICAL',
        'Storage cleanup FAILED: browser data from this session may persist.',
        'chrome.browsingData.remove() returned an error. Session cookies and storage may not have been cleared. Manual browser data clearing is recommended. Check browser permissions for the browsingData API.'
      );
    }

    return {
      cookiesCleared: cleared,
      storageCleared: cleared,
      verified: cleared,
    };
  }
}
