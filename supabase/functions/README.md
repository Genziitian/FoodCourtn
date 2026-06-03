# Edge Functions

Server-side functions that handle anything requiring a secret (2factor.in API key,
service role, payment gateway secrets) so the browser never sees them.

## Setup once

You need the Supabase CLI:

```bash
npm install -g supabase
supabase login
supabase link --project-ref oztyaxmlwnmpzgylbyfq
```

## OTP functions (2factor.in)

### 1. Store your secrets in Supabase

```bash
supabase secrets set TWOFACTOR_API_KEY=YOUR-2FACTOR-API-KEY
# Optional — defaults to "OTP1" if unset
supabase secrets set TWOFACTOR_TEMPLATE=YourTemplateName
```

Get the API key from https://2factor.in/Dashboard. The template name is what
you approved in 2factor's TRAI DLT panel (e.g. `OTP1`).

### 2. Deploy the functions

```bash
supabase functions deploy send-otp --no-verify-jwt
supabase functions deploy verify-otp --no-verify-jwt
```

The `--no-verify-jwt` flag is **required** — customers haven't signed in yet
when they request an OTP, so Supabase shouldn't reject the call.

### 3. Verify

```bash
# Send
curl -X POST \
  https://oztyaxmlwnmpzgylbyfq.supabase.co/functions/v1/send-otp \
  -H "Authorization: Bearer YOUR_VITE_SUPABASE_ANON_KEY" \
  -H "content-type: application/json" \
  -d '{"phone":"9876543210"}'

# Verify (after you receive the SMS)
curl -X POST \
  https://oztyaxmlwnmpzgylbyfq.supabase.co/functions/v1/verify-otp \
  -H "Authorization: Bearer YOUR_VITE_SUPABASE_ANON_KEY" \
  -H "content-type: application/json" \
  -d '{"phone":"9876543210","code":"123456"}'
```

Expected successful responses:

```json
// send-otp
{ "ok": true, "phone": "+919876543210" }

// verify-otp
{ "ok": true, "phone": "+919876543210" }
```

### 4. Done

The customer app at `/login` will now use real OTPs automatically. If the Edge
Function is unreachable (e.g. during local dev without deployment), it falls
back to dev mode and accepts any 4–8 digit code.

## Logs / debugging

```bash
supabase functions logs send-otp --tail
supabase functions logs verify-otp --tail
```

## Updating

After editing `supabase/functions/{name}/index.ts`, redeploy:

```bash
supabase functions deploy send-otp --no-verify-jwt
```

Each `deploy` is essentially instant (cold-start ~200ms in `ap-south-1`).

## Common gotchas

- **"TWOFACTOR_API_KEY is not set"** in the response — you forgot
  `supabase secrets set TWOFACTOR_API_KEY=...`. Setting it as a regular env var
  in `.env` doesn't reach Edge Functions; only `supabase secrets set` does.
- **CORS error** in the browser — the function returns `Access-Control-Allow-Origin: *`,
  so this shouldn't happen. If it does, double-check the deploy succeeded.
- **"OTP Mismatch"** — VERIFY3 checks against the most recent OTP for that
  phone. If you triggered multiple sends, only the last one is valid.
- **DLT** — 2factor needs your template + sender ID approved by TRAI before
  live SMS goes out. Test mode (your trial credits) works without approval.

---

# Phase 2 — Server-side trust

These three functions move all sensitive operations off the customer/admin
browser and into a service-role context, so a tampered client can't
inject ₹1 biryani orders, fake "payment captured" success messages, or
abuse the admin-creation session-swap.

The customer + admin apps auto-detect when a function isn't deployed yet
and fall back to the legacy direct-insert path with a console warning,
so local dev keeps working until you run the deploy commands below.

## 1. `place-order` — server-side order placement

What it does:
- Accepts the cart, **ignores the client's prices**, looks up each
  menu_item / variant / modifier from the DB, recomputes the unit_price,
  and re-runs the same `calculatePrice` formula the client uses.
