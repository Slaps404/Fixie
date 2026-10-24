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

- **FAIL as of 2026-10-24.** The sim supplier personas always quote the dryer part (`partNumberSaid:"WP3392519"`). Every fault quote is therefore rejected with `could not confirm the identical part (WP3392519), not NOX-5WK97401`.
  - The job goes SOURCING → NOTIFIED with "No usable quote".
  - The tech call is then refused with a guard of kind **`max_calls`** ("Job is NOTIFIED. Not calling Marco"). That label is misleading, since no cap was hit.
  - The beat needs part-aware sim quotes (say the job's part number) and probably a tech call even when sourcing fails.
