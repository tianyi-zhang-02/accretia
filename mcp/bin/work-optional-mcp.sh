#!/bin/sh
# Launcher for terminal MCP clients — Claude Code, Codex, anything that runs
# a stdio server — on macOS. It reads your passphrase from the Keychain at
# start-up, so it never sits in a config file, then starts the server.
#
# One-time setup (you're prompted for the passphrase; nothing is echoed):
#   security add-generic-password -a "$USER" -s work-optional -w
#
# Then register this script with your client, e.g.:
#   claude mcp add work-optional -e WORK_OPTIONAL_SYNC_KEY=<sync key> -- /path/to/work-optional-mcp.sh
#   codex mcp add work-optional --env WORK_OPTIONAL_SYNC_KEY=<sync key> -- /path/to/work-optional-mcp.sh
#
# Clients may start servers with a minimal environment, so nothing here
# relies on your shell's PATH or USER being set.
ACCOUNT="${USER:-$(id -un)}"
WORK_OPTIONAL_PASSPHRASE="$(/usr/bin/security find-generic-password -a "$ACCOUNT" -s work-optional -w)" || {
  echo "work-optional: no Keychain item 'work-optional' — see the comment at the top of this script." >&2
  exit 1
}
export WORK_OPTIONAL_PASSPHRASE

DIR="$(cd "$(dirname "$0")" && pwd)"
# Next to the downloaded release file, or inside a checkout (mcp/bin → mcp/dist).
if [ -f "$DIR/work-optional-mcp.mjs" ]; then
  SERVER="$DIR/work-optional-mcp.mjs"
else
  SERVER="$DIR/../dist/index.js"
fi

NODE="$(command -v node 2>/dev/null)"
for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
  if [ -z "$NODE" ] && [ -x "$candidate" ]; then NODE="$candidate"; fi
done
if [ -z "$NODE" ]; then
  echo "work-optional: Node.js 20 or newer is needed — install it from nodejs.org." >&2
  exit 1
fi
exec "$NODE" "$SERVER"
