# FoodCourt — Customer Mobile App (Flutter)

Native Flutter twin of the customer web app in `apps/customer`. Same Supabase
project, same Edge Functions, same RLS — so changes you make on the web admin
flow straight through to mobile customers.

## Status

This is a **starter scaffold**, not a finished app. The skeleton boots, talks
to your Supabase project, lets a customer sign in (OTP or guest), browse the
menu, fill a cart, and place an order via the existing `place-order` Edge
Function. Everything else listed under [Roadmap](#roadmap) is the work that
remains for full parity with the web app.

The IDE may flash hundreds of red-squiggle errors right now — that's just
"Flutter SDK isn't installed yet". They'll vanish after `flutter pub get`.

## Prereqs

1. **Flutter SDK 3.22 or newer.** `https://docs.flutter.dev/get-started/install`.
2. **Android Studio** (for Android emulator) and/or **Xcode** (for iOS).
3. The same Supabase URL + anon key the web app uses (see `apps/customer/.env`).

## Setup

```bash
cd apps/customer_mobile

# 1. Drop the env file in. assets/.env is .gitignore'd.
cp assets/.env.example assets/.env
# then edit assets/.env with the same SUPABASE_URL + SUPABASE_ANON_KEY
# the web app uses, plus a DEFAULT_RESTAURANT_SLUG.

# 2. Fetch packages.
flutter pub get

# 3. (Android) make sure an emulator is running, or plug in a device.
flutter devices

# 4. Run.
flutter run
```

That's it. The app boots into `/scan` (the single-QR table chooser); if the
branch isn't in single-QR mode you can skip to `/login` then `/menu` via the
nav code.

## What's in this scaffold

| Path                                              | What it does                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------- |
| `lib/main.dart`                                   | App boot. Loads env, inits Supabase, mounts router.              |
| `lib/core/env.dart`                               | `flutter_dotenv` loader.                                         |
| `lib/core/supabase.dart`                          | Supabase client provider.                                        |
| `lib/core/theme.dart`                             | Brand palette + Material 3 theme matching the web app's brand-*. |
| `lib/data/models.dart`                            | `Restaurant`, `MenuItem`, `Category`, `DiningTable`.             |
| `lib/data/repository.dart`                        | Every Supabase query the app needs.                              |
| `lib/features/auth/auth_controller.dart`          | OTP + guest sign-in. 7-day TTL persistence.                      |
| `lib/features/auth/login_screen.dart`             | Phone → OTP → name screen, plus guest button.                    |
| `lib/features/restaurant/`                        | Providers + single-QR `TableChooserScreen`.                      |
| `lib/features/menu/menu_screen.dart`              | Category chips + items list + add-to-cart.                       |
| `lib/features/cart/cart_controller.dart`          | Riverpod cart state (lines, order type, table).                  |
| `lib/features/cart/cart_screen.dart`              | Cart UI + bill summary + place-order via Edge Function.          |
| `lib/features/orders/order_placed_screen.dart`    | Confirmation screen.                                             |
| `lib/features/profile/profile_screen.dart`        | Account header + sign-out (placeholder for the rest).            |
| `lib/router/app_router.dart`                      | GoRouter with auth gate.                                         |

## Edge Functions

The mobile app calls the same Edge Functions deployed for the web app:

- `send-otp` — 2factor.in delivery
- `verify-otp` — issues `customer_id`, returns loyalty balance
- `place-order` — server-priced order placement

If these aren't deployed (or you're testing on a dev project), OTP sign-in and
order placement will fail with the function's error message. Deploy them via
`supabase functions deploy <name>` from the repo root.

## Roadmap (full parity)

This is what's left before "feature-complete with the web app". I've grouped
by the area of the codebase to make follow-up sessions easy to scope.

### Auth & profile

- [ ] **Address book** — `customer_addresses` CRUD screen with map pin (web has it).
- [ ] **FoodCoins / Loyalty wallet** — list transactions, show balance, "apply coins" toggle on cart.
- [ ] **Order history** — list + filter (active / history), with deep-link to tracking.
- [ ] **Profile-level coupon list** — see what's available + per-user limit hints.

### Browsing & menu

- [ ] **Hero slider** — port the web `HeroSlider` (auto-rotating carousel with cross-fade).
- [ ] **Item detail modal** — variants + modifiers + spice level + add-to-cart with options.
- [ ] **Smart-sell engine** — "you're ₹40 away from this combo" banner above the cart.
- [ ] **Search bar** — fuzzy search inside Menu.

### Cart & checkout

- [ ] **GPS gated delivery** — radius check via `geolocator` + manual address fallback.
- [ ] **Coupon code box** — apply / remove / per-user-limit enforcement (the web app already counts prior usage via `getCustomerCouponUsage`).
- [ ] **FoodCoins redeem** — slider for "use coins" up to balance.
- [ ] **Razorpay** — `razorpay_flutter` is already in `pubspec.yaml`; wire the success / failure callbacks to mark the order paid via your existing webhook.
- [ ] **Customer notes textarea** under each line + a global one.

### Live order tracking

- [ ] **Real-time status** — Supabase Realtime channel on `orders.id` and `order_status_events`. Render per-type label (dine_in / takeaway / delivery) using the shared `statusLabel` helper from the web app.
- [ ] **ETA + last update timestamp.**

### Restaurant

- [ ] **TableChooser** is already in for single-QR mode but lacks **deep-link parsing** — register `https://your-domain/{slug}/scan` so scanning opens the app directly. Skeleton's in `AndroidManifest.xml`; needs `.well-known/assetlinks.json` on the customer Vercel deployment.
- [ ] **Branch discovery** — landing list of restaurants when no slug is provided.

### Polish

- [ ] **Push notifications** for status changes (FCM).
- [ ] **In-app updates** via `in_app_update` package.
- [ ] **Localisation** scaffold (the web app is English-only today; mobile is a good place to start i18n).

## Conventions

- **Riverpod** for state. Plain `Provider` / `StateNotifierProvider` / `FutureProvider` — no codegen.
- **GoRouter** for routing. The auth gate is in `lib/router/app_router.dart`.
- **No JSON codegen** — `Model.fromMap(Map<String, dynamic>)` constructors keep diffs readable.
- **One file per screen.** No god-files.
- **Brand colours** live only in `lib/core/theme.dart`. Don't hardcode `Color(0x…)` in widgets unless it's a one-off accent.

## Known gaps in this scaffold

- No tests yet.
- iOS `Runner` Xcode project isn't in the repo — generate with `flutter create --platforms=ios .` inside this directory if you want to ship to App Store.
- The `MainActivity.kt` and Gradle config Flutter normally generates aren't here either. Run `flutter create --platforms=android,ios .` once in this directory to bootstrap the platform folders before `flutter run`. Pubspec, lib/, assets/, and the AndroidManifest in this repo are designed to coexist with the auto-generated ones.
