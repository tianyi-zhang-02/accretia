// Bundle the server into ONE file (dist/index.js) so the extension ships
// with no node_modules. The web app's pure modules (encryption, ledger,
// backup, tax, simulator) are pulled in through the `@/` alias, so both
// sides share exactly the same, already-tested code.
import { build } from 'esbuild';

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node20',
  tsconfig: 'tsconfig.json',
  legalComments: 'none',
  // Some dependencies still call require(); give ESM output one.
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
  logLevel: 'warning',
});
console.error('built dist/index.js');
