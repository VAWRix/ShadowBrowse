import React, { useState } from 'react';
import { Terminal, Send } from 'lucide-react';
import { SystemPrivacyOverview, AutopsyReport } from '../shared/types';

interface Message {
  sender: 'USER' | 'ASSISTANT';
  text: string;
  timestamp: number;
}

interface ChatProps {
  overview: SystemPrivacyOverview | null;
  autopsy: AutopsyReport | null;
}

export const Chat: React.FC<ChatProps> = ({ overview, autopsy }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'ASSISTANT',
      text: 'ShadowBrowse Privacy Assistant initialized. I operate locally on your machine with zero cloud telemetry. You can ask what this website can see, why a site is risky, or check your anonymous session status.',
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState('');

  const generateLocalAnswer = (query: string): string => {
    const q = query.toLowerCase();
    const isProtected = overview?.state === 'PROTECTED';
    const netMode = overview?.network.mode || 'DIRECT';
    const torActive = overview?.network.torStatus === 'CONNECTED';

    if (q.includes('identify me') || q.includes('who am i')) {
      if (isProtected && torActive) {
        return `ShadowBrowse has masked your network identity through Tor routing. However, if you log into an account on this site or submit forms containing personal details, the site will identify you through voluntary authentication. Fingerprint exposure is currently ${overview?.fingerprint.exposure || 'LOW'}.`;
      } else if (isProtected) {
        return `Your session storage is isolated and fingerprint normalization is active, but network anonymity is currently in mode [${netMode}]. Your public IP address is not Tor-masked.`;
      }
      return 'Anonymous Session is currently INACTIVE. The website can observe your direct IP address, persistent cookies, and browser characteristics.';
    }

    if (q.includes('risky') || q.includes('exposure') || q.includes('autopsy')) {
      if (!autopsy) {
        return 'No website autopsy report is available yet for this tab. Click "ANALYZE SITE" to run a structural privacy scan.';
      }
      return `On ${autopsy.domain}, we observed ${autopsy.thirdParty.uniqueDomains.length} third-party connection(s), ${autopsy.trackingSignals.knownTrackers.length} known tracker(s), and ${autopsy.fingerprinting.canvasDetected ? 'active canvas fingerprint probing' : 'no active canvas probes'}. Overall exposure index is ${autopsy.exposureScore}/100 (${autopsy.privacyExposure} EXPOSURE).`;
    }

    if (q.includes('what can this site see') || q.includes('what does it see')) {
      return `The current website can observe your HTTP/HTTPS request headers, your current browser viewport, and any cookies stored under its domain. With ShadowBrowse active, WebRTC non-proxied UDP leaks are disabled and session cookies will be purged on exit.`;
    }

    if (q.includes('search') || q.includes('keep my search') || q.includes('history')) {
      return 'ShadowBrowse does NOT maintain a persistent search-history database. The current anonymous session contains only temporary in-memory state required for real-time privacy controls.';
    }

    if (q.includes('tor')) {
      return torActive
        ? 'Tor circuit is active and verified by the local Shadow Agent. All Chromium TCP traffic is routed through encrypted onion nodes with remote DNS resolution.'
        : 'Tor is currently NOT CONNECTED. To enable genuine Tor routing, start the local Shadow Agent daemon with Tor enabled.';
    }

    return `Based on active telemetry: State is ${overview?.state || 'OFF'}. Storage isolation is ${overview?.storage.status || 'UNAVAILABLE'}. Fingerprint exposure is ${overview?.fingerprint.exposure || 'LOW'}. No data is ever transmitted outside your device.`;
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMsg: Message = {
      sender: 'USER',
      text: input.trim(),
      timestamp: Date.now(),
    };

    const replyText = generateLocalAnswer(input.trim());
    const assistantMsg: Message = {
      sender: 'ASSISTANT',
      text: replyText,
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg, assistantMsg]);
    setInput('');
  };

  const handleQuickPrompt = (prompt: string) => {
    setInput(prompt);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-140px)]">
      {/* Messages Scroll Area */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`p-3 rounded-lg text-xs leading-relaxed ${
              m.sender === 'USER'
                ? 'bg-[#1d2536] text-slate-100 ml-6 border border-[#2d3a54]'
                : 'bg-[#10141d] text-slate-300 mr-4 border border-[#1f2737]'
            }`}
          >
            <div className="flex items-center gap-1.5 mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              {m.sender === 'ASSISTANT' ? (
                <>
                  <Terminal className="w-3 h-3 text-[#8b5cf6]" />
                  <span>Privacy Assistant</span>
                </>
              ) : (
                <span>You</span>
              )}
            </div>
            <div>{m.text}</div>
          </div>
        ))}
      </div>

      {/* Suggested Quick Queries */}
      <div className="py-2 flex flex-wrap gap-1.5 text-[10px]">
        <button
          onClick={() => handleQuickPrompt('Can this website identify me?')}
          className="px-2 py-1 bg-[#161c28] hover:bg-[#1f2737] rounded border border-[#1f2737] text-slate-300 transition-colors"
        >
          Can this site identify me?
        </button>
        <button
          onClick={() => handleQuickPrompt('Why is this site considered risky?')}
          className="px-2 py-1 bg-[#161c28] hover:bg-[#1f2737] rounded border border-[#1f2737] text-slate-300 transition-colors"
        >
          Why is this site risky?
        </button>
        <button
          onClick={() => handleQuickPrompt('Did you keep my search?')}
          className="px-2 py-1 bg-[#161c28] hover:bg-[#1f2737] rounded border border-[#1f2737] text-slate-300 transition-colors"
        >
          Did you keep my search?
        </button>
      </div>

      {/* Input Box */}
      <div className="pt-2 border-t border-[#1f2737] flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          placeholder="Ask privacy assistant..."
          className="flex-1 bg-[#10141d] border border-[#1f2737] rounded-md px-3 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-[#8b5cf6]"
        />
        <button
          onClick={handleSend}
          className="btn-primary px-3"
          title="Send"
        >
          <Send className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
