import { execFileSync } from 'node:child_process';
import * as path from 'node:path';
import * as lambda from 'aws-cdk-lib/aws-lambda';

/**
 * Bundle a TypeScript Lambda from source as part of CDK asset staging.
 *
 * Keeping this in CDK makes `cdk synth` and `cdk deploy` independent of a
 * pre-existing `dist` directory. The local path deliberately invokes the
 * installed esbuild binary directly, rather than a global pnpm/node shim.
 */
export function nodejsLambdaCode(packageName: string): lambda.Code {
  const sourceDirectory = path.resolve(__dirname, `../../api/${packageName}`);

  return lambda.Code.fromAsset(sourceDirectory, {
    bundling: {
      image: lambda.Runtime.NODEJS_22_X.bundlingImage,
      command: [
        'bash',
        '-c',
        'cp -R /asset-input /tmp/comet-lambda && cd /tmp/comet-lambda && npm install --no-save esbuild@0.28.2 && npx esbuild src/index.ts --bundle --platform=node --target=node22 --format=cjs --outfile=/asset-output/index.js --sourcemap --external:@aws-sdk/*',
      ],
      local: {
        tryBundle(outputDirectory) {
          execFileSync(require.resolve('esbuild/bin/esbuild'), [
            path.join(sourceDirectory, 'src/index.ts'),
            '--bundle',
            '--platform=node',
            '--target=node22',
            '--format=cjs',
            `--outfile=${path.join(outputDirectory, 'index.js')}`,
            '--sourcemap',
            '--external:@aws-sdk/*',
          ], { stdio: 'inherit' });
          return true;
        },
      },
    },
  });
}
