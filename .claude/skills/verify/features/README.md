# Fixie verification map

The maintained source for proving Fixie's user-facing behavior. Read this index, then use the matching feature file as the recipe. Every recipe assumes `S=.claude/skills/verify/scripts/fixie-verify.sh` from the repo root.

## Baseline preconditions

- A run launched with `$S launch` and a `$S doctor` with every line ✅. That means dryRun, the fake 555 roster, and no `.env`.
- Start each recipe with `$S reset`, unless the recipe says otherwise.
- The seeded roster (`server/data/roster.example.json`):

  | Party | Number | simPersona |
  |---|---|---|
  | Dorothy (user) | `···0100` | |
  | Whirlpool warranty | `···0101` | `out_of_warranty` |
  | Valley | `···0102` | `quote:55.00:4.00` (over budget) |
  | PartsDirect | `···0103` | `quote:9.10:3.95` (the winner, $13.05 landed) |
  | Coast | `···0104` | `no_answer` |
  | Marco, yard tech | `···0105` | |

- The seeded catalog (`server/data/parts.json`): model `WED4815EW` → thermal fuse `WP3392519` (7 install steps); fault code `SPN 3226 FMI 4` → `NOX-5WK97401`.

## Driving conventions

- Drive only through admin routes (`$S api`) and Vapi-shaped webhooks (`$S probe-install`). Never import server modules, and never edit `data/*.json` on a running instance.
- Wait on events or states (`wait-event`, `wait-state`), not on fixed sleeps.
- Take literal values from the tables above. The sim personas are fixed, so the expected numbers are exact.

## Proof and skip reporting

- `$S capture <feature-id>` after each recipe. Cite event ids and types from `<feature-id>.timeline.tsv`.
- Show both the action and its result: the request you sent, the events it caused, and the job state after.
- A guard proof shows the guard event *and* the missing downstream effect.
- If a journey can't reach its end state, report it as **FAIL** with the last 20 events. Never loosen the recipe to make it pass.
- Sim proofs never count as live proofs. Report live lanes as "not verified (sim only)" unless a live run was explicitly approved and done.

## Feature entry contract

Each feature file has an H1 and a one-paragraph description, then four H2s in this order: `Sub-features`, `How to get to it (user POV)`, `Driving it with fixie-verify`, `Gotchas`.

## Features

| Feature | Covers | Last result |
|---|---|---|
| [Dryer journey](./dryer-journey.md) | Intake → warranty → parallel sourcing → callback "order it" → delivery → install → fix check | PASS 2026-10-24 |
| [Guardrails](./guardrails.md) | Budget, no_answer, install safety gate, kill switch, caps | budget/no_answer/kill/step-7 gate PASS; see gotchas |
| [Port fault beat](./port-fault.md) | `POST /fault` J1939 → same engine → tech call | **FAIL** 2026-10-24 |
| [Demo controls](./demo-controls.md) | Reset/epoch, per-lane mode (fallback ladder), event stream replay | Not yet driven |
| [Judge board](./judge-board.md) | `web/` OPERATOR AUDIT VIEW renders the stream | Not yet driven |
| [Live lanes](./live-lanes.md) | Real Vapi/Twilio calls, preflight | Needs the user's approval every time |
