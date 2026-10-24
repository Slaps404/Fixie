## Fact-check findings (SPEC §4–§6)

**F1 [blocker] `metadata` is not a top-level `/call` field.** The API reference says metadata exists only on `assistant` and `assistantOverrides`, and the Call response has no `metadata`. Whether it is echoed in webhooks is **unverified**.
- Fix §6 so the `callId → ctx` map never depends on echoed metadata.
- Put `{jobId, vendorId, lane}` in `assistant.metadata` and in the top-level `name` string, `"job_1|valley|supplier"`.
- Resolve a call in this order: id map, then `message.call.name`, then `message.call.customer.number` against the roster (phones are unique per vendor).
- Buffer events for an unknown `call.id` for about 3 s. The first `status-update` can reach `/vapi/webhook` before the `POST /call` response is stored.

**F2 [blocker] Inbound calls have no map entry.** The map is only filled in `createCall`, but the intake call and its `start_job` tool call arrive with an unknown id.
- Add to §6: if `message.call.type === "inboundPhoneCall"` and the id is unknown, create the context `{lane:"user"}`.
- Take the caller's phone from `message.call.customer.number`. Remove `phone` from the `start_job` args in §4. Dorothy will mumble it, and the server already has it.

**F3 [high] `message.transcript` is wrong for end-of-call-report.** The documented shape is `message.artifact.transcript` (string) and `message.artifact.messages[]`. `endedReason` is at `message.endedReason`. Fix the §6 fallback to read those paths.

**F4 [high] Structured extraction via `analysisPlan` is deprecated and unreliable.**
- Docs label `analysisPlan` deprecated; new work uses structured outputs (`artifactPlan.structuredOutputIds`, result at `call.artifact.structuredOutputs`).
- The docs disagree on field names. The call-analysis page shows flat `structuredDataPrompt` and `structuredDataSchema`. The assistant API shows `structuredDataPlan`.
- Results are documented at `call.analysis`. A community answer says `message.analysis.structuredData`.
- Multiple forum threads report `analysis` empty or missing in the report.
- **Spec change:** make the primary extraction a server tool. Give the supplier and warranty assistants `record_quote({price, inStock, eta, identicalPart})` and `record_warranty({covered, detail})`. It is deterministic and live, and the board shows the quote immediately.
- Fall back to Claude on `artifact.transcript`. Drop `analysisPlan` from §6. If kept, read `message.analysis?.structuredData ?? message.call?.analysis?.structuredData`.

**F5 [high] Voicemail and no-answer mapping is missing.** The §5 guard checks only `voicemail`. Map every `endedReason` to a `call_ended.reason` in `webhook.ts`:

| endedReason | reason |
|---|---|
| `voicemail` | `voicemail` |
| `customer-did-not-answer`, `customer-busy`, `twilio-failed-to-connect-call` | `no_answer` |
| `exceeded-max-duration`, `silence-timed-out` | `timeout` |
| `customer-ended-call`, `assistant-ended-call`, `assistant-said-end-call-phrase` | `completed` |
| `call.start.error-subscription-concurrency-limit-reached` | guard event, then retry once after 5 s |

- With `voicemailDetection` on and no `voicemailMessage`, Vapi hangs up and reports `voicemail`.
- A teammate's real carrier voicemail may not be detected. Keep `silenceTimeoutSeconds: 20` and `maxDurationSeconds: 90` for supplier calls as a backstop.

**F6 [high] Tool-calls auth and server URL.**
- Transient assistants in `POST /call` get no org credential. Put `server.headers: {"X-Vapi-Secret": SECRET}` inline and check it in the webhook, or the endpoint is open to the internet.
- Precedence between `tool.server`, `assistant.server`, and `phoneNumber.server` is **unverified**. Set the identical URL on both tool and assistant.
- The Vapi tool-call timeout is `server.timeoutSeconds` (default 20). Reply to `tool-calls` immediately and do work async.
- Always return HTTP 200. Use `error` instead of `result` on failure. `result` must be a flat string, so JSON-stringify objects.

**F7 [medium] Concurrency.** Legacy accounts get 10 lines. New accounts depend on plan and are **unverified**. Inbound and outbound share slots.
- Check the dashboard now. Demo peak is 1 (the intake call, if still up) plus 3 outbound.
- Read `subscriptionLimits.concurrencyBlocked` in the `POST /call` response. It is documented in the schema, but the 201 shape is unverified.
- API rate limit is **unverified**. A community post says about 50 requests per minute. Stagger the parallel calls by 300 ms.

