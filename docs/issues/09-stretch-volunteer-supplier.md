# #9 (Stretch) A judge or volunteer plays a supplier, unscripted
**Owner:** Lane A + B · **Est:** 30 min · **Why:** a voice-agent founder will spot a staged demo. An unscripted human quoting any price proves the tool extraction is real.

- `POST /roster/enroll {phone, name, role:'supplier'}` (admin). It adds a temporary supplier with a 15-minute TTL. The roster is re-read at call time.
- Only use phones **test-called before 5:00** (spam labels and screening are real risks). Teammate phones stay enrolled as the fallback.
- The prompt must handle a missing price, "call back Monday", and a non-identical part → `record_quote` with `inStock:false` / skip.
