#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WebSocketStack } from '../lib/stacks/websocket-stack';
import { StorageStack } from '../lib/stacks/storage-stack';
import { AmplifyStack } from '../lib/stacks/amplify-stack';
import { StampStack } from '../lib/stacks/stamp-stack';

const app = new cdk.App();

// 環境名を取得（dev または prod）
const envName = app.node.tryGetContext('env') || process.env.ENV_NAME || 'dev';

// AWS環境設定
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

// 環境ごとの設定
const envConfig = {
  dev: {
    lambdaMemorySize: 256,
    logRetentionDays: 3, // 開発環境は短め
  },
  prod: {
    lambdaMemorySize: 512,
    logRetentionDays: 7,
  },
};

const config = envConfig[envName as keyof typeof envConfig] || envConfig.dev;

// スタック名に環境名を含める
const stackPrefix = `Comet${envName.charAt(0).toUpperCase() + envName.slice(1)}`;

// ストレージスタック（DynamoDB）
const storageStack = new StorageStack(app, `${stackPrefix}StorageStack`, {
  env,
  description: `Comet Storage Stack (DynamoDB) - ${envName}`,
  envName,
  config,
});

// WebSocketスタック
new WebSocketStack(app, `${stackPrefix}WebSocketStack`, {
  env,
  description: `Comet WebSocket API Stack - ${envName}`,
  envName,
  config,
  connectionsTable: storageStack.connectionsTable,
});

// Amplify Hostingスタック（Web UI）
new AmplifyStack(app, `${stackPrefix}AmplifyStack`, {
  env,
  description: `Comet Web UI Hosting - ${envName}`,
  envName,
});

// スタンプスタック（S3 + CloudFront + Lambda + DynamoDB）
new StampStack(app, `${stackPrefix}StampStack`, {
  env,
  description: `Comet Stamp Storage & CDN - ${envName}`,
  envName,
  config,
});

// タグを追加
cdk.Tags.of(app).add('Project', 'Comet');
cdk.Tags.of(app).add('Environment', envName);

app.synth();
