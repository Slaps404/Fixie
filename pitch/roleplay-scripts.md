# Fixie role-play scripts (spec v0.2)

Fixie calls these phones **live**. The warranty and supplier calls ring **at the same time** (staggered 300 ms apart). Each call opens with "I'm an AI assistant; this call is recorded."

| Role | Who plays it | Phone (`+1XXXXXXXXXX`) | Must-say facts | What it shows on the board |
|---|---|---|---|---|
| **Dorothy** (caller) | Jianan, or a judge on Jianan's phone | ______ | Everything in **one breath**; says **"order it"** | Intake → callback → install |
| **Whirlpool Parts & Warranty** | ______ | ______ | **Out of warranty** (bought 2019) | Warranty ✗ |
| **PartsDirect Counter** | ______ (front row, audible) | ______ | **$9.10 + $3.95 shipping**, reads back **W-P-3-3-9-2-5-1-9**, Tuesday | Winning quote, **$13.05 landed** |
| **Valley Appliance Parts** | ______ | ______ | **$55 + $4 shipping**, pickup today | 🛑 **Budget guard trips** ($59 > $40 cap). Intentional |
| **Coast Supply** | ______ | ______ | **Decline the call** (tap the red button) | 🛑 **No-answer guard**: skipped, no retry |
| *Optional:* **Hold** (4th actor) | ______ | ______ | Answer, then **go silent** | 🛑 **Stuck guard** after 20 s |

Send Jianan every number **with its role**, in `+1XXXXXXXXXX` format. Jianan puts them in `server/data/roster.json` (gitignored).

## Every role-player: phone prep (2 min)
- [ ] Save the Fixie Twilio number as a contact named **"Fixie"**.
- [ ] **iPhone:** Settings → Apps → Phone → **Silence Unknown Callers OFF**. **Android:** turn off unknown/spam call blocking.
- [ ] Focus / Do Not Disturb **off**. Ringer **on**. Battery at 50% or more.
- [ ] Phone **to your ear**, never speakerphone. Stand **at least 3 m apart**; the calls are simultaneous.
- [ ] Be at the **4:00 PM test call in the MPR**, and phone in hand from **7:40 PM** for the top-5 demo.

**Tips:** short sentences, pause after each, numbers as words. If the agent talks over you, stop, wait, and repeat your line. **Supplier calls are capped at 45 s**, so get the numbers out early.

---

## 1. Whirlpool Parts & Warranty (~20 s)
| Who | Line |
|---|---|
| **You** | "Whirlpool Parts and Warranty, this is Pat." |
| Agent | *AI + recording disclosure; model WED4815EW; asks whether the thermal fuse is covered.* |
| **You** | "Let me look... That unit was bought in **2019**. Warranty is **one year**, so it's **out of warranty**. No free part, sorry." |
| Agent | *Asks about extended coverage.* |
| **You** | "No extended plan on file." |

## 2. PartsDirect Counter (~25 s, the winning quote; you're audible in the front row)
| Who | Line |
|---|---|
| **You** | "PartsDirect, parts counter." |
| Agent | *Disclosure; asks for Whirlpool WP3392519.* |
| **You** | "Thermal fuse... **W-P-3-3-9-2-5-1-9**. Yep, genuine Whirlpool. **Nine dollars and ten cents.**" |
| Agent | *Asks about shipping / stock / ETA.* |
| **You** | "**Three ninety-five shipping.** It's **in stock**, arrives **Tuesday**." |
| Agent | *Thanks you, ends call.* |

**Must read back the part number digit by digit.** The server checks it against the catalog to mark the quote "identical part ✓". If the agent asks again, repeat: "W-P-3-3-9-2-5-1-9."

## 3. Valley Appliance Parts (~20 s, trips the budget guard on purpose)
| Who | Line |
|---|---|
| **You** | "Valley Appliance Parts, this is Sam." |
| Agent | *Disclosure; asks for WP3392519.* |
| **You** | "W-P-3-3-9-2-5-1-9, genuine. **Fifty-five dollars**, plus **four dollars shipping**. In stock, **pickup today**." |
| Agent | *Thanks you, ends call.* |

Don't lower your price if asked. **$59 landed is over the $40 cap, and that's the point.** The board shows it in red: *"Valley quoted $59.00 landed. Over the $40 budget, skipped."*

## 4. Coast Supply (0 s, trips the no-answer guard)
When "Fixie" rings, **tap Decline**. That's it. Don't answer, and don't let it go to voicemail if you can help it. The board shows `guard: no_answer → skipped`, and Fixie does **not** retry.

## 5. Optional: Hold (trips the stuck guard)
Answer: "Hi, can you hold one moment?" Then **say nothing**. After about 20 s with no quote, Fixie ends the call and the board shows `guard: stuck → skipped`.

---

## 6. Dorothy (Jianan or a judge; never looks at a screen)
**Call 1: intake + tests (~45 s).** Open with it **all in one breath**:
> "Hi, my Whirlpool dryer runs but there's no heat. The model is W-E-D-4-8-1-5-E-W. I bought it in 2019."
- *(OK to continue and to call you back on this number?)* → "Yes, that's fine."
- *(Model readback, once, in chunks.)* → "That's right."
- Then Fixie runs **tests**. Each answer moves the probability bar on the board:
  - *(Breakers: are both on, or is one tripped?)* → "**Both are on.**"
  - *(Does the drum turn and tumble?)* → "**Yes, it turns.**"
  - *(Any warmth at all after five minutes?)* → "**No, completely cold.**"
  - *(Optional, if she "has a meter": dryer unplugged, probes on the fuse tabs. Beep or silent?)* → "**It's unplugged… it stays silent.**" That's the big jump: thermal fuse goes to about 98%.
  - If the agent asks something you didn't expect, answer plainly. **Never say "I don't know"** unless you want to show the ambiguous-reading gate.
- *(Vent warning, "I'll call you back.")* → "Okay, thank you." **Hang up.** Sourcing starts when you hang up.

**Call 2: callback (~15 s).** The callback no longer names the supplier or part number unless you ask.
- *(Fixie: price, arrival day, "Say 'order it'.")* → "**Order it.**" (Exactly those words.)
- *(Fixie: "Done, I ordered the part… Is there anything else I can help you with?")* → "**No, that's all. Thank you.**"

**Call 3: delivery + install (~40 s, after the hidden hotkey)**
- *(Agent: "Your part arrived. Want to install it together?")* → "Yes."
- Then say in one go: "**It's unplugged, the vent's clear, the back panel's off, and I'm holding the new fuse.**" That gives both safety acks, and the agent skips ahead.
- Follow the last steps: "Wires are on." → "Panel's back, plugged in, running."
- *(Is it warm?)* → "**Yes, it's warm!**"

---

## Rehearsal checklist
- [ ] Run 1: all phones live, happy path. PartsDirect reads the part number back; Valley says $55 + $4; Coast declines.
- [ ] Check the board shows: a red budget guard on Valley, a no-answer guard on Coast, and PartsDirect **CHEAPEST at $13.05**.
- [ ] Run 2: Dorothy does the one-breath intake and says "order it" exactly.
- [ ] Run 3: delivery hotkey → one-breath safety acks → "It's warm!"
