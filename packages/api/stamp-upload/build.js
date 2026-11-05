const esbuild = require('esbuild');

esbuild
  .build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node24',
    outfile: 'dist/index.js',
    external: ['@aws-sdk/*'],
    sourcemap: true,
    minify: false,
  })
  .then(() => {
    console.log('✅ Build completed successfully');
  })
  .catch(() => process.exit(1));