**F8 [medium] Model names.** The Vapi Anthropic page lists `claude-sonnet-5`, `claude-haiku-5-5`, `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, and `claude-opus-4-6`. Use Haiku for the outbound lanes to cut latency and Sonnet for intake. Dated aliases not on that list are unverified.

**F9 [medium] `endCallFunctionEnabled` is unverified.** Use the `endCall` tool in `model.tools` instead. The `type: "endCall"` shape is not shown on the pages I could read, so mark it unverified.

**F10 [low] Live transcripts.** `transcript` events carry `role`, `transcript`, and `transcriptType` (`partial` or `final`). Subscribe to `"transcript[transcriptType=\"final\"]"` in `serverMessages` to avoid flooding SSE with partials. If you keep partials, emit `transcript` events only for `final`.

**F11 [low] Tunnel and setup drift.**
- A cloudflared quick tunnel URL changes on every restart.
- `setup-vapi.ts` must be idempotent: `PATCH /assistant/{id}` when the id is in `.env`, otherwise `POST`.
- Outbound transients use the live `PUBLIC_URL`, so they are fine.

---

## VAPI_NOTES

**Verified** unless marked.

Outbound call (`POST https://api.vapi.ai/call`, Bearer key):
```json
{
  "name": "job_1|valley|supplier",
  "phoneNumberId": "<VAPI_PHONE_NUMBER_ID>",
  "customer": { "number": "+16195550123" },
  "assistant": {
    "metadata": { "jobId": "job_1", "vendorId": "valley", "lane": "supplier" },
    "firstMessageMode": "assistant-speaks-first",
    "firstMessage": "Hi, I'm an AI assistant calling for a customer; this call is recorded. Do you have part WP3392519 in stock?",
    "model": { "provider": "anthropic", "model": "claude-haiku-5-5",
      "messages": [{ "role": "system", "content": "..." }],
      "tools": [
        { "type": "function",
          "function": { "name": "record_quote",
            "description": "Record the supplier's quote",
            "parameters": { "type": "object",
              "properties": { "price": {"type":"number"}, "inStock": {"type":"boolean"}, "eta": {"type":"string"}, "identicalPart": {"type":"boolean"} },
              "required": ["price","inStock"] } },
          "server": { "url": "https://X.trycloudflare.com/vapi/webhook", "headers": { "X-Vapi-Secret": "<SECRET>" } } },
        { "type": "endCall" }
      ] },
    "voice": { "provider": "11labs", "voiceId": "<VOICE_ID>", "model": "eleven_flash_v2_5" },
    "maxDurationSeconds": 90,
    "silenceTimeoutSeconds": 20,
    "voicemailDetection": { "provider": "vapi", "type": "audio",
      "backoffPlan": { "startAtSeconds": 2, "frequencySeconds": 2.5, "maxRetries": 5 }, "beepMaxAwaitSeconds": 20 },
    "server": { "url": "https://X.trycloudflare.com/vapi/webhook", "timeoutSeconds": 20, "headers": { "X-Vapi-Secret": "<SECRET>" } },
    "serverMessages": ["tool-calls", "status-update", "end-of-call-report", "transcript[transcriptType=\"final\"]", "hang"]
  }
}
```
- The response contains `id` and `status`.
- Unverified: the exact `silenceTimeoutSeconds` range, and `maxDurationSeconds` min and max (default 600).
- Unverified: the 11labs `voiceId`. If you have no ElevenLabs key, test whether Vapi's own voice provider works.

Webhook envelope, in `POST /vapi/webhook`:
```json
{ "message": { "type": "tool-calls", "call": { "id": "…", "type": "inboundPhoneCall", "customer": { "number": "+1…" } },
  "toolCallList": [{ "id": "call_abc", "type": "function", "function": { "name": "start_job", "arguments": { "model": "WED4815EW" } } }],
  "toolWithToolCallList": [ ] } }
```
Parse `arguments` defensively (object, or JSON string). The reply:
```json
{ "results": [{ "name": "start_job", "toolCallId": "call_abc", "result": "Likely the thermal fuse. I'll call you back with the best price." }] }
```
Other message shapes:
```json
{ "message": { "type": "status-update", "status": "ended", "call": {} } }
{ "message": { "type": "transcript", "role": "user", "transcriptType": "final", "transcript": "…" } }
{ "message": { "type": "end-of-call-report", "endedReason": "voicemail", "call": {}, "artifact": { "transcript": "AI: … User: …", "messages": [] } } }
```
`status` values are `scheduled`, `queued`, `ringing`, `in-progress`, `forwarding`, `ended`. Only `assistant-request`, `tool-calls`, `transfer-destination-request`, and `knowledge-base-request` expect a reply.

Setup:
```
POST /phone-number  {"provider":"twilio","number":"+1…","twilioAccountSid":"AC…","twilioAuthToken":"…","assistantId":"<id>"}
PATCH /phone-number/{id}  {"assistantId":"<id>"}
```
The create call needs only `number` and `twilioAccountSid` (the sample body also sends `twilioAuthToken`). Create the assistant with `POST /assistant`, using the same body as the transient one above.

**Unverified:**
- Metadata echo in webhooks.
- Tool-call, `server`, and `phoneNumber.server` precedence.
- Timing of `end-of-call-report` relative to `status-update` ended.
- Default concurrency for new accounts.
- Rate limits.
- `endCallFunctionEnabled`.
- The `messages` field for speak-while-running in the tool response.