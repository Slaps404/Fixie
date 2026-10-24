# #7 Integration, live wiring, rehearsal
**Owner:** Lane A (Jianan + Claude) · **Depends on:** #1–#4, keys from #6 · **Target:** sim end-to-end 4:00, live end-to-end 4:30

1. Merge the workstreams: typecheck, `npm test`, `SIM_SPEED=4 npm start` + `npm run demo:sim` green.
2. Wire `ensureInbound()` into `index.ts` boot.
3. Keys in → start one long-running cloudflared tunnel → set `PUBLIC_URL` → `npm run setup:vapi` → put the assistant id in `.env` → `npm run preflight` all ✅.
4. **First live call** (unverified items from the review, prove them now):
   - Do webhooks arrive for transient assistants?
   - Is `call.name` echoed?
   - Is `cost` present in the end-of-call report?
   - Does `controlUrl` end-call work?
   - What concurrency limit does the account have?
5. Live lane by lane: intake → one supplier → all sourcing → callback → delivery. Use `POST /demo/mode` to keep un-ready lanes in sim.
6. Rehearse ×3 on the real phones. Then freeze at 5:30 and record the backup.
