/**
 * ShadowBrowse In-Page Guard (Runs in MAIN world)
 * Detects invasive fingerprint probes and dispatches telemetry events to content script.
 */

(function () {
  const sbNamespace = '__SHADOWBROWSE_GUARD__';
  if ((window as unknown as Record<string, boolean>)[sbNamespace]) return;
  (window as unknown as Record<string, boolean>)[sbNamespace] = true;

  function notifySignal(type: string, detail: string) {
    window.postMessage(
      {
        source: 'SHADOWBROWSE_PAGE_SIGNAL',
        type,
        detail,
      },
      '*'
    );
  }

  // 1. Canvas Fingerprinting Detection
  try {
    const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      if (this.width > 16 && this.height > 16) {
        notifySignal('CANVAS', `toDataURL (${this.width}x${this.height})`);
      }
      return origToDataURL.apply(this, args);
    };

    const origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
    CanvasRenderingContext2D.prototype.getImageData = function (...args) {
      if (args[2] > 16 && args[3] > 16) {
        notifySignal('CANVAS', `getImageData (${args[2]}x${args[3]})`);
      }
      return origGetImageData.apply(this, args);
    };
  } catch (e) {
    // Ignore DOM restriction errors
  }

  // 2. WebGL Hardware / Renderer Probing Detection
  try {
    const origGetParameter = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (param: number) {
      // 0x9245 = UNMASKED_VENDOR_WEBGL, 0x9246 = UNMASKED_RENDERER_WEBGL
      if (param === 0x9245 || param === 0x9246) {
        notifySignal('WEBGL', `WebGL hardware probe param 0x${param.toString(16)}`);
      }
      return origGetParameter.apply(this, [param]);
    };
  } catch (e) {
    // WebGL not supported or restricted
  }

  // 3. WebAudio Fingerprinting Probing Detection
  try {
    if (window.AudioContext || (window as unknown as { webkitAudioContext: unknown }).webkitAudioContext) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const origCreateOscillator = AudioCtx.prototype.createOscillator;
      AudioCtx.prototype.createOscillator = function (...args) {
        notifySignal('AUDIO', 'createOscillator invoked for audio synthesis probe');
        return origCreateOscillator.apply(this, args);
      };
    }
  } catch (e) {
    // AudioContext not supported
  }
})();
