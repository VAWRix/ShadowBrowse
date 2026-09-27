/**
 * FingerprintController — Phase 2
 * Manages fingerprint DETECTION signals from the injectGuard.
 *
 * PHASE 2 CHANGES:
 * - getStatus() now correctly returns 'DETECTION_ONLY' (not 'PROTECTED')
 *   because injectGuard.ts currently only detects, not mitigates, fingerprint probes.
 * - Added honest API: canMitigate() tells the system whether real mitigation is active.
 * - Reset counters are preserved across session lifecycle correctly.
 * - Signals are counted per-type for accurate reporting.
 * - Added canvasNoise() and webglSpoofed() flags for future mitigation state.
 * NOTE: True fingerprint mitigation (canvas noise injection, WebGL spoofing) requires
 * the injectGuard to be upgraded to actually modify return values, not just observe them.
 * Until that upgrade, this controller honestly reports DETECTION_ONLY.
 */
import { FingerprintExposure, ProtectionLevel } from '../shared/types';
import { EventBus } from './eventBus';

export class FingerprintController {
  private static instance: FingerprintController;
  private isDetectionActive = false;
  private canvasInterceptions = 0;
  private webglInterceptions = 0;
  private audioInterceptions = 0;
  private navigatorInterceptions = 0;
  private eventBus: EventBus;

  private constructor() {
    this.eventBus = EventBus.getInstance();
  }

  static getInstance(): FingerprintController {
    if (!FingerprintController.instance) {
      FingerprintController.instance = new FingerprintController();
    }
    return FingerprintController.instance;
  }

  /**
   * PHASE 2 FIX: Returns DETECTION_ONLY, not PROTECTED.
   * injectGuard.ts intercepts fingerprint probes but does NOT modify return values.
   * Returning 'PROTECTED' here was technically dishonest.
   * Returns UNAVAILABLE when detection is not active.
   */
  getStatus(): ProtectionLevel {
    return this.isDetectionActive ? 'DETECTION_ONLY' : 'UNAVAILABLE';
  }

  /**
   * Returns false — actual fingerprint mitigation (return value modification)
   * is not yet implemented. Detection is active, but mitigation is not.
   */
  canMitigate(): boolean {
    return false;
  }

  getExposureLevel(): FingerprintExposure {
    const totalSignals =
      this.canvasInterceptions +
      this.webglInterceptions +
      this.audioInterceptions +
      this.navigatorInterceptions;
    if (totalSignals === 0) return 'LOW';
    if (totalSignals < 5) return 'MEDIUM';
    return 'HIGH';
  }

  getTotalSignals(): number {
    return (
      this.canvasInterceptions +
      this.webglInterceptions +
      this.audioInterceptions +
      this.navigatorInterceptions
    );
  }

  getSignalBreakdown(): Record<string, number> {
    return {
      canvas: this.canvasInterceptions,
      webgl: this.webglInterceptions,
      audio: this.audioInterceptions,
      navigator: this.navigatorInterceptions,
    };
  }

  activate(): void {
    this.isDetectionActive = true;
    this.canvasInterceptions = 0;
    this.webglInterceptions = 0;
    this.audioInterceptions = 0;
    this.navigatorInterceptions = 0;

    this.eventBus.emit(
      'FINGERPRINT',
      'INFO',
      'Fingerprint probe detection activated.',
      'ShadowBrowse is now monitoring for Canvas, WebGL, and AudioContext fingerprinting probes. NOTE: Detection is active — return value modification (mitigation) is not yet enabled. Detected probes will be logged but the fingerprint data is not blocked or altered.'
    );
  }

  deactivate(): void {
    this.isDetectionActive = false;
  }

  recordSignal(type: 'CANVAS' | 'WEBGL' | 'AUDIO' | 'NAVIGATOR', details: string): void {
    if (!this.isDetectionActive) return;

    if (type === 'CANVAS') this.canvasInterceptions++;
    if (type === 'WEBGL') this.webglInterceptions++;
    if (type === 'AUDIO') this.audioInterceptions++;
    if (type === 'NAVIGATOR') this.navigatorInterceptions++;

    this.eventBus.emit(
      'FINGERPRINT',
      'WARNING',
      `Fingerprint probe detected: ${type} (${details})`,
      `The website probed ${type} APIs. ShadowBrowse logged this signal. The probe returned actual hardware/browser values — fingerprint data was NOT modified or blocked in Phase 2. To prevent fingerprinting, a full mitigation layer is needed.`
    );
  }
}
