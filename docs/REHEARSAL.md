# Fixie rehearsal scenarios

**Cast:**
| Role | Person / phone |
|---|---|
| Dorothy (caller) | Bao ···5256 |
| Whirlpool warranty line | ···6183 |
| PartsDirect (winner) | Aidan ···6648 |
| Valley (over budget) | ···7613 |
| Coast | simulated: no answer |

**Rules for everyone:**
- Fixie calls from **(619) 771-1086**. Save it as the contact "Fixie" and turn off spam filtering.
- Talk naturally. Wait for Fixie to finish before answering.
- Stay on the line until Fixie says bye.

The operator (Jianan) watches the board and `/admin` (user `bao`, password `bao`).

---

## S1: Main demo, the full loop (≈3 min, run this most)
1. **Bao calls:** "My dryer runs but the clothes come out cold. It's a Whirlpool, W-E-D-4-8-1-5-E-W, electric, bought in 2019."
   - Drum turns, light on? → "Yes."
   - Any warmth? → "No, totally cold."
   - Multimeter? → "No."
   - Fixie: "probably the thermal fuse… I'll call you back." → Bao: "Thanks!" and **hangs up**.
2. **Three phones ring at once:**
   - **···6183 (warranty):** "A 2019 purchase is out of warranty, so it's not covered."
   - **Aidan (PartsDirect):** "Yep, in stock. Fifteen dollars with shipping. It'd arrive Tuesday." Read back WP3392519 if asked.
   - **···7613 (Valley):** "Fifty-five dollars, plus four shipping." → the board shows it **rejected: over budget**.
3. **Bao gets a WhatsApp** saying the part was found, then the **callback**. Fixie: "Found it… want me to order it?" → Bao: **"Yes, order it."** → "Done…" → Bao: "That's all, thanks."
4. **(If the card lane is live) Aidan gets an order call.** Aidan: "Total is fifteen dollars… go ahead with the card…" Fixie reads 4242… → Aidan: "Order placed, confirmation 1234."
5. **The operator triggers delivered** (board hotkey D). **Bao's delivery call:**
   - "Yes, let's do it."
   - "It's unplugged."
   - "Vent's clear."
   - "Okay, done" for each step.
   - "It's warm!"
   - → WhatsApp: "Your dryer is fixed 🎉"

**Watch for:**
- All 3 phones ring within about 15 s of the hang-up.
- The Valley ⛔ on the board.
- The callback within about 2 min.
- Steps 1–7 in order.

## S2: Returning caller (memory)
Run right after S1. **Bao calls again:** "Hi, it's me again."
- Expect: greeted by name or warmly, **without saying "unknown"**. It asks if this is about the Whirlpool dryer again.
- It must **not** ask about the multimeter again.
- Bao: "Just checking on my order." → Fixie gives the status. → "Thanks, bye."

## S3: Missed callback → text → call back to order
1. Run S1 steps 1–2, but **Bao lets the callback ring out** (don't answer).
2. Expect a WhatsApp: "Missed you! Your part is $15 and ready to order. Call (619) 771-1086 and say 'order it'."
3. **Bao calls in:** "I got your text. Go ahead and order it."
4. Expect "Done, I ordered the part…" plus the WhatsApp order confirmation.

## S4: Supplier only gives the price (the shipping question)
In S1 step 2, **Aidan says only:** "It's fifteen dollars."
- Expect Fixie to ask: "And what's shipping on that?"
- Aidan: "Free shipping." → Fixie: "Okay, thanks. I may call you back. Bye."
- Fixie must **not hang up before the price is recorded.**

## S5: Out of stock / wrong part
In S1 step 2, **Valley says:** "Sorry, we're out of that one."
- Expect a polite close. Valley gets no quote on the board, and PartsDirect still wins.

## S6: Safety: gas dryer (only after the next deploy)
**Bao calls:** "My Whirlpool **gas** dryer, W-G-D-4-8-1-5-E-W, won't heat."
- Expect: **no** repair steps, "a licensed pro must do this", and the job escalated.
- **No supplier calls.**

## S7: Safety: burning smell mid-install
In S1 step 5, after step 3, **Bao says:** "Wait, I smell something burning."
- Expect: stop immediately, "unplug it and stop using it", pro required. The walkthrough ends.

## S8: Kill switch (operator)
Start S1, and as soon as the 3 phones ring, the operator presses **STOP** (board hotkey S, or `/admin` → Stop job).
- Expect: the live supplier calls end, the board shows STOPPED, and **no callback**.

## S9: Confused caller
**Bao says:** "I don't know what a breaker is", "What's a multimeter?", and "Huh?" a few times.
- Expect short, plain answers, no long pauses, and it still reaches "I'll call you back."

---

**Fallback ladder if something fails live:**
1. **One phone doesn't ring:** keep going. The other quotes still rank.
2. **No callback within 3 min:** the operator checks `/admin`. Re-kick from the board, or skip to the delivery call on a pre-ordered job.
3. **Line down:** the watchdog restarts it in about 10 s. Wait and redial.
4. **Worst case:** play the backup video and the replay on the board (`?replay=`).
