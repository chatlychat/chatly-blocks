/*
 * Build: declarations with tsc, then one self-contained ESM file with vite.
 *
 * The bundle holds the server's zod schemas AND zod, so the package installs
 * with no dependencies. Whatever is imported from @livechat/* or zod is
 * inlined; nothing is left external, and the final check fails the build if a
 * bare import survives.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import { build } from 'vite';

const root = fileURLToPath(new URL('..', import.meta.url));
rmSync(`${root}dist`, { recursive: true, force: true });
// tsc's own entry under this node, not `npx`: Windows has no `npx` executable to spawn without a shell.
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');
execFileSync(process.execPath, [tsc, '-p', 'tsconfig.json', '--emitDeclarationOnly', '--declarationMap', 'false'], { cwd: root, stdio: 'inherit' });

await build({
  root,
  logLevel: 'warn',
  configFile: false,
  resolve: {
    alias: {
      // Source, not the package's dist, so a build never bundles a stale schema.
      '@livechat/shared/widget-blocks': fileURLToPath(
        new URL('../../shared/src/widget-blocks/index.ts', import.meta.url),
      ),
    },
  },
  build: {
    target: 'es2019',
    outDir: 'dist',
    emptyOutDir: false,
    minify: false,
    lib: { entry: 'src/index.ts', formats: ['es'], fileName: () => 'index.js' },
    rollupOptions: { treeshake: { moduleSideEffects: false } },
  },
});

const out = readFileSync(`${root}dist/index.js`, 'utf8');
const bare = out.match(/^\s*(?:import|export)\s[^'"]*from\s*['"][^./][^'"]*['"]/gm);
if (bare) {
  throw new Error(`dist/index.js has runtime imports: ${bare.join('; ')}`);
}
console.log(`blocks: dist/index.js ${out.length} bytes, no runtime imports`);