- Re-validates the coupon against current DB state (active, in-window,
  usage limit not hit).
- Caps coin redemption by the customer's actual wallet balance for that
  restaurant.
- Inserts the order with `payment_status='pending'`. The webhook below
  flips it to `'success'` once Razorpay confirms capture.

Deploy:
```bash
supabase functions deploy place-order --no-verify-jwt
```

`--no-verify-jwt`: customers are anonymous (browser UUID), not Supabase
Auth — trust comes from the service-role re-pricing inside the function,
not from a JWT.

Test:
```bash
curl -X POST \
  https://oztyaxmlwnmpzgylbyfq.supabase.co/functions/v1/place-order \
  -H "Authorization: Bearer YOUR_VITE_SUPABASE_ANON_KEY" \
  -H "content-type: application/json" \
  -d '{
    "restaurant_id": "...",
    "customer_id":   "...",
    "table_id":      null,
    "order_type":    "takeaway",
    "cart": { "lines": [ { "menu_item_id":"...", "qty":1, "modifiers":[] } ], "use_coins": false }
  }'
```

Expected `200 { ok: true, order: { id, code, total, breakdown, ... } }`.

## 2. `razorpay-webhook` — verified payment confirmations

What it does:
- HMAC-SHA256(`RAZORPAY_WEBHOOK_SECRET`, raw_body) verified against
  `X-Razorpay-Signature`. Constant-time compare so timing attacks
  don't leak.
- On `payment.captured`: marks the order `payment_status='success'`.
- On `payment.failed`: marks it `'failed'` (counter-pay still available).
- Upserts a `payments` row using `gateway_payment_id` as the natural
  key so Razorpay's retries are idempotent.

Deploy:
```bash
supabase secrets set RAZORPAY_WEBHOOK_SECRET=whsec_...your_secret_here
supabase functions deploy razorpay-webhook --no-verify-jwt
```

Then in **Razorpay Dashboard → Account & Settings → Webhooks → Add new**:
- URL: `https://oztyaxmlwnmpzgylbyfq.supabase.co/functions/v1/razorpay-webhook`
- Secret: same as `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.captured`, `payment.failed`, `payment.authorized`
- Click **Test** — should return 200.

## 3. `admin-create-user` — service-role account creation

What it does:
- Replaces the dev-only `saveAndRestoreSession` browser trick. The
  current admin's session is never swapped.
- Verifies the caller's JWT, then checks they have authority to create
  the requested role (platform_admin for org_admin; platform_admin OR
  org_admin OR branch owner for branch_manager).
- Uses `auth.admin.createUser` to create the auth user with
  `email_confirm: true` so no confirmation email is sent.
- Calls the matching `add_org_admin` / `add_branch_manager` RPC.
- Best-effort rollback (deletes the auth user) if the role-linking RPC
  fails, so retries don't leave orphan accounts.

Deploy (note: NO `--no-verify-jwt` — caller must be authenticated):
```bash
supabase functions deploy admin-create-user
```

The admin app's `addOrgAdminToExisting`, `createBranchManager`, and
`createOrgWithOwner` all detect deployment and switch over automatically.

## Deploy all three at once

```bash
supabase secrets set RAZORPAY_WEBHOOK_SECRET=whsec_...
supabase functions deploy place-order      --no-verify-jwt
supabase functions deploy razorpay-webhook --no-verify-jwt
supabase functions deploy admin-create-user
```

## Smoke test after deploy

```bash
supabase functions logs place-order      --tail
supabase functions logs razorpay-webhook  --tail
supabase functions logs admin-create-user --tail
```

Then in the customer app, place a real test order — you should see the
`place-order` log fire, and the order in DB with `payment_status='pending'`.
Hit "Pay" on the Razorpay widget, complete with test card
`4111 1111 1111 1111` / OTP `1234`, then watch `razorpay-webhook`
flip `payment_status` to `'success'`.
