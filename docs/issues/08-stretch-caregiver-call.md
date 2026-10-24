# #8 (Stretch, after cut line) Caregiver closing call
**Owner:** Lane A · **Est:** 25 min · **Why:** a phone rings in the audience during the close, and it answers "who's watching out for grandma?"

- Intake asks one extra yes/no: "Want me to tell your family when it's done?" → `start_job.notifyFamily`. Pass it through `args`; the orchestrator stores it in `job.notes`.
- Add `roster.caregiver` (optional entry).
- On `fix_verified{ok:true}` with consent, place a `user`-lane call to the caregiver. (Exempt lane; add the caregiver phone to the vendor allow-list.)
- Use a transient assistant with only a `firstMessage`: "Hi, this is Fixie, an AI assistant. Your mom's dryer is fixed. It cost $13 instead of a $200 visit, installed at 3:41. No action needed. Bye!", with `maxDurationSeconds: 25`.
- Emit `note{kind:'caregiver_notified'}`.
