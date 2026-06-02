# Self-hosting tracker

Run your own copy of **tracker**. End state: a private personal-finance PWA running on your domain, with your own database, your own auth, and no shared infrastructure with anyone else's instance.

This guide assumes you're not the original author — every step is written from scratch. If a step doesn't work exactly as written, open an issue.

---

## Why you'd self-host

- **Your data, your database.** RLS on every table guarantees a stranger can't read your rows even if they had the same code running. But the strongest guarantee is that you own the database.
- **Your API quotas.** Alpha Vantage's free tier is 25 calls/day. Shared across users it gets thin; your own key is yours alone.
- **You can audit + modify.** Public GitHub repo, MIT license, no opaque blobs.

If you just want to try the simulator without committing to setup, the original author's public `/sim` instance does that — no login, no data stored: see the project's live URL.

---

## Prereqs (~15 min to set up the accounts)

You'll need:

| Service | Plan | Cost | Why |
|---|---|---|---|
| **GitHub** | personal | free | host your fork |
| **Supabase** | Free | $0/mo | Postgres + magic-link auth |
| **Vercel** | Hobby | $0/mo | host the Next.js app |
| **Alpha Vantage** | free tier | $0 | stock/crypto quotes (25 calls/day) |
| **Node.js** | ≥ 20 (≥ 20.19 recommended) | local | development + build |
| **npm** | shipped with Node | local | package manager |
| **Git** | any | local | version control |

All four cloud services have free tiers sized comfortably for one or two personal users. No credit card needed at any step.

---

## 1. Fork and clone

1. On GitHub, **fork** `https://github.com/tianyi-zhang-02/tracker` to your account.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/<your-username>/tracker.git
   cd tracker
   ```
3. Install dependencies:
   ```bash
   npm install
   ```

Expect ~580 packages, ~30 seconds. `npm install` triggers the `prepare` script, which sets up the husky-managed pre-commit hook at `.husky/pre-commit`.

### Recommended: install `gitleaks` locally so the pre-commit hook actually scans

The pre-commit hook runs `gitleaks` against your staged diff every time you commit, blocking accidentally-staged secrets (API keys, JWTs, etc.) before they reach GitHub. **You need to install `gitleaks` separately** — it's not an npm package, and the hook is a no-op without it. The hook will still let your commits through, but it will only print "gitleaks not installed — skipping" instead of catching real leaks.

This repo is **public**. If you self-host, you almost certainly want the scan.

```bash
# macOS
brew install gitleaks

# Linux (binary download or your package manager)
# https://github.com/gitleaks/gitleaks#installing

# Cross-platform via Go (if you have a Go toolchain)
go install github.com/gitleaks/gitleaks/v8@latest
```

Sanity-check by faking a leak in an untracked file and trying to stage + commit it:

```bash
echo 'TEST="ghp_SOMETOKENVALUE1234567890abcdef1234567890"' > /tmp/leak-test.env
git add -f /tmp/leak-test.env
git commit -m "test gitleaks"
# → expected: gitleaks blocks the commit with a finding. Run:
#     git reset HEAD /tmp/leak-test.env && rm /tmp/leak-test.env
# to clean up.
```

To bypass the hook for a single legitimate commit (rare — be sure first): `git commit --no-verify`.

---

## 2. Create a Supabase project

1. Sign in at [supabase.com](https://supabase.com).
2. **New project** → pick an organization, name it (anything), choose a region close to you, set a database password, **create**. Setup takes ~2 min.
3. While it provisions, head to **Project Settings → API**. You'll need three values from this page in the next steps — leave the tab open.

---

## 3. Apply schema + migrations

In your Supabase project, open **SQL Editor → New query**.

### 3a. Run `schema.sql`

Open `supabase/schema.sql` in your editor, copy the entire file, paste into the SQL editor, **Run**. Expect "Success. No rows returned."

This creates `accounts`, `transactions`, `account_snapshots`, `savings_goals`, `holdings`, `price_cache`, `user_settings`, `scenarios`. RLS is enabled on every user table with `auth.uid() = user_id` as the only policy.

### 3b. Run each migration in order

In `supabase/migrations/`, run **each file** in numerical order:

1. `0001_scenarios.sql` — no-op on a fresh project (the `scenarios` table is already in `schema.sql`), but safe to run.
2. `0002_revoke_rls_auto_enable_grants.sql` — **required.** Restricts a Supabase-auto-installed SECURITY DEFINER function to `service_role` only. Without this, an authenticated user could escalate privileges via PostgREST.

See `supabase/migrations/README.md` for details on each.

### 3c. Verify

Still in the SQL editor, paste and run:

```sql
-- Should list every public table, each with rowsecurity = true.
select tablename, rowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Every row — including `price_cache` — should show `rowsecurity = true`. The reason this matters for `price_cache` is that it has RLS **enabled** but **no policies**, so `anon` and `authenticated` callers are effectively locked out. Only the service-role key (which bypasses RLS by design) can read or write it. That's deliberate: `price_cache` is the server-only cache for Alpha Vantage quote responses; it's never touched directly by the browser.

