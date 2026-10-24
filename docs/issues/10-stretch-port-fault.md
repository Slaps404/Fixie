# #10 (Stretch, sim-only) Port fault beat: same engine, enterprise
**Owner:** Lane A (already implemented in #2 `startFault`) + Lane B board styling · **Est:** 15 min to polish

- `curl -X POST /fault -H 'x-admin: …' -d '{"asset":"Terminal tractor YT-07","code":"SPN 3226 FMI 4","site":"Port of San Diego, 10th Ave Marine Terminal"}'`
- The board renders it with the SIMULATED badge and the "simulated Samsara webhook" label. It shows the decode, `safety{pro_required}` ("certified tech only"), quotes against the $1500 tech budget, and NOTIFIED.
- Pitch line: "Dorothy is zero-screen; the tech is zero-hands. Same engine."
