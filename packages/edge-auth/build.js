const esbuild = require('esbuild');

esbuild
  .build({
    entryPoints: ['src/index.ts'],
    bundle: true,
    platform: 'node',
    target: 'node20',
    format: 'cjs',
    outfile: 'dist/index.js',
    // config.jsonはCDKがデプロイ時にアセットへ同梱する（バンドルに焼き込まない）
    // AWS SDKはLambdaランタイム同梱のものを使う
    external: ['./config.json', '@aws-sdk/*'],
    sourcemap: false,
    minify: false,
  })
  .then(() => {
    console.log('✅ Build completed successfully');
  })
  .catch(() => process.exit(1));
