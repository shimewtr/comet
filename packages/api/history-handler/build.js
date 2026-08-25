const esbuild = require('esbuild');

esbuild
  .build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node22',
    outfile: 'dist/index.js',
    external: ['@aws-sdk/*'],
    format: 'cjs',
    sourcemap: true,
  })
  .catch(() => process.exit(1));
