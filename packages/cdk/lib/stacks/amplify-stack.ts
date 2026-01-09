import * as cdk from 'aws-cdk-lib';
import * as amplify from 'aws-cdk-lib/aws-amplify';
import { Construct } from 'constructs';

export interface AmplifyStackProps extends cdk.StackProps {
  envName: string;
  githubRepo?: string;
  githubBranch?: string;
  githubToken?: string;
}

export class AmplifyStack extends cdk.Stack {
  public readonly amplifyApp: amplify.CfnApp;

  constructor(scope: Construct, id: string, props: AmplifyStackProps) {
    super(scope, id, props);

    // Amplify Hosting App
    this.amplifyApp = new amplify.CfnApp(this, 'WebApp', {
      name: `comet-web-${props.envName}`,
      platform: 'WEB',
      customRules: [
        {
          source:
            '</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json)$)([^.]+$)/>',
          target: '/index.html',
          status: '200', // SPA routing support - only for non-asset paths
        },
      ],
      environmentVariables: [
        {
          name: 'AMPLIFY_MONOREPO_APP_ROOT',
          value: 'packages/web',
        },
        {
          name: '_LIVE_UPDATES',
          value: JSON.stringify([
            {
              pkg: 'node',
              type: 'nvm',
              version: '22',
            },
          ]),
        },
      ],
      buildSpec: `version: 1
frontend:
  phases:
    preBuild:
      commands:
        - npm install -g pnpm@10
        - pnpm install
        - pnpm build:shared
    build:
      commands:
        - cd packages/web
        - pnpm build
  artifacts:
    baseDirectory: packages/web/dist
    files:
      - '**/*'
  cache:
    paths:
      - node_modules/**/*
      - packages/*/node_modules/**/*`,
    });

    // GitHub連携を使う場合（オプション）
    if (props.githubRepo && props.githubBranch && props.githubToken) {
      const [owner, repo] = props.githubRepo.split('/');

      new amplify.CfnBranch(this, 'MainBranch', {
        appId: this.amplifyApp.attrAppId,
        branchName: props.githubBranch,
        enableAutoBuild: true,
        enablePullRequestPreview: false,
      });

      // GitHub OAuth token (Secrets Managerから取得することを推奨)
      this.amplifyApp.accessToken = props.githubToken;
      this.amplifyApp.repository = `https://github.com/${owner}/${repo}`;
    }

    // Outputs
    new cdk.CfnOutput(this, 'AmplifyAppId', {
      value: this.amplifyApp.attrAppId,
      description: 'Amplify App ID',
      exportName: `CometAmplifyAppId-${props.envName}`,
    });

    new cdk.CfnOutput(this, 'AmplifyDefaultDomain', {
      value: this.amplifyApp.attrDefaultDomain,
      description: 'Amplify Default Domain',
      exportName: `CometAmplifyDomain-${props.envName}`,
    });

    // Tags
    cdk.Tags.of(this).add('Environment', props.envName);
    cdk.Tags.of(this).add('Project', 'Comet');
  }
}
