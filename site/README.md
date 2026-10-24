# Fixie site

Landing page, sign-in, and a caregiver/operator dashboard for Fixie. Next.js (App Router, TypeScript), Tailwind, Clerk.

## Run

```bash
cd site
npm install
npm run dev          # http://localhost:3100
```

The Fixie backend (`server/`) should be running; by default it is at `http://localhost:3000`.

`npm run build && npm start` serves the production build on port 3100. A production build needs real Clerk keys (see below).

## Pages

- `/` public landing page (click-to-call `tel:+16197711086`)
- `/sign-in`, `/sign-up` Clerk sign-in (phone number OTP and Google)
- `/dashboard` jobs list (protected)
- `/dashboard/jobs/:id` job detail: live timeline, quotes (rejected rows struck through with the reason), guard events, "Stop job" (protected)

## Auth (Clerk, zero-config in dev)

Installed `@clerk/nextjs` 7.x no longer auto-creates keys inside the middleware, so true in-framework keyless mode does not work with it. `npm run dev` first runs `scripts/ensure-clerk-dev-keys.mjs`. If no Clerk keys are configured, it asks Clerk for a temporary "accountless" dev instance (no account needed, the same mechanism as `npx clerk init`) and writes the keys to `.env.local`, which is gitignored. So it works with no setup.

To keep that instance, run `npm run clerk:claim` and open the printed URL. Or create your own app at https://dashboard.clerk.com.

### Where to put Clerk keys later

Put them in `site/.env.local` (never commit it):

```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_...
CLERK_SECRET_KEY=sk_...
```

The script leaves your keys alone once both are set. In the Clerk dashboard under User & Authentication, enable **Phone number** (with SMS code verification) and **Google** as sign-in methods. Those are dashboard settings, not code.

## Environment variables

See `.env.example`.

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk publishable key (public by design) |
| `CLERK_SECRET_KEY` | Clerk secret key (server only) |
| `FIXIE_API_URL` | Fixie backend base URL, default `http://localhost:3000` |
| `FIXIE_ADMIN_TOKEN` | Sent as `x-admin` by route handlers, server-side only. Needed for "Stop job" |

## How the backend is reached

The browser only talks to Next.js route handlers under `app/api/fixie/`:

- `GET /api/fixie/jobs`, `GET /api/fixie/jobs/:id`
- `POST /api/fixie/jobs/:id/stop` (adds `x-admin` on the server)
- `GET /api/fixie/events` (SSE pass-through of the backend `/events`, events `fixie` and `reset`)

`proxy.ts` (Clerk middleware) protects `/dashboard/**`, and returns 401 for `/api/fixie/**` when signed out. `FIXIE_ADMIN_TOKEN` is read only in `lib/fixie.ts` (`server-only`).
