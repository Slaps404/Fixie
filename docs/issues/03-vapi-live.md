# #3 Vapi live layer: client, assistants, prompts, webhook, setup, preflight
**Owner:** build agent WS-3 · **Est:** 60 min · **Reference:** `docs/review/vapi-api-facts.md` (verified JSON shapes)

## Files you own
`server/src/vapi/client.ts`, `server/src/vapi/assistants.ts`, `server/src/vapi/prompts.ts`, `server/src/vapi/webhook.ts`, `server/scripts/setup-vapi.ts`, `server/scripts/preflight.ts`, `server/src/boot.ts`

## Implement
- `client.ts`: `export const vapiProvider: VoiceProvider`, using `fetch` against `https://api.vapi.ai` with `Authorization: Bearer ${config.vapi.apiKey}`.
  - `createCall`: `POST /call` with `{ name, phoneNumberId, customer:{number:to}, assistant: buildAssistant(spec) }`. Returns `{callId:id, controlUrl: monitor?.controlUrl}`.
  - 5xx → one retry after 2 s. 4xx → throw an Error with the body text, so the dialer handles concurrency.
  - `endCall`: if there's a controlUrl, `POST {controlUrl}` with `{type:'end-call'}`; else `DELETE /call/:id`. Mark that path unverified in a comment and swallow errors.
  - Also export `getCall(id)` and `vapiFetch()`.
- `prompts.ts`: system prompts and first messages for the lanes intake | warranty | supplier | callback (user) | delivery | tech, following SPEC §4.
  - Short, spoken-style, ≤ 120 words each.
  - Every first message discloses AI + recording.
  - Supplier: ask for part WP3392519 (read the cross-ref too), price, shipping, stock, ETA. **Call `record_quote` as soon as you have the price.** Read the part number back. Be brief, thank them, and end the call. Never commit to buying.
  - Warranty: give the model, the purchase year, and the part; ask if it's covered; call `record_warranty`; end.
  - Callback: open with "the AI assistant you called at {time} about your {appliance}". Read back the part, supplier, landed total, and ETA. Ask them to say "order it". Call `record_order_decision`. Never ask for payment details.
  - Delivery: confirm the part arrived; ask for `unplugged` and `vent_cleared`, calling `safety_ack` for each; then step through, calling `install_progress` per step and speaking the returned next step; finally ask "is it warm?" and call `report_fix`. If the user says they already did steps, call `install_progress` with the highest step they finished.
  - Intake: accept every fact from the first answer; ask only for what's missing; read the model back once in chunks; call `start_job`; then say you'll call back and end the call. Safety keywords → advise a pro / 911.
  - Fill the dynamic fields (part, supplier, total, ETA, steps, caller name, call time) from `AssistantSpec.job` at build time.
- `assistants.ts`: `buildAssistant(spec: AssistantSpec): object` for transient lanes, and `buildIntakeAssistant(): object` for the persistent one. Per SPEC §6:
  - `server` + `X-Vapi-Secret` on the assistant **and** every function tool.
  - `serverMessages` as listed in §6.
  - `maxDurationSeconds` = `config.maxSec[lane]`, `silenceTimeoutSeconds: 15`, an `{type:'endCall'}` tool, **no voicemailDetection**.
  - Model: `anthropic` with `config.vapi.model` for intake/user/delivery and `claude-haiku-5-5` for warranty/supplier/tech.
  - Voice: `11labs` if `config.vapi.voiceId`, else omit (Vapi default).
  - `metadata: {jobId, vendorId, lane}`.
  - Tool JSON schemas for each lane's tools (`start_job`, `record_quote`, `record_warranty`, `record_order_decision`, `safety_ack`, `install_progress`, `report_fix`).
- `webhook.ts`: `export function register(app)` → `POST /vapi/webhook`.
  - Check `X-Vapi-Secret` when `config.webhookSecret` is set (401 otherwise).
  - Normalize `message.type` into contract `CallEvent`s:
    - tool-calls → one `kind:'tool'` per `toolCallList` entry. Parse `arguments` whether it's an object or a JSON string. `fromNumber` = `message.call.customer.number`; `callType` from `call.type`.
    - status-update: ringing/in-progress→live/ended.
    - transcript (final only): role assistant→agent, else other.
    - end-of-call-report → ended, with `reason` mapped by the SPEC §6 table, `durationSec` from `durationSeconds` or started/ended timestamps, `transcript` from `artifact.transcript`, `costUsd` from `cost`.
  - Context: if `calls.get(callId)` is missing, try parsing `call.name`, then `call.assistant?.metadata`, then inbound → register a user-lane ctx with `jobId:null`. Unknown non-inbound ids: wait up to 3 s (poll calls.get every 250 ms) before giving up.
  - Call `orchestrator.onCallEvent(e)` for each event. Respond `{results:[{name, toolCallId, result}]}` for tool-calls (result always a string; catch errors → `result: "Sorry, one moment."`), otherwise `{}`. **Always HTTP 200**, always in < 1 s for tools.
  - Dedupe tool calls by `toolCallId` (cache results).
- `boot.ts`: `export async function ensureInbound()`. If live and `VAPI_INTAKE_ASSISTANT_ID` is set, `PATCH /assistant/:id` with `buildIntakeAssistant()` (so the server URL tracks `PUBLIC_URL`), then self-check `fetch(PUBLIC_URL/health)`. Log, never crash. (Lane A wires the call into index.ts.)
- `scripts/setup-vapi.ts`: create the intake assistant (`POST /assistant`) if `VAPI_INTAKE_ASSISTANT_ID` is empty, then `PATCH /phone-number/:VAPI_PHONE_NUMBER_ID {assistantId}`. Print the id to add to `.env`.
- `scripts/preflight.ts`: check `PUBLIC_URL/health` is reachable, Vapi auth (`GET /assistant/:id`), assistant server.url === `PUBLIC_URL/vapi/webhook`, the phone number has the assistant attached, and roster phones are E.164. Print a ✅/❌ table. Add the npm script `"preflight": "tsx scripts/preflight.ts"`. You may edit package.json **scripts only**.

## Don'ts
No business logic. The webhook only normalizes and forwards. Never log full phone numbers or keys. Don't edit files outside your list.

**Acceptance:** typecheck passes. `POST /vapi/webhook` with the fixture payloads from `docs/review/vapi-api-facts.md` produces correct CallEvents (add a quick `test/webhook.test.ts`, which you also own). `buildAssistant` output matches the §6 JSON shape.
