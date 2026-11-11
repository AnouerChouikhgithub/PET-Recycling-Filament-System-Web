# AI assistant — web integration (session 3)

Status: **implemented and verified against a local backend for every HTTP path
reachable without an Anthropic key.** The live provider round trip is
**Blocked** (no `ANTHROPIC_API_KEY` on this machine) and is written down as
such below — nothing in this document claims a real model call was exercised.

Companion design note: [ai-agent-ui.md](./ai-agent-ui.md) (pre-implementation
design; its SSE section is superseded — see §9).

---

## 1. Architecture and integration point

The assistant is a **normal page inside the existing authenticated shell**, not
a separate app:

```
src/lib/router.ts                 route 'agent'          → #/agent
src/components/layout/Sidebar.tsx nav item "Assistant"   → discoverable in the shell
src/App.tsx                       <AgentChatPage />      → rendered inside MachineProvider
src/pages/AgentChatPage.tsx       page + layout + lifecycle actions
```

It reuses the existing infrastructure unchanged:

| Concern | Reused |
|---|---|
| HTTP + JWT + envelope + 401 handling | `src/api/client.ts` (`request`/`requestRaw`) |
| Auth state and session restoration | `src/contexts/AuthContext.tsx` (untouched) |
| Machine data (data-source strip only) | `src/contexts/MachineContext.tsx` (untouched) |
| Toasts, modal, cards, buttons, badges | `src/contexts/ToastContext.tsx`, `src/components/ui/*` |
| Design tokens (greens, radii, shadows, dark/light) | `src/styles/tokens.css` + new `src/styles/agent.css` |

No second polling loop is introduced: the chat is request/response, and the
dashboards keep their existing 10 s refresh (the known hidden-tab polling
issue is **not** touched, per the session rules).

## 2. Components and API modules introduced

| File | Purpose |
|---|---|
| `src/api/agent.ts` | Typed agent API: `chat()`, `deleteConversation()`, `deleteAllConversations()`, response normalization, error mapping |
| `src/types/api.ts` (appended) | Agent contract types (tool calls, assistant message, usage, delete results) |
| `src/lib/agentChat.ts` | Pure helpers: message validation (1..4000), tool-call presentation, transcript ids |
| `src/lib/telemetryFreshness.ts` | Freshness labels (120 s / 600 s), `"Not reported"` channel formatting |
| `src/lib/useAgentChat.ts` | Chat state machine: idle/sending/success/error, explicit retry, conversation lifecycle |
| `src/components/agent/MessageBubble.tsx` | One transcript bubble (text-only rendering) |
| `src/components/agent/ToolCallList.tsx` | Tool pills (human label + backend summary) |
| `src/components/agent/Composer.tsx` | Labelled textarea, Enter/Shift+Enter, pending state, counter |
| `src/components/agent/SuggestedPrompts.tsx` | Five prompts mapped to the five real tools |
| `src/components/agent/AgentNotices.tsx` | Failure notice, machine data strip, stale warning, unavailable state |
| `src/pages/AgentChatPage.tsx` | Page assembly (header, log, scroll strategy, delete flows) |
| `src/styles/agent.css` | Assistant styling (tokens only, responsive, reduced motion) |

Client extensions to shared code (kept minimal and behaviour-preserving):

* `src/api/client.ts`: `ApiError` now carries optional response `headers`
  (needed for `Retry-After`); new `requestRaw<T>()` returns
  `{ data, meta, status, headers }`; `request()` delegates to it, so every
  existing call site behaves exactly as before; `api.del()` added for the two
  DELETE routes.
* `src/components/icons.tsx`: added `SparklesIcon`, `SendIcon`, `TrashIcon`
  (existing icon conventions).
* `src/lib/router.ts`, `src/components/layout/Sidebar.tsx`, `src/App.tsx`,
  `src/main.tsx`: route/nav/style wiring.

## 3. Backend endpoints actually used

Verified against the committed Symfony controller
(`src/Controller/Api/AgentController.php`), the exception subscriber
(`src/Api/EventSubscriber/ApiExceptionSubscriber.php`) and
`backend/docs/api-contract.md`:

