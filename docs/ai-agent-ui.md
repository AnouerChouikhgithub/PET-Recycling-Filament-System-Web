# AI Agent Chat UI - Web (docs only)

Fits the existing app: React 18 + Vite + TypeScript, no router library
(src/lib/router.ts), contexts in src/contexts (Auth, Machine, Theme, Toast),
API calls through src/api/client.ts request() (envelope unwrap, ApiError
with code/status, Bearer token from localStorage). The chat is a client-side
component using the same client; nothing talks to Anthropic directly.

## 1. Entry point & layout

- New page src/pages/AgentChatPage.tsx, reachable from the shell navigation
  like the other pages (router.ts route "agent").
- Two-column layout on desktop: conversation list (left, fetched from
  GET /api/agent/conversations) + active thread (right). Single column
  collapses the list behind a toggle - consistent with existing pages.
- Machine context: a "filter to machine" picker (list_my_machines data via a
  lightweight session variable name) is prepared for phase 2; phase 1 is a
  plain thread.

## 2. Streaming handling

POST /api/agent/chat with Accept: text/event-stream. New module
src/api/agent.ts with a fetch-based SSE reader (fetch + ReadableStream,
because the native EventSource class cannot POST and cannot send the
Authorization header):

    const res = await fetch(`${BASE_URL}/agent/chat`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream',
                 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId, message }),
      signal: abortController.signal,
    })
    // read res.body as text/event-stream, split on \n\n, JSON.parse data:

Frame handling:
- delta -> append to the in-progress assistant bubble (rendered with a
  blinking caret until done).
- tool started/finished -> small inline "calling get_latest_telemetry..."
  pill (section 3).
- pending_action -> confirmation card (phase 2, section 6).
- done -> finalize bubble with message.id + usage; stop the caret.
- error -> map to a non-blocking state (section 5) exactly like ApiError
  elsewhere in the app.

Abort: a "Stop" button calls abortController.abort(); the backend keeps the
turn (see backend doc T6.1), and the UI marks the bubble "(interrupted)".

## 3. Tool-call indicator

- Inline pill per tool call inside the assistant bubble chronology:
  clock icon + "checked latest telemetry" / "looked up events" (human labels
  map from tool names; unknown names fall back to the raw name - they are
  public constants, not data).
- States: in-flight (spinner), finished, error (pill turns amber, no raw
  payload shown - the backend only sends name + summary).
- Everything is also persisted in message.toolCalls so page reloads keep
  the timeline.

## 4. Stale-data banner

If the last-answered turn's tool summary carries a staleness label ("stale"
/ "very stale, telemetry missing"), or the agent message includes the phrase,
render a persistent amber banner pinned above the input box:

    "Telemetry for this machine is stale (last sample 15 min ago). Values may
    not reflect the current state."

Banner is machine-scoped, dismissed per machine and re-shown on new stale
turns. It is DERIVED from received frames (never a client-side fetch - the
chat must not duplicate the dashboard's polling).

## 5. Error and rate-limit states

Reuses the app's toast/alert patterns (ToastContext) plus in-thread
messages:

| Condition                  | UI                                                             |
|----------------------------|----------------------------------------------------------------|
| 429 AGENT_RATE_LIMITED     | banner with Retry-After countdown, input disabled until expiry |
| 429 AGENT_DAILY_TOKEN_CAP  | banner "Daily AI usage limit reached, resets at 00:00 UTC"     |
| 503 AGENT_LLM_UNAVAILABLE  | inline error bubble + retry button (non-streaming fallback first) |
| network/fetch failure      | inline error bubble + retry                                    |
| 401 (session expired)      | the existing client 401 flow (AuthContext) already handles it  |
| 404 AGENT_DISABLED         | page shows "Assistant not available" + hides nav entry         |

Streaming failures after partial output: keep what arrived, mark the bubble
"(incomplete)", show retry that starts a NEW turn (never auto-resubmits the
same turn).

## 6. Phase 2 confirmation card

- pending_action frame renders a card: machine name, command text in plain
  words ("Set target temperature to 195 C"), Confirm / Cancel buttons,
  countdown to expiresAt (5 min).
- Confirm calls the NORMAL machines command endpoint
  (POST /api/machines/{id}/commands) exactly like the dashboard controls do;
  the card then shows "sent for execution (pending device report)" - never
  "done", matching the platform's honesty rules.
- Card is disabled once confirmed/cancelled/expired; refresh from
  conversation history keeps its terminal state.

## 7. Fit with the existing structure & the 10 s polling

- The chat page does NOT subscribe to realtimeService: the agent endpoint
  itself streams. Dashboard pages keep their 10 s polling unchanged.
- KNOWN BUG (record only, do NOT fix here): realtimeService.ts uses a plain
  window.setInterval; browsers throttle timers in hidden tabs, so dashboard
  polling stops/skips when the tab is hidden and bursts on return. The chat
  design deliberately avoids adding a second background poller so the agent
  does not inherit this bug; a future fix should live in realtimeService.ts
  (visibilitychange-based pause/resume) in its own change.
- Components follow the existing split: src/components/agent/* (Bubble,
  ToolPill, StaleBanner, PendingCard), src/api/agent.ts, types in
  src/data/types.ts (mirror of the backend contract, as for api.ts).
- Accessibility: aria-live="polite" on the thread, roles for bubbles,
  keyboard Enter-to-send / Shift+Enter newline; draft persisted in memory
  only (no private text in localStorage beyond what the backend stores).
