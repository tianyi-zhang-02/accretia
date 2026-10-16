import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated at build time from src/lib/pwa/service-worker.js (linted there).
    'public/sw.js',
    // The MCP server's build output and its own installed packages.
    'mcp/dist/**',
    'mcp/.build-mcpb/**',
    'mcp/node_modules/**',
    'mcp/*.mjs',
  ]),
]);

export default eslintConfig;
