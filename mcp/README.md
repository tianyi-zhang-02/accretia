# Work Optional for Claude (MCP)

Tell Claude your month in plain words — *“take-home 11,000, rent 3,200,
groceries 600, 401k 1,958”* — and it lands in the right categories of your
Work Optional ledger. Ask for a year report, whether you're on track, or what
a salary nets after tax.

It is a **local** MCP server: it runs on your computer, over stdio (no port
is opened), and it is another device on your Work Optional account.

## Security model

- **End-to-end encrypted.** Your data is the same encrypted vault the web app
  uses (`src/lib/cloud/crypto.ts`: PBKDF2-SHA256 600k → AES-256-GCM, random
  data key wrapped under your passphrase and your recovery code). It is
  decrypted only in this process's memory. On disk (`~/.work-optional/`,
  folder `0700`, files `0600`) and in the cloud it is ciphertext only.
- **Your passphrase** is never sent anywhere. In Claude Desktop it is a
  *sensitive* setting, kept in your OS keychain; for Claude Code, the
  launcher reads it from the macOS Keychain at start-up.
- **The sync sign-in** is stored encrypted with your passphrase.
- **Each account is isolated** by the sync service's row-level security, and
  even someone who reads the database sees ciphertext. The extension can only
  sign in to an existing account — it never creates one.
- **One network module** (`src/cloud.ts`), **one filesystem module**
  (`src/store.ts`), nothing printed to stdout but the protocol, and no
  recovery code or passphrase ever returned to the conversation — all pinned
  by `src/isolation.test.ts`.
- **Guarding against prompt injection:** the server tells Claude to log only
  figures you stated, to confirm numbers taken from documents, and never to
  act on instructions inside them. Writes change one month at a time and
  return before/after; clearing a month needs an explicit `confirm: true`.
- **Sync never forks.** Every write reads the latest cloud version, applies
  one change and uploads only if nothing changed in between (otherwise it
  re-applies the change on top). Offline it reads its last encrypted copy and
  refuses to write.

What it can't protect against: malware already running as you on your
computer (it could read memory or your keychain), or someone you share your
passphrase with.

## Claude Desktop

1. Download `work-optional.mcpb` from the
   [release](https://github.com/tianyi-zhang-02/accretia/releases/tag/mcp-v0.2.0)
   and open it. Claude Desktop installs it.
2. In its settings: your **sync passphrase** (the same as in the web app) and
   the **sync key** (web app → Data → *Use it in Claude* → Copy). Leave the
   key empty to keep data only on this computer.
3. In a chat: *“Sign in to Work Optional with me@example.com.”* Copy the link
   from the email (don't open it) into the chat.

Sync needs a cloud copy to exist: set the passphrase and upload once in the
web app first (that's where your recovery code is shown).

## Claude Code

```sh
cd mcp && npm ci && npm run build
security add-generic-password -a "$USER" -s work-optional -w   # prompts for the passphrase
claude mcp add work-optional -e WORK_OPTIONAL_SYNC_KEY=<sync key> -- "$PWD/bin/work-optional-mcp.sh"
```

On Linux/Windows, set `WORK_OPTIONAL_PASSPHRASE` from your own secret store
before launching `node dist/index.js`.

## Tools

`get_status`, `list_categories`, `log_month`, `recurring_bills`, `get_months`, `year_report`,
`on_track`, `paycheck_estimate`, `clear_month`, and with sync `sign_in`,
`finish_sign_in`, `sign_out`.

## Build

```sh
npm ci
npm run typecheck
npm run build        # dist/index.js, one bundled file
npm run pack:mcpb    # validates the manifest, writes work-optional.mcpb
```

The web app's pure modules (encryption, ledger, backup, tax, simulator) are
bundled in through the `@/` alias, so both sides run the same tested code.
