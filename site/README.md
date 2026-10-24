# Fixie site

Landing page, phone-and-card signup, and an operator dashboard for Fixie. Next.js (App Router, TypeScript), Tailwind.

## Run

```bash
cd site
cp .env.example .env.local   # then fill in the values
npm install
npm run dev                  # http://localhost:3100
```

The Fixie backend (`server/`) should be running; by default it is at `http://localhost:3000`.

## Pages

- `/` landing page (click-to-call `tel:+16197711086`)
- `/get-started` sign up: phone number, text-message code, then the card. `/get-started?signin=1` signs in with just the code.
- `/welcome` "You're in!" with the number and an "Add Fixie to contacts" download (`/contact.vcf`)
- `/dashboard` jobs list, `/dashboard/jobs/:id` live timeline, quotes, guard events and the Stop button. Requires a session.

## Sign-in (no third-party auth service)

1. The phone number gets a 6-digit text from **Twilio Verify**. Verify needs no 10DLC registration.
2. A correct code sets a signed, httpOnly cookie (`fixie_session`, HMAC-SHA256 with `SESSION_SECRET`, 30 days).
3. `proxy.ts` sends signed-out visitors from `/dashboard` to `/get-started?signin=1` and returns 401 for `/api/fixie/*`.

The cookie only proves control of a phone number. Anyone with a session can see the dashboard, which is the same as the old Clerk behavior.

## Keys

See `.env.example`. One-time setup scripts, both read `.env.local` and never print secrets:

```bash
npm run verify:create   # makes a Twilio Verify service, prints TWILIO_VERIFY_SERVICE_SID
npm run stripe:create   # makes the $9/mo "Fixie Family Plan" test product, prints STRIPE_PRICE_ID (sk_test_ keys only)
```

`SIGNUP_TEST_MODE=1` lets signup work with no Twilio or Stripe keys (code `000000`, card step labelled "Test mode: card step simulated"). Never set it on anything the public can reach.

Card details go to Stripe Checkout (subscription mode). The site never sees them. The return page checks with Stripe that the session is complete and belongs to the signed-in phone number before saying "You're in".

## Production

`npm run build && npm start` serves on port 3100.
