# 3awedlou · Web app

Dashboard for the 3awedlou smart PET recycling machine.
Built with **React 18 + Vite 5 + TypeScript** — no UI framework, custom design
system in `src/styles` (brand green identity).

The app talks to the **same Symfony backend as the mobile app** — one API, one
JWT scheme, one contract (see [`../backend/docs/api-contract.md`](../backend/docs/api-contract.md)).

## Run it

1. Start the Symfony backend (see `../backend/README.md`) — by default on
   `http://127.0.0.1:8000`.
2. Create `.env` (or copy `.env.example`):
   ```
   VITE_API_BASE_URL=http://127.0.0.1:8000/api
   VITE_REALTIME_URL=
   VITE_ENVIRONMENT=development
   ```
3. `npm install && npm run dev` → http://localhost:5173

Dev accounts (loaded by backend fixtures, dev only): `anouer@3awedlou.app` /
`3awedlou-dev`.

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run build` | Type-safe production build |
| `npm run preview` | Preview the production build |

## Architecture

```
src/
├── api/
│   ├── client.ts            # fetch + Bearer token + envelope + 401 flow (single seam)
│   ├── auth.ts              # login / register / me / logout
│   └── machines.ts          # machines, telemetry, sessions, production, recycling, commands
├── realtime/
│   └── realtimeService.ts   # connect/subscribe/onTelemetry — polling today, WS later
├── types/
│   └── api.ts               # API contract types (mirror of mobile-app/data/api.ts)
├── contexts/
│   ├── AuthContext.tsx      # login / register / session restore / single logout path
│   ├── MachineContext.tsx   # API-backed machine state (sensors, sessions, alerts)
│   ├── ThemeContext.tsx     # light/dark/system theme
│   └── ToastContext.tsx     # toasts
├── pages/                   # Dashboard, Machine, Recycling, Filament, Impact, History, Settings, Login
├── components/              # layout, ui kit, charts, icons
├── lib/                     # router (hash), format, csv, useAsync
└── data/types.ts            # UI-only types + re-exports of the contract
```

Key rules:

* **One API contract** — `src/types/api.ts` mirrors the backend exactly; never
  invent field names locally.
* **Auth is centralized** — components never read tokens; `api/client.ts` attaches
  the Bearer token, `AuthContext` owns the session, 401 → single logout path.
* **Machine actions are guarded commands** — start/pause/resume/stop go through
  `POST /machines/{id}/commands`; the backend validates state and safe ranges
  before anything reaches hardware.
* **No fabricated data** — sensors show what the machine last reported; totals
  come from measured recycling records; estimates (bottles, CO₂e) are labelled.
* **Honest realtime** — without a realtime URL the dashboard polls every 10 s and
  says so in the UI; `RealtimeService` is already the WebSocket contract.
