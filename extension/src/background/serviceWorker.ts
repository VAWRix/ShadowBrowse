import { PrivacyController } from './privacyController';
import { EventBus } from './eventBus';
import { BrowserAdapter } from './browserAdapter';
import { TrackerDefenseController, CURATED_TRACKER_RULES } from './trackerDefenseController';
import { SENSITIVE_IDENTITY_DOMAINS } from '../shared/constants';
import { ExtensionMessage } from '../shared/types';

const privacyController = PrivacyController.getInstance();
const eventBus = EventBus.getInstance();
const trackerDefenseController = TrackerDefenseController.getInstance();

// Expose internal controllers for testability and runtime verification
(globalThis as any).__shadowbrowse = { privacyController, eventBus, BrowserAdapter, trackerDefenseController };

// Initialize privacy controller on service worker boot
privacyController.initialize().catch((err) => {
  console.error('[ShadowBrowse SW] Init failed:', err);
});

// Listen to messages from popup, sidepanel, and content scripts
chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_PRIVACY_OVERVIEW': {
          const overview = await privacyController.getOverview();
          sendResponse({ success: true, data: overview });
          break;
        }

        case 'START_ANONYMOUS_SESSION': {
          const ok = await privacyController.startAnonymousSession();
          const overview = await privacyController.getOverview();
          sendResponse({ success: ok, data: overview });
          break;
        }

        case 'END_ANONYMOUS_SESSION': {
          const ok = await privacyController.endAnonymousSession();
          const overview = await privacyController.getOverview();
          sendResponse({ success: ok, data: overview });
          break;
        }

        case 'GET_SECURITY_EVENTS': {
          const events = eventBus.getEvents(50);
          sendResponse({ success: true, data: events });
          break;
        }

        case 'GET_SETTINGS': {
          await privacyController.ensureInitialized();
          const settings = privacyController.getSettings();
          sendResponse({ success: true, data: settings });
          break;
        }

        case 'UPDATE_SETTINGS': {
          await privacyController.ensureInitialized();
          await privacyController.updateSettings(message.payload);
          sendResponse({ success: true, data: privacyController.getSettings() });
          break;
        }

        case 'CHECK_AGENT_HEALTH': {
          const health = await privacyController.checkAgentHealth();
          sendResponse({ success: true, data: health });
          break;
        }

        case 'CLEAR_LOCAL_DATA': {
          await BrowserAdapter.clearLocalStorage();
          eventBus.clear();
          sendResponse({ success: true });
          break;
        }

        case 'OPEN_SIDEPANEL': {
          const tabId = sender.tab?.id;
          await BrowserAdapter.openSidePanel(tabId);
          sendResponse({ success: true });
          break;
        }

        case 'PAGE_SECURITY_EVENT': {
          const evt = message.payload;
          eventBus.emit(evt.category, evt.severity, evt.technicalReason, evt.userExplanation);
          sendResponse({ success: true });
          break;
        }

        case 'PAGE_AUTOPSY_REPORT': {
          // Autopsy data from content script — record it for side panel display
          // No external network calls — purely local analysis storage
          sendResponse({ success: true });
          break;
        }

        case 'IDENTITY_WARNING_DISMISS': {
          privacyController.dismissIdentityWarning();
          sendResponse({ success: true });
          break;
        }

        case 'GET_STARTUP_PROGRESS': {
          const progress = privacyController.getStartupProgress();
          sendResponse({ success: true, data: progress });
          break;
        }

        case 'VERIFY_ROUTE': {
          const health = await privacyController.checkAgentHealth();
          sendResponse({ success: true, data: health });
          break;
        }

        case 'SET_TRACKER_MODE': {
          await trackerDefenseController.setTrackerMode(message.payload);
          await privacyController.updateSettings({ trackingProtectionMode: message.payload });
          sendResponse({ success: true, data: trackerDefenseController.getStats() });
          break;
        }

        case 'SET_PARAM_MODE': {
          await privacyController.updateSettings({ trackingParamMode: message.payload });
          sendResponse({ success: true, data: privacyController.getSettings() });
          break;
        }

        case 'SET_REFERRER_MODE': {
          await trackerDefenseController.setReferrerMode(message.payload);
          await privacyController.updateSettings({ referrerProtectionMode: message.payload });
          sendResponse({ success: true, data: trackerDefenseController.getStats() });
          break;
        }

        case 'GET_TRACKER_RULES': {
          sendResponse({ success: true, data: CURATED_TRACKER_RULES });
          break;
        }

        case 'GET_TRACKER_STATS': {
          sendResponse({ success: true, data: trackerDefenseController.getStats() });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
          break;
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      console.error('[ShadowBrowse SW] Message handler error:', errorMessage);
      sendResponse({ success: false, error: errorMessage });
    }
  })();

  return true; // Keep sendResponse asynchronous channel open
});

// Identity Leak Monitoring: Inspect navigation URLs during active anonymous session
chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
  if (changeInfo.url && tab.url) {
    const isProtected = privacyController.getState() === 'PROTECTED';
    if (!isProtected) return;

    try {
      const parsed = new URL(tab.url);
      const hostPath = parsed.hostname + parsed.pathname;

      const isSensitive = SENSITIVE_IDENTITY_DOMAINS.some((domain) =>
        hostPath.toLowerCase().includes(domain.toLowerCase())
      );

      if (isSensitive) {
        privacyController.setIdentityWarning(
          parsed.hostname,
          `Visiting an authentication endpoint (${parsed.hostname}) during an anonymous session can link your real identity to this session. Network anonymity does not prevent voluntary account sign-in. Consider whether you need to be logged in during this session.`
        );
      }
    } catch {
      // Invalid URL or chrome:// internal page
    }
  }
});
