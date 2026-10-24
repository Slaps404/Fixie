# #0 Foundation: contracts, config, events (DONE)
**Owner:** Lane A · **Status:** ✅ landed 2:50 PM

- `server/src/types.ts`, `contracts.ts` (**frozen**), `config.ts` (caps, per-lane modes, epoch), `events.ts` (SSE, `maskPhone`), `index.ts` (mounts `register(app)` from `vapi/webhook.ts` and `routes.ts`).
- Seeds: `data/parts.json` (WP3392519 with 7 install steps; NOx sensor for SPN 3226 FMI 4), `data/roster.example.json`.
- `.env.example`, `.gitignore` (env, roster, runtime data).

**Acceptance:** `npm run typecheck` passes. `npm start` serves `/health`, `/events`, `/events.json`.
