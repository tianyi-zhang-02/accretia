# Work Optional for Claude and Codex (MCP)

Tell your AI assistant — Claude Desktop, Claude Code, Codex, or any client
that runs local MCP servers — your month in plain words — *“take-home 11,000, rent 3,200,
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
  *sensitive* setting, kept in your OS keychain; for Claude Code and Codex,
  the launcher reads it from the macOS Keychain at start-up.
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
   [release](https://github.com/tianyi-zhang-02/accretia/releases/tag/mcp-v1.0.0)
   and open it. Claude Desktop installs it.
2. In its settings: your **sync passphrase** (the same as in the web app) and
   the **sync key** (web app → Data → *Use it in Claude or Codex* → Copy).
   Leave the key empty to keep data only on this computer.
3. In a chat: *“Sign in to Work Optional with me@example.com.”* Copy the link
   from the email (don't open it) into the chat.

Sync needs a cloud copy to exist: set the passphrase and upload once in the
web app first (that's where your recovery code is shown).

## Claude Code and Codex (macOS)

Both run the same single-file server through a small launcher that reads your
passphrase from the Keychain, so it is never written into a config file. The
web app's Data tab shows these commands with your site's sync key filled in.

```sh
mkdir -p ~/.work-optional-mcp && cd ~/.work-optional-mcp
curl -fsSL -O https://github.com/tianyi-zhang-02/accretia/releases/download/mcp-v1.0.0/work-optional-mcp.mjs \
           -O https://github.com/tianyi-zhang-02/accretia/releases/download/mcp-v1.0.0/work-optional-mcp.sh
chmod +x work-optional-mcp.sh
security add-generic-password -a "$USER" -s work-optional -w   # asks for the passphrase once

# Claude Code
claude mcp add work-optional -e WORK_OPTIONAL_SYNC_KEY=<sync key> -- ~/.work-optional-mcp/work-optional-mcp.sh
# Codex
codex mcp add work-optional --env WORK_OPTIONAL_SYNC_KEY=<sync key> -- ~/.work-optional-mcp/work-optional-mcp.sh
```

Each release also has `SHA256SUMS` (`shasum -a 256 -c SHA256SUMS` checks the
two files). Leave out the sync key for a local-only encrypted file.

For Codex the same thing in `~/.codex/config.toml` — with the recommended
approval setting, which lets read-only tools (status, reports, months) run
and asks you before anything that writes (logging a month, budgets, goals,
clearing):

```toml
[mcp_servers.work-optional]
command = "/Users/you/.work-optional-mcp/work-optional-mcp.sh"
env = { WORK_OPTIONAL_SYNC_KEY = "<sync key>" }
default_tools_approval_mode = "writes"
```

(`codex mcp add` doesn't set it; add the line to the server's table. In
`codex exec`, writes are refused unless approved — that is Codex keeping you
in charge, not an error.)

## Linux, Windows, other clients

Any MCP client that starts a stdio server works: run
`node work-optional-mcp.mjs` (Node 20+) with `WORK_OPTIONAL_PASSPHRASE` taken
from your own secret store — never written into a config file. In Codex,
`env_vars = ["WORK_OPTIONAL_PASSPHRASE"]` forwards it from the environment
Codex was started in instead of storing it:

```toml
[mcp_servers.work-optional]
command = "node"
args = ["/path/to/work-optional-mcp.mjs"]
env = { WORK_OPTIONAL_SYNC_KEY = "<sync key>" }
env_vars = ["WORK_OPTIONAL_PASSPHRASE"]
```

Tool inputs deliberately use only the JSON Schema subset every client handles
(one type per field — no unions or nullable fields), pinned by
`src/isolation.test.ts`.

## Tools

`get_status`, `list_categories`, `log_month`, `set_budgets`, `set_annual_expenses`, `set_savings_goals`, `recurring_bills`, `get_months`, `year_report`,
`on_track`, `paycheck_estimate`, `clear_month`, and with sync `sign_in`,
`finish_sign_in`, `sign_out`.

## Build

```sh
npm ci
npm run typecheck
npm run build        # dist/index.js, one bundled file
npm run pack:mcpb    # validates the manifest, writes work-optional.mcpb (Claude Desktop)
npm run release:assets  # release/: work-optional-mcp.mjs + launcher + SHA256SUMS
```

The web app's pure modules (encryption, ledger, backup, tax, simulator) are
bundled in through the `@/` alias, so both sides run the same tested code.
