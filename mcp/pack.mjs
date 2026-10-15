// Assemble and pack the Claude Desktop extension (.mcpb): the manifest plus
// the single bundled server file. No node_modules ship.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

const out = '.build-mcpb';
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(`${out}/server`, { recursive: true });
fs.copyFileSync('manifest.json', `${out}/manifest.json`);
fs.copyFileSync('dist/index.js', `${out}/server/index.js`);
fs.copyFileSync('../LICENSE', `${out}/LICENSE`);
execFileSync('npx', ['-y', '@anthropic-ai/mcpb@2.1.2', 'validate', `${out}/manifest.json`], { stdio: 'inherit' });
execFileSync('npx', ['-y', '@anthropic-ai/mcpb@2.1.2', 'pack', out, 'work-optional.mcpb'], { stdio: 'inherit' });
fs.rmSync(out, { recursive: true, force: true });