| Method | Path | Used for |
|---|---|---|
| `POST` | `/api/agent/chat` | one turn; body `{ conversationId?, message }` |
| `DELETE` | `/api/agent/conversations/{id}` | "Delete conversation" |
| `DELETE` | `/api/agent/conversations` | "Delete all history" |

**There is no conversation-list or history endpoint.** The client therefore
sends only the new message; the server loads the last `AGENT_CONTEXT_MESSAGES`
(12) messages itself. The transcript on screen is display state and is never
re-sent.

### Request / response examples (fake data)

```http
POST /api/agent/chat
Authorization: Bearer <user JWT>
Content-Type: application/json
Accept: application/json

{ "conversationId": "01a146d8-977e-75d4-9d0d-1dca66a29096", "message": "What is the latest telemetry for my machine?" }
```

```json
{ "success": true,
  "data": { "conversationId": "01a146d8-977e-75d4-9d0d-1dca66a29096",
            "message": { "id": "01a146d8-97d6-...", "role": "assistant",
                         "content": "Your extruder is at 212.4 °C, reported 5 s ago.",
                         "toolCalls": [{ "name": "get_latest_telemetry", "summary": "get_latest_telemetry: 12 row(s)" }],
                         "createdAt": "2026-10-16T22:41:00+00:00" } },
  "meta": { "usage": { "input": 512, "output": 96 } } }
```

```json
{ "success": true, "data": { "deleted": true, "conversationId": "01a146d8-..." } }
{ "success": true, "data": { "deleted": true, "count": 2 } }
```

The first turn omits `conversationId` entirely; the backend creates the
conversation and returns its id, which the client stores **in memory** and
reuses for the next turn.

### Wire-level finding (doc drift) — the disabled surface

`AgentController` throws `NotFoundHttpException('AGENT_DISABLED')`, and
`ApiExceptionSubscriber::errorCodeFor()` maps every 404 to the generic code
`NOT_FOUND`. The real body when `AGENT_ENABLED=false` is therefore:

```json
{ "success": false, "error": { "code": "NOT_FOUND", "message": "AGENT_DISABLED" } }   // HTTP 404
```

The design documents call this "404 `AGENT_DISABLED`", which is only true for
the *message*; the *code* is `NOT_FOUND`. The client maps by
status 404 + code, not by the phrase in the docs:

* 404 + `AGENT_NOT_FOUND` → conversation gone (the client drops the id and the
  next message starts a new conversation)
* 404 + anything else (`NOT_FOUND`) → the assistant surface is switched off
* both were verified live (§8)

Nothing in the backend was changed for this session; the mismatch is reported
here rather than patched.

## 4. Authentication behaviour

* The user JWT is attached by the existing client (`Authorization: Bearer …`)
  from the single token store; the agent module never touches tokens itself.
* `401` anywhere (including the agent) runs the existing single-logout path in
  `AuthContext`; the chat additionally shows "Your session has expired."
* No credentials, provider keys or `ANTHROPIC_API_KEY` ever reach the browser:
  the client only ever calls the 3awedlou API. This is enforced by an
  architectural test (§7).
* Ownership is enforced server-side; the client can only ever act on the
  conversation id it received. A foreign/soft-deleted id behaves as 404.

## 5. Local configuration

The web app needs the API base URL only (`.env`):

```
VITE_API_BASE_URL=http://127.0.0.1:8000/api
VITE_REALTIME_URL=
VITE_ENVIRONMENT=development
```

