# Turning on accounts + encrypted sync

Cloud sync is **off** until you do this. Without the two environment
variables below, the account UI never renders and the app is exactly the
local-only app. These steps need *your* Supabase and Vercel logins — nobody
can do them on your behalf.

## 0. Clear out the old variables first
This Vercel project still has `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` (and possibly others) from the app's earlier, deleted Supabase backend. They're inert now — sync needs `NEXT_PUBLIC_CLOUD_SYNC=on` — but **delete them** in Vercel → Settings → Environment Variables before adding the new project's values, so an old key can't be paired with a new URL.

Deleting isn't optional: they were saved as **Secret**, and Vercel refuses to save a new value into a Secret whose name starts with `NEXT_PUBLIC_` (and a saved Secret can't be switched to Config). Re-create them as **Config**.

## 1. Create the Supabase project
1. https://supabase.com → **New project** (free tier is fine). Pick a region
   near your users and let it generate the database password — the app never
   uses it.
2. **SQL Editor → New query** → paste all of [`supabase/schema.sql`](../supabase/schema.sql) → **Run**.
3. **Table Editor → vaults** should show "RLS enabled" with four policies.
   Tick neither "expose new tables automatically" nor anything that widens
   grants: the schema grants `authenticated` select/insert/update/delete and
   nothing else (no TRUNCATE), and `anon` nothing.

## 2. Sign-in emails
Nothing to do. Supabase's default email carries a **sign-in link**; opening
it on the same device lands back on the site already signed in.

Optional, and only once you've added custom SMTP (the dashboard locks the
templates until then): put the code in the **Magic link or OTP** and
**Confirm sign up** templates so people can type it instead —

```html
<h2>Your Work Optional sign-in code</h2>
<p style="font-size:24px;letter-spacing:4px"><b>{{ .Token }}</b></p>
<p>Or <a href="{{ .ConfirmationURL }}">sign in with this link</a>. It expires in an hour.</p>
```

## 3. Tell Supabase where the site lives
**Authentication → URL Configuration**
- Site URL: `https://accretia.vercel.app`
- Redirect URLs: add `https://accretia.vercel.app` (and `http://localhost:3000` for local dev).

## 4. Give the site its two public values
**Project Settings → API** → copy **Project URL** and the **anon / publishable** key.
In **Vercel → Project → Settings → Environment Variables** add, for Production
(and Preview if you like):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_CLOUD_SYNC` | `on` — the explicit switch; without it the other two are ignored |
| `NEXT_PUBLIC_SUPABASE_URL` | the Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | the anon key |

Then **redeploy**. Both are public by design (they ship to every browser);
row-level security is what protects the data. **Never** put the
`service_role` key anywhere near this app.

For local dev, the same two lines go in `.env.local` (git-ignored).

## 5. Before inviting anyone
- The built-in email sender is rate-limited to a handful of emails an hour.
  For real use, add your own SMTP under **Authentication → SMTP Settings**.
- Test on two browsers: sign in on A, create a passphrase, upload; sign in
  on B, unlock with the same passphrase, download.
- Try a wrong passphrase — it must refuse.
- In **Table Editor → vaults**, confirm the `envelope` column is unreadable
  base64. If you can read anyone's numbers there, stop and investigate.

## What users should know (and the UI tells them)
- The passphrase never leaves their device. **If they forget it, the cloud
  copy cannot be recovered by anyone** — the local backup file is the net.
- Signing out forgets the key; they re-enter the passphrase next time.
- "Delete cloud copy" removes the server's copy and leaves local data alone.
  Deleting the *account* itself is done from your Supabase dashboard
  (Authentication → Users); the vault row goes with it.
