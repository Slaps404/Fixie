# Port fault beat

The enterprise beat: a terminal tractor throws J1939 fault `SPN 3226 FMI 4`. The same engine diagnoses a NOx sensor, gates it as pro-only, sources the part from suppliers, and calls the yard tech before the ship's berth window.

## Sub-features

- `fault-intake`: `fault` → `diagnosis` → `part_identified` NOX-5WK97401 → `safety` pro_required.
- `fault-sourcing`: supplier calls quote the NOx sensor within the $1500 tech budget → `best_deal`.
- `tech-call`: a tech-lane call to Marco (`···0105`).

## How to get to it (user POV)

- On stage: `curl -X POST /fault` (optional body `{asset, code, site}`). The board auto-switches to the new job tab.

## Driving it with fixie-verify

Preconditions: a healthy run, then `$S reset`.

- **Fire the fault.** Run `$S api POST /fault '{}'`. The response has `"ok":true`, and the job `kind` is `enterprise`.
- **Diagnosis.** `$S wait-event '.type=="part_identified"' 10` shows `partNumber` `NOX-5WK97401`.
- **Sourcing.** `$S wait-event '.type=="best_deal"' 60` should name a supplier.
- **Tech call.** `$S wait-event '.type=="call_started" and .data.lane=="tech"' 60` should show the call to Marco.
- **Proof.** Run `$S capture port-fault`.

## Gotchas

- **PASS as of 2026-10-25.** Sim supplier personas now quote the job's own part number (`partFor(req)` in `sim.ts`), so the fault quotes pass the identical-part check.
  - Observed on a fresh run: `part_identified` NOX-5WK97401, `best_deal` PartsDirect Counter ($261, identical part), a `call_started` for the tech lane (Marco, `···0105`), then the job ends NOTIFIED.
  - The tech call is placed after sourcing concludes, and the job moves SOURCING → NOTIFIED only once that call is placed.
  - If a regression brings back "could not confirm the identical part", check `partFor` in `server/src/vapi/sim.ts` first.
- **Run state is shared.** `$STATE_ROOT/current` is one global pointer. Export your own `RUN_ID` before every command, and never run `cleanup` without it, so you do not clean up another session's run.
