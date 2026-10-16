// Files for terminal MCP clients (Claude Code, Codex, …), attached to each
// mcp-v* release next to the Claude Desktop .mcpb:
//   work-optional-mcp.mjs — the bundled server (ESM, hence .mjs: a lone
//                           .js would be loaded as CommonJS and fail)
//   work-optional-mcp.sh  — the macOS Keychain launcher
//   SHA256SUMS            — to check the downloads
// Run after `npm run build`. Writes to release/ (git-ignored).
import { createHash } from 'node:crypto';
import { chmodSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';

mkdirSync('release', { recursive: true });
copyFileSync('dist/index.js', 'release/work-optional-mcp.mjs');
copyFileSync('bin/work-optional-mcp.sh', 'release/work-optional-mcp.sh');
chmodSync('release/work-optional-mcp.sh', 0o755);
const sums = ['work-optional-mcp.mjs', 'work-optional-mcp.sh']
  .map((f) => `${createHash('sha256').update(readFileSync(`release/${f}`)).digest('hex')}  ${f}`)
  .join('\n');
writeFileSync('release/SHA256SUMS', sums + '\n');
console.error(sums);
