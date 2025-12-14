const esbuild = require('esbuild');
const path = require('path');

async function build() {
  try {
    await esbuild.build({
      entryPoints: ['src/index.ts'],
      bundle: true,
      platform: 'node',
      target: 'node18',
      outfile: 'dist/index.js',
      external: [
        // AWS SDKは Lambda 環境に含まれているため外部化
        '@aws-sdk/*',
      ],
      format: 'cjs',
      sourcemap: true,
      minify: false, // デバッグしやすいように圧縮しない
      logLevel: 'info',
    });

    console.log('✅ Build completed successfully');
  } catch (error) {
    console.error('❌ Build failed:', error);
    process.exit(1);
  }
}

build();
