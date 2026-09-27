# ShadowBrowse Security Model

## 1. Extension-to-Agent Security Architecture

The communication boundary between the Chromium extension and the local daemon (`shadow-agent`) is hardened against unauthorized local access, cross-site request forgery, and privilege escalation:

```
[ Web Page (Untrusted) ]
           │
           │ (Blocked: Origin Check + Missing Token)
           ▼
[ Local Shadow Agent (127.0.0.1:9152) ] ◄─── (Allowed: Valid Token + chrome-extension:// Origin)
                                                 │
                                     [ ShadowBrowse Extension ]
```

### Security Controls:
1. **Localhost-Only Binding**: The agent binds strictly to `127.0.0.1` and `::1`. It is inaccessible across LAN or WAN interfaces.
2. **Origin Validation**: The agent checks the `Origin` and `Referer` headers. Web origins (e.g. `https://evil-site.com`) are rejected with `403 Forbidden`. Only `chrome-extension://*` or localhost tooling is allowed.
3. **Secret Token Authentication**: All mutating or sensitive commands (`/api/v1/session/start`, `/api/v1/session/stop`, `/api/v1/network/status`, `/api/v1/diagnostics`) require the `X-Shadow-Token` header.
   - The token is a 256-bit cryptographic hex string generated on first launch.
   - Stored in `~/.shadowbrowse/agent.token` with restricted permissions (0600).
4. **Rate Limiting**: An in-memory sliding window throttles requests to a maximum of 60 requests per minute per IP, preventing denial of service or probe brute-forcing.
5. **No Arbitrary Shell Execution**: The agent contains zero shell execution endpoints or file upload handlers.

---

## 2. Fail-Closed Network Kill Switch

If the user activates Tor mode and Tor connectivity drops unexpectedly:
1. **Silent Fallback Prevented**: ShadowBrowse refuses to silently fall back to direct ISP routing while displaying "Anonymous".
2. **State Transition**: State updates to `FAILED`.
3. **Proxy Blackhole**: Traffic is instantly directed to a dead local discard port (`127.0.0.1:9`), cutting off network egress and preventing accidental plain-text IP disclosure.
4. **User Prompts**: The UI displays `PRIVACY CONNECTION LOST` with options to Reconnect, End Session, or Explicitly Fall Back.
