# #12 (Round 3, DO NOW) Proof panel: "agent proposes, code approves"
**Owner:** Lane B (board) + ~15 min Lane A · **Est:** 75 min
**Why:** judges see 50 "Vapi + Twilio + prompt" demos. The winning 2026 agent-commerce projects (AgentPay, NextWave) made the deterministic approval layer the headline. Source: `research/round3/winning-agent-hackathons.md`, `SYNTHESIS.md` §4.2.

## Build
- **Lane A:** every decision event (`quote`, `best_deal`, `guard`, `order_confirmed`, `job_state`) carries `approvedBy: "code" | "user_voice" | "caregiver"` and a deterministic `reason`. Add a `metrics` event at callback with elapsed time, calls placed, voicemails skipped, guards fired, total Vapi cost (if `end-of-call-report` has it), and parallel vs serial call minutes.
- **Lane B:** one strip that is always visible: calls N/8, minutes, $ committed / cap, guards fired, plus a scrolling "decision log" where each row shows the agent's proposal, then ✅/⛔ with the code rule that approved or blocked it.
- Staged runaway beat: a "Hold Forever" supplier persona trips the stuck guard, then the presenter hits STOP live (the kill switch already works per `/verify`).
- Last slide: a judge-callable number with a per-caller cap (≤1 job, ≤3 outbound calls, roster-only suppliers).

## Caveat to say on stage
"The order is mocked; the caps are real code."