No agent-specific variable, no key, no secret. The assistant appears in the
navigation for every signed-in user; if the backend has `AGENT_ENABLED=false`
the page reports "Assistant not available" the first time a message is sent
(before that, nothing is known about the flag — there is no probe endpoint and
issuing one would consume the user's own rate-limited budget).

## 6. Running the app and the tests

```
npm install                 # or: npm install --legacy-peer-deps, see below
npm run dev                 # Vite dev server (5173, or the next free port)
npm run typecheck           # tsc --noEmit
npm test                    # vitest run (jsdom + React Testing Library)
npm run build               # production build
```

Npm note: this checkout's `npm install` can crash inside npm's Arborist
(`Cannot read properties of null (reading 'edgesOut')`, a known npm 10 bug hit
while resolving `jsdom`'s optional `canvas` peer). Use
`npm install --legacy-peer-deps` if that happens; the resulting
`package-lock.json` is complete either way.

Pointing the app at a different backend for a local smoke test works with a
real environment variable (it wins over `.env`):

```
VITE_API_BASE_URL=http://127.0.0.1:8010/api npm run dev
```

## 7. Automated tests

The checkout had **no client test stack** (`npm test` was undefined). Because
this session's acceptance criteria require API-client, UI and integration
tests, `vitest`, `jsdom`, `@testing-library/react` and `@testing-library/dom`
were added as **devDependencies** plus a `vitest.config.ts`; nothing is added to
the application bundle.

| File | Covers |
|---|---|
| `src/__tests__/agentApi.test.ts` | path/method/headers/body, first-turn vs continuation payload, envelope parsing, malformed response refusal (`malformed`), 401/404-disabled/404-not-found/422/429-rate-limit/429-daily-cap/503/network/abort/500 mapping, `Retry-After` parsing, no auto-retry (exactly one request), no token or message in the URL, conversation deletes |
| `src/__tests__/agentHelpers.test.ts` | 1..4000 validation (trimmed length), the five tool labels, failed-vs-ok tool summaries, freshness boundaries 120 s/600 s and unknown/invalid timestamps, `"Not reported"` never rendered as 0, age formatting |
| `src/__tests__/agentChatPage.test.tsx` | initial state, suggested prompts, send flow + documented payload, conversation continuation, pending lock (no duplicate POST), Enter vs Shift+Enter, failure notice + explicit retry (no duplicate question), rate-limit countdown (composer disabled), daily cap, disabled surface, expired session, network retry, conversation-gone recovery, oversized/empty draft, unsafe-content rendering, `"Not reported"` preserved, stale-data banner, delete one/all with confirmation, a11y (log role/`aria-live`, `aria-invalid`, valid/invalid states) |
| `src/__tests__/agentArchitecture.test.ts` | source-level regression: no `sendMachineCommand`, no `/commands`, no machine API import, no `realtimeService` (no second poller), no provider/anthropic/sk-ant/`process.env` reference, no `dangerouslySetInnerHTML`/`.innerHTML=`/`eval`/`new Function`, text-only renderer, router/sidebar/App/style wiring |

Automated tests never need an API key and never touch the network (the
transport is a stubbed `fetch`).

## 8. Verification actually performed

| Command / check | Result |
|---|---|
| `npm run typecheck` (`tsc --noEmit`) | exit 0 |
| `npm test` | **4 files, 81 tests, all passing**, exit 0 |
| `npm run build` (`vite build`) | exit 0 — `dist/index.html` 0.89 kB, CSS 41.08 kB, JS 262.65 kB (gzip 78.96 kB) |
| Live HTTP contract, local backend (`APP_ENV=test`, deterministic stub transport, `AGENT_ENABLED=true`) | `POST /api/agent/chat` → **200** with `{conversationId, message{id,role,content,toolCalls,createdAt}}` + `meta.usage`; `422` oversized with `details.message`; `401` without a token; `404 AGENT_NOT_FOUND` for an unknown conversation |
| Live disabled flag (`AGENT_ENABLED=false`) | `POST /api/agent/chat` → **404** `{"code":"NOT_FOUND","message":"AGENT_DISABLED"}` |
| Browser (Chromium, dev server on :5174 → backend :8010) | login → `#/agent`; suggested-prompt turn rendered a real 200 answer; second turn via Enter; no console errors; every request went to the configured backend (CORS preflights 200) |
| Browser rendering checks | `.agent-msg-text` computed `white-space: pre-wrap`; exactly one user + one assistant bubble per turn; suggested prompts hide after the first turn; log is `aria-live="polite"`; send button disabled for an empty draft; input cleared only on a successful send |
| Browser disabled-flag check | after restarting the backend with the flag off, the next message replaced the chat with the "Assistant not available" state (composer and notice removed) — confirming the wire finding above end to end |
| Browser transient-failure + retry check | with the backend stopped, a send produced the `role="alert"` notice "No answer produced / Cannot reach the 3awedlou server", the question stayed on screen and **no assistant bubble was added**; after restarting the backend, the explicit **Retry** returned a live 200 answer, the notice cleared, and the transcript held exactly 2 questions / 2 answers (the retry did not duplicate the question) |
| README link checker | `node scripts/check-readme-links.mjs` → "all relative links and image paths exist", exit 0 |
| Responsive check at 390 × 844 | no horizontal overflow (`scrollWidth 380 ≤ 390`), `.agent-layout` collapsed to one column, sidebar collapsed behind "Open menu" |
| Session/reload behaviour | reload restored the session from the stored token (data strip rendered) and the transcript reset — expected, see §9 |

Not performed (and not claimed): a real Anthropic round trip (no key); a live
`503 AGENT_LLM_UNAVAILABLE` response (it needs the real client with no key, and
the one attempt to reach it on a separate port hit an unrelated database that
lacks the agent tables, so the provider failure is covered by the mapping tests
and the backend suite instead); and a live run against the user's own dev
backend on :8000 (a separate, already running process — all live checks used a
dedicated test-environment server on :8010 so nothing of theirs was touched).

Screenshot note: the first two browser checks were captured as screenshots
(desktop answer view, narrow-width view). Later `preview_screenshot` calls
failed with "the preview webview is not being composited" after the viewport
was resized; the remaining browser checks were therefore verified through DOM,
network and wait conditions rather than pixels — they are reported as such and
not as screenshots.

## 9. Known limitations and gaps

1. **No conversation history endpoint** → the transcript lives in page memory:
   reloading or leaving `#/agent` clears it and the next message starts a new
   conversation. The UI never claims otherwise. A history endpoint would need a
   new backend route (`GET /api/agent/conversations/{id}`) in a future session.
2. **Per-turn telemetry freshness is not exposed structurally.** The API
   returns `toolCalls: [{name, summary}]` where `summary` is only
   `"<tool>: N row(s)"`/`"<tool>: <CODE>"` — no timestamp, no staleness label.
   The assistant's own prose *may* mention staleness, but model text is not a
   trustworthy machine signal, so the UI does **not** parse it. Instead it
   (a) shows the machine's newest reported sample age from the same backend
   records, using the backend's own 120 s/600 s thresholds, and
   (b) keeps an always-visible "answers can be out of date" note and flags tool
   calls that reported a failure code. A per-answer stale badge needs the
   backend to expose `toolResults[].staleness` (or similar) — recommended for
   the next backend session.
3. **A failed turn leaves the user row server-side.** `AgentOrchestrator`
   persists and flushes the user message before calling the provider, so a 503
   leaves that question in the conversation. An explicit retry therefore
   re-appends it to the server-side context (the visible transcript stays
   clean). An idempotency key or a rollback of the failed turn would fix this
   centrally — recommended for the backend.
4. **No cancel/"stop" button.** The contract is non-streaming and the backend
   keeps working on the turn after a client disconnect, so a client-side cancel
   would be a lie. Only unmount aborts the request (documented in the hook).
5. **The disabled flag is discovered on first use** (no probe endpoint), so the
   navigation entry is always visible; the design note's "hide nav entry on
   404" was not implemented for that reason.
6. **No streaming.** SSE is Future (next session) — the design note's SSE
   section describes a transport the backend does not implement yet.
7. **Nothing is Markdown.** Assistant text is rendered as plain text with
   `white-space: pre-wrap`; no renderer dependency was added, so raw HTML,
   `javascript:` URLs and injected markup cannot execute. If rich text is
   wanted later, a vetted renderer with raw HTML disabled is required.
8. Machine control is untouched: no write tool, no command call, and the
   dashboard/polling behaviour is unchanged (the known hidden-tab polling bug
   is deliberately not fixed in this session).

## 10. Security measures (untrusted content)

* Assistant text and tool labels/summaries are rendered as **text nodes** only
  (`{value}`), with no `dangerouslySetInnerHTML`, no `.innerHTML`, no `eval`,
  no `new Function`, no auto-linking — enforced by an architectural test.
* Tool calls are normalized defensively (string-only `name`/`summary`, capped
  at 20) before rendering.
* A response without a conversation id or assistant content is refused as
  `malformed` instead of being rendered as an empty or partial answer.
* Error messages are fixed client-side strings; server payloads, SQL text,
  provider bodies and stack traces never reach the UI (500/unknown → generic
  message).
* POSTs are never retried automatically: a retry is always an explicit user
  action, so a turn (and its billing) cannot be duplicated by the client.
* Nothing about the chat is written to `localStorage`; no message content is
  logged.

## 11. Accessibility and responsiveness

Labelled composer (`Ask the assistant about your machine`), `aria-invalid` and
`aria-describedby` for validation, transcript exposed as `role="log"` with
`aria-live="polite"`, failures as `role="alert"`, pending state announced
("Checking your machine data…"), keyboard-only operation (Enter sends,
Shift+Enter newline, tab order preserved, visible focus rings from the existing
theme), focus returned to the composer after picking a suggested prompt, focus
moved into the delete-all dialog and back to its trigger, `prefers-reduced-motion`
disables the typing animation and smooth scrolling, and the log auto-scrolls
**only** when the reader is already near the bottom. All colours come from the
existing tokens, so contrast matches the rest of the app in both themes.

## 12. Handoff to the Expo mobile session

Reusable as-is: the contract map in §3, the payload/error table in §8, the
`"Not reported"` + 120 s/600 s freshness rules, the error-kind vocabulary in
`src/api/agent.ts` and the test matrix in §7.

Required before mobile work starts:

1. Decide whether mobile keeps transcripts in memory too (same limitation) or
   whether the backend gains a conversation-history endpoint first (§9.1).
2. Decide the order of the two backend gaps in §9.2/§9.3 (structured
   staleness, failed-turn idempotency) — both are backend changes, and both
   would be consumed by mobile identically.
3. Keep the mobile copy of `src/types/api.ts` in sync with the agent types
   added here (the repo convention is two mirrored copies).
4. Do not add a second polling loop for the chat; the mobile realtime service
   has the same hidden-tab/background issues as the web one.

## 13. Implementation matrix

| Item | Status | Note |
|---|---|---|
| API contract verification | **Implemented** | Read from committed Symfony code, not docs; doc drift found and recorded in §3 |
| Typed API client | **Implemented** | `src/api/agent.ts` — typed request/response, defensive normalization, error kinds |
| Authentication integration | **Implemented** | Reuses `src/api/client.ts` Bearer flow and the existing 401 logout path; no parallel auth |
| Chat UI | **Implemented** | `#/agent` inside the authenticated shell |
| Responsive behavior | **Implemented** | 390 × 844 → no horizontal overflow; single-column layout verified live |
| Accessibility | **Implemented** | `role="log"`/`aria-live`, `role="alert"`, labelled composer, focus return, reduced motion |
| Safe message rendering | **Implemented** | Text nodes only; raw HTML / `javascript:` / `eval` blocked and regression-tested |
| Telemetry freshness presentation | **Implemented** | Newest-sample age + 120 s/600 s labels, `"Not reported"` preserved, never invents state. Per-answer structured staleness is Future (§9.2) |
| Error handling | **Implemented** | All documented kinds mapped; unknown → safe generic; explicit user-only retry |
| Conversation lifecycle | **Implemented** | Start, continue, delete one, delete all. Listing is **Future** — no backend endpoint (§9.1) |
| Automated tests | **Implemented** | 4 files / 81 tests, exit 0 |
| Production build | **Implemented** | `vite build` exit 0, 82 modules |
| Live backend integration | **Implemented** for the HTTP contract against a local dev backend with deterministic stub transport. Real provider round trip is **Blocked** (no key on this machine) |
| Browser verification | **Implemented** | All eight §11 items exercised; later checks credited to DOM/network evidence, not pixels |
| Documentation | **Implemented** | This file, plus the superseded-note banner in `docs/ai-agent-ui.md` |

## 14. Git state at handoff

* Branch: `feat/ai-agent-web`
* `git status --short`: empty
* `git diff --check`: exit 0
* Commits (newest first): `5aeaac3` docs (live retry verification), `abff6c1` docs
  (integration notes), `a2e3c21` test (API/UI/integration/architecture),
  `50099be` feat (responsive chat in app shell), `cde34c8` feat (typed API
  integration), `ac1b813` docs (chat panel design note) — all on top of the
  pre-existing `b871c14` merge.
* Nothing pushed. No backend source file was modified in this session.
