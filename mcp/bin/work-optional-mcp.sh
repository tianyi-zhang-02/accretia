#!/bin/sh
# Claude Code launcher (macOS). Reads the passphrase from your Keychain at
# start-up so it never sits in a config file.
#
# One-time setup — you'll be prompted for the passphrase, nothing is echoed:
#   security add-generic-password -a "$USER" -s work-optional -w
#
# Then:
#   claude mcp add work-optional -e WORK_OPTIONAL_SYNC_KEY=<sync key> -- /path/to/mcp/bin/work-optional-mcp.sh
WORK_OPTIONAL_PASSPHRASE="$(security find-generic-password -a "$USER" -s work-optional -w)" || {
  echo "work-optional: no Keychain item 'work-optional' — see the comment at the top of this script." >&2
  exit 1
}
export WORK_OPTIONAL_PASSPHRASE
exec node "$(cd "$(dirname "$0")/.." && pwd)/dist/index.js"
