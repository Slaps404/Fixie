<img src="assets/icon.svg" width="64" height="64" alt="">

# Fixie: one phone number for anything physical that breaks

**Call from any phone. Fixie diagnoses it by voice, phones suppliers in parallel, calls you back for a spoken "order it", then coaches the install.** No app, no screen, no smartphone.

**Tracks:** No App (the user never touches a screen) · Unsupervised (a multi-day agent with guardrails that trip for real, plus a kill switch) · Dispatch (a port fault code starts sourcing before the ship docks; sim-only beat)

## The call

Dorothy, 74, has a dryer that runs but won't heat.

1. **She calls one number.** Fixie says it's an AI and that the call is recorded. It diagnoses by voice and identifies the exact part: thermal fuse **WP3392519**. It also flags the real root cause (a clogged vent, a fire risk) and gates on safety.
2. **Fixie places real calls in parallel** to the manufacturer warranty line and to parts suppliers. Quotes are captured *during* the calls by tool calls.
3. **Guardrails trip in code.** An over-budget quote is rejected, and a supplier who declines is skipped.
4. **Fixie calls Dorothy back** on the number she called from: "$13.05 landed, versus a $200 tech visit."
5. **She says "order it."** Nothing is ordered until she does.
6. **Delivery day: Fixie calls again** and walks her through the 15-minute install. The server blocks "restore power" until she confirms the dryer is unplugged and the vent is cleared. Then: **"It's warm!"**

## Why it's different

| | Meta glasses | ChatGPT / Gemini / Grok | Google's AI calling |
|---|---|---|---|
| Diagnoses the problem | Yes | Yes | No |
| Calls parts distributors, closes on a spoken yes | No | No | Partial: local shops and services, results sent by email or text |
| Works with no smartphone, screen or $799 hardware | No | No (inbound phone access only) | No (starts in Search) |
| Safety gate, spend cap and audit log enforced in code | No | No (confirmation rules on screen) | No |

Google's AI can call businesses, and we never claim otherwise. We call distributors by part number, from any phone, behind a safety gate, and we close the order.

## Guardrails that trip for real

Enforced in code, not prompts. Every trip emits a `guard` event with a deterministic reason.

| Guard | Rule | On stage |
|---|---|---|
| budget | landed total ≤ $40 | Valley quotes $55 + $4: rejected |
| no_answer / voicemail | skip, never retry | Coast declines: skipped |
| install safety | no "restore power" step until `unplugged` + `vent_cleared` are acked | Delivery call |
| agent spend | Fixie's own call cost ≤ $3 per job, else stop and end calls | Live meter |
| kill switch | `POST /jobs/:id/stop` ends every live call | Q&A |
| vendor allow-list | only roster numbers or the caller's own number are dialed | Unit-tested |

Also unit-tested: call, minute and loop caps (synchronous `reserve()`, so parallel dials can't race past them), a stuck-call timeout, and smoke/burning/gas keywords that route to a pro or 911.

## Architecture

```
Dorothy ─► Twilio # ─► Vapi "Fixie Intake" ──webhooks──► /vapi/webhook ─► CallEvent ─► orchestrator
                                                                               │
              guards.reserve() (sync) ◄─ dialer.placeGuardedCall() ◄───────────┘
                         │
                         └─► VoiceProvider: vapi/client (live) | vapi/sim (sim, same webhook path)
orchestrator ─► jobs (CAS) · calls · parts ─► events ─► SSE ─► web/ OPERATOR AUDIT VIEW
```

The judge board in `web/` shows live call lanes and transcripts, the quote table with rejected rows struck through, the guard ticker, spend meters, and a SIMULATED badge.

## Quickstart

```bash
cp .env.example .env    # the one secrets file, shared by server/ and site/
cd server && npm i
DRY_RUN=1 npm start     # no keys needed; every call is simulated
npm run demo:sim        # in a second terminal: NEW -> FIXED, asserting the guard events fired
npm run verify          # checks the run end to end
```

**Go live (about 15 minutes):**
1. Create the Vapi, Twilio, ElevenLabs and Anthropic keys and fill in the root `.env`: [docs/KEYS.md](docs/KEYS.md).
2. Start a tunnel, set `PUBLIC_URL`, and run `npm run setup:vapi` and `npm run preflight`.
3. Make a real call and check each lane against [docs/VERIFY.md](docs/VERIFY.md).

## Card handling

- **Test card only.** The phone order lane accepts only the Stripe test card `4242 4242 4242 4242`. `server/src/commerce/vault.ts` refuses any other number unless `ALLOW_REAL_CARDS=1` is set. Don't set it for the demo.
- **Encrypted at rest.** Cards are stored with AES-256-GCM. The key is `CARD_ENC_KEY` (32 bytes, base64: `openssl rand -base64 32`). Everything else sees a token and the last 4 digits.
- **Released by the server, not the agent.** On the order call, the agent gets the number only through the `read_card` tool, and only if three checks pass:
  - the call is to the winning vendor's roster number;
  - the vendor has stated a total at or under the approved one;
  - the order was approved by voice.
- **Not stored by Vapi.** The order call has recording, logging, and transcripts off, and Vapi PCI mode on. Our own transcripts are redacted.
- **Still heard in the call.** Vapi's transcriber and LLM still process the spoken number. That's why production should use a single-use virtual card capped at the order total (see `docs/issues/16-real-ordering.md`).

## Honest notes

- **Suppliers are role-played by friends**, with prices taken from real listings.
- **The parts catalog is seeded.** We don't claim a learned parts graph.
- **Fixie compares quotes for the identical part. It does not negotiate.**
- **The port fault beat is simulated and labeled.** Every simulated event carries a `simulated` flag.
- Every call opens with "I'm an AI assistant; this call is recorded." No payments and no card details by voice.

## Repo map

| Path | What |
|---|---|
| `server/` | Node 22 + TypeScript + Express engine: orchestrator, guards, dialer, Vapi adapter, simulator |
| `web/` | Operator audit view for judges (SSE board) |
| `docs/` | `SPEC.md`, `PR.md`, `KEYS.md`, `VERIFY.md`, adversarial review, issues |
| `research/` | Judges, market, legal and safety, parts supply chain, differentiation, enterprise verticals |
| `pitch/` | Demo script, role-play scripts, part prices, Lane B checklist |
| `plan/` | Interactive plan demo (`fixie-plan.html`) |

Built at c0mpiled-16 UCSD, Oct 24 2026