If any user table shows `rowsecurity = false`, stop — that's a security regression. Re-run `schema.sql` and check the migration didn't error silently.

---

## 4. Configure Supabase Auth

Authentication is magic-link only — no passwords.

1. **Authentication → Providers → Email** → confirm **Email provider** is on (default). Leave **Confirm email** on if you want OTP. **"Allow new users to sign up"** should be on for at least your first sign-in; you can disable it after to lock the project to existing users.
2. **Authentication → URL Configuration**:
   - **Site URL** → `http://localhost:3000` for local dev (you'll add the production URL later in Step 8).
   - **Redirect URLs** → add `http://localhost:3000/auth/confirm`.
3. **Authentication → Email Templates → Magic Link** → the template body needs **two things**:
   - The 8-digit code (`{{ .Token }}`) for users who want to type it into the sign-in form.
   - A clickable link to `/auth/confirm?token_hash={{ .TokenHash }}&type=email` for users who'd rather click.

   The `?type=email` parameter is **required** — `src/app/auth/confirm/route.ts` reads `searchParams.get('type')` and rejects (`/login?error=invalid_link`) if it's missing. Default Supabase templates omit it for the magic-link flow; you have to put it in by hand.

   Example minimal body covering both paths:
   ```html
   <h2>Your sign-in code</h2>
   <p>Enter this 8-digit code in the sign-in form:</p>
   <p style="font-size: 24px; font-weight: bold; letter-spacing: 2px;">{{ .Token }}</p>

   <p>Or click this link to sign in directly:</p>
   <p><a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">
     Sign in to tracker
   </a></p>

   <p style="color: #999; font-size: 12px;">Code expires in 60 minutes. If you didn't request this, ignore the email.</p>
   ```

   > **Sanity check:** the default Supabase template uses `{{ .ConfirmationURL }}` instead of a hand-built `?type=email` URL. `{{ .ConfirmationURL }}` works for the email-change flow but **not** for the magic-link flow on this project's `/auth/confirm` route. Replace it with the form above or links will silently fail with `?error=invalid_link`.

> **Optional but recommended:** flip **Leaked password protection** under Authentication → Providers → Email. The project is magic-link only so this is purely defensive, but it's free.

### 4a. Use Resend for SMTP (strongly recommended for production)

Supabase's default email sender is intended for development. Free-tier deliverability is rough — codes routinely land in spam, and there's a per-hour cap (~4 emails/hour by default) that's easy to hit if you sign in a few times in a row. Plug in a real SMTP provider.

[Resend](https://resend.com) is the simplest fit: free tier covers 3,000 emails/month, instant setup, no card. Other SMTP providers (Postmark, Mailgun, AWS SES) work the same way.

1. Sign up at [resend.com](https://resend.com).
2. **Add a domain** under Domains → Add Domain (e.g. `mail.yourdomain.com`). Resend gives you 3 DNS records (SPF, DKIM, MX) — add them in your DNS host's panel. Verification takes a few minutes.
   - If you don't own a domain yet, you can skip ahead and use Resend's test address (`onboarding@resend.dev`) — but emails will only deliver to the address you signed up with. Fine for a first sign-in, not viable long-term.
3. **API Keys → Create API Key.** Permission scope: "Sending access" to the domain you added. Copy the key.
4. In **Supabase → Authentication → Settings → SMTP Settings**:
   - **Enable Custom SMTP** → on
   - **Sender email** → `noreply@mail.yourdomain.com` (must be on the verified domain)
   - **Sender name** → `tracker` (or whatever)
   - **Host** → `smtp.resend.com`
   - **Port** → `465` (TLS) or `587` (STARTTLS) — either works
   - **Username** → `resend` (literal string)
   - **Password** → the API key from step 3
   - **Save**.
5. **Test it.** Try a sign-in. The email should arrive in seconds and skip spam.

If Resend rejects sends with `403`, your domain isn't fully verified yet — DNS records can take up to 24 hours to propagate.

> **Why not use Supabase's free email sender?** It's rate-limited to a few sends per hour per project, and deliverability to Gmail/iCloud/Outlook is unreliable. Both problems silently break sign-in. Resend (or any real SMTP) makes the auth flow trustworthy.

---

## 5. Get an Alpha Vantage API key

1. Go to [alphavantage.co/support/#api-key](https://www.alphavantage.co/support/#api-key).
2. Fill in the form (email + a reason — "personal portfolio tracking" is fine). No credit card, instant key.
3. Save the key — you'll paste it in the next step.

Free tier limits: **25 calls/day** and **5 calls/minute**. The app caches aggressively (`price_cache` table; 1h TTL for crypto + market-hours equities, 24h otherwise) so a single user with a typical portfolio comfortably stays inside the quota.

---

## 6. Local development setup

1. Copy the env-var template:
   ```bash
   cp .env.example .env.local
   ```
2. Fill in `.env.local` with the values from Steps 2 (Supabase) and 5 (Alpha Vantage):

   | Variable | Where from | Notes |
   |---|---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → API → Project URL | Public — embedded in browser bundle |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → Project Settings → API → `anon` public key | Public — embedded in browser bundle |
   | `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API → `service_role` key | **Server-only.** Never set as a `NEXT_PUBLIC_*` var, never log it, never include in client code |
   | `ALPHAVANTAGE_API_KEY` | Step 5 | **Server-only.** Same rules. The exact name is `ALPHAVANTAGE_API_KEY` — no underscore between `ALPHA` and `VANTAGE`. `src/lib/env.server.ts` reads exactly this name |
   | `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` locally | Used for the Origin-header CSRF check. Set this to your **exact** production URL (with `https://`, no trailing slash) in Vercel later |

3. Start the dev server:
   ```bash
   npm run dev
   ```
   → http://localhost:3000

4. Visit the URL, enter your email, retrieve the 8-digit code from your inbox (check spam if it's been a few minutes), paste, sign in. You should land on the dashboard with no data — empty state.

If sign-in fails silently, jump to **Troubleshooting → Auth round-trip** below.

---

## 7. Deploy to Vercel

Tracker is a vanilla Next 16 App Router project. **No `vercel.json` is required** — Vercel's Next 16 adapter handles everything.

1. At [vercel.com](https://vercel.com), **Add New… → Project** → import your forked repo.
2. Framework preset: **Next.js** (auto-detected). Leave build command, output directory, install command at their defaults.
3. **Don't deploy yet** — add env vars first.
4. **Project Settings → Environment Variables.** Add all five variables from your `.env.local`, scoped to **Production** (and **Preview** if you want preview deploys to be functional). Use the **exact** names from Step 6 — typos here surface as "Missing required environment variable" at runtime, not at build.
5. For `NEXT_PUBLIC_APP_URL` in production, use whatever your Vercel URL is (e.g. `https://your-app-name.vercel.app`) — or your custom domain if you've added one. **Exact** scheme + host + no trailing slash. The Origin check rejects mismatches.
6. **Deploy.** Build takes ~2–3 minutes.

---

## 8. Wire up Supabase Auth for production

When the Vercel deploy is green:

1. **Supabase → Authentication → URL Configuration**:
   - **Site URL** → your production URL (e.g. `https://your-app-name.vercel.app`).
   - **Redirect URLs** → **add** `https://your-app-name.vercel.app/auth/confirm`. Keep `http://localhost:3000/auth/confirm` in the list so you can still sign in locally.

Without these, magic-link sign-ins in production redirect to the wrong host and silently fail.

---

## 9. First production sign-in

Open the production URL in a fresh incognito window. Sign in with the same email you used locally. If everything's wired up, you'll land on the dashboard. Add an account, a transaction, take a snapshot, confirm the dashboard total updates.

---

## 10. Optional polish

### Custom domain
Vercel → Project → Domains → add your domain → follow the DNS steps. After it activates, **update `NEXT_PUBLIC_APP_URL`** in Vercel env vars to the new domain, **redeploy**, and **update Supabase's Site URL + Redirect URLs** to match. The Origin check + magic-link redirect both depend on the exact production URL.

### PWA install
On iOS Safari or Chrome on Android, open the production URL → "Add to Home Screen". The app installs as a standalone PWA with the warm-gold icon. The hand-rolled service worker (`public/sw.js`) handles offline shell + install endpoints.

### Backup
`/settings/export` offers three downloads: transactions CSV, holdings CSV, and a full JSON backup. The JSON backup supports **optional client-side AES-GCM encryption** (PBKDF2-SHA-256, 600k iterations, OWASP 2023). The passphrase never leaves the browser; no server route is involved. Take an encrypted backup before applying any new migration that touches your data.

---

## Maintaining your fork

When the upstream repo ships new features:

1. Pull `main` from upstream:
   ```bash
   git remote add upstream https://github.com/tianyi-zhang-02/tracker.git  # one-time
   git fetch upstream main
   git merge upstream/main
   ```
2. Check `CHANGELOG.md`'s `[Unreleased]` and the latest milestone for any **new migrations** under `supabase/migrations/`. If new ones appeared:
   - Take an encrypted backup of your data first (`/settings/export`).
   - Apply each new migration **in numerical order** via Supabase SQL Editor.
3. Push to your fork — Vercel auto-deploys.

> **Always backup before applying a migration.** Migrations are forward-only by project convention; the only safe rollback is restoring from a backup.

---

## Troubleshooting

### Auth round-trip fails silently

**Symptom:** Submit your email, never receive a code. Or paste the code, nothing happens.

**Causes, in likely order:**

1. **Magic-link template still uses `{{ .ConfirmationURL }}`.** Switch it to `{{ .Token }}` (Step 4).
2. **Site URL / Redirect URL mismatch.** Supabase must have the exact URL the user is visiting (Step 4 for local, Step 8 for prod).
3. **Spam folder.** Supabase's free-tier email-sender deliverability is rough on some providers.
4. **OTP rate-limited.** The dev limit is per-IP, 5/hour. Wait an hour or open from a different IP.

### "Missing required environment variable: X" at runtime

You set the variable name wrong in Vercel. Compare against the table in Step 6 — `ALPHAVANTAGE_API_KEY` is the most common mis-type (`ALPHA_VANTAGE_...` is wrong).

### Quotes endpoint returns "rate-limited"

Alpha Vantage free tier hit. `price_cache` will serve stale prices until the cache TTL expires; the dashboard balance for any brokerage/retirement/crypto account using live-holdings fallback may not reflect today's price for a few hours. To raise the cap, upgrade Alpha Vantage or self-host with a different provider (would require code changes in `src/lib/quotes/`).

### Build fails on Vercel with "Module not found"

Make sure `package-lock.json` is committed. Vercel installs via `npm ci` which requires the lockfile. The repo commits it; if you deleted it, restore from upstream.

### CSP errors in DevTools console

Step 13 enforces a strict CSP with per-request nonces. Modifications to the proxy (`src/proxy.ts`) or to layouts can break nonce coverage. If you see `Refused to execute inline script because of CSP`, check:
- The page is dynamically rendered (uses `await connection()` in its server component or otherwise dynamic).
- You haven't added a `<script>` tag without a `nonce={nonce}` prop.

The public `/sim` page is a good reference for "what a CSP-compliant page looks like."

### Friends sign up on YOUR instance

By design, anyone with the URL can sign up via magic-link unless you disabled new signups (Step 4). To lock down to existing users only, **Supabase → Authentication → Providers → Email → "Allow new users to sign up" → off**. Existing users keep working; new email addresses are rejected at OTP send.

### "I want to share my simulator with friends without giving them an account"

The public `/sim` route is exactly that. It's already live on your instance — share `https://your-url/sim`. Friends use the simulator entirely client-side; nothing they enter touches your database. See `PUBLIC_SIM_AND_PRIVATE_FEATURES_SPEC.md` Workstream A for the security model and `src/app/sim/` for the implementation.

---

## What's NOT in this guide (out of scope)

- **Branding / theme changes.** The accent color, fonts, and copy are all customizable in `globals.css` and the various component files, but that's beyond "get a working instance up."
- **Multi-user / household sharing.** Tracker is single-user per account by design — see "What NOT to Do" in `CLAUDE.md`. The architecture doesn't support shared accounts; if you want this, fork harder.
- **Bank linking / Plaid / etc.** Explicitly rejected by the project's threat model.
- **Data import beyond CSV + JSON.** Phase 5 of the post-v1 roadmap adds a brokerage CSV importer; until that ships, manual entry is the only way to seed holdings.

---

If a step above broke for you, open an issue with the exact error message and which step it was. PRs to this guide are welcome — accuracy is more valuable than completeness.
