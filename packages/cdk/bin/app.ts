#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { WebSocketStack } from '../lib/stacks/websocket-stack';
import { StorageStack } from '../lib/stacks/storage-stack';
import { WebStack } from '../lib/stacks/web-stack';
import { StampStack } from '../lib/stacks/stamp-stack';
import { HistoryStack } from '../lib/stacks/history-stack';
import { loadEnvConfig } from '../lib/config';
import { physicalNameParts } from '../lib/naming';

const app = new cdk.App();

// 環境名を取得（dev または prod）
const envName = app.node.tryGetContext('env') || process.env.ENV_NAME || 'dev';

// AWS環境設定
const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION || 'ap-northeast-1',
};

// 環境ごとの設定（comet.config.jsonがあれば上書き。ドメイン・認証は任意）
const config = loadEnvConfig(envName);
const authEnabled = Boolean(config.auth);

// スタック名に環境名を含める
const stackPrefix = `Comet${envName.charAt(0).toUpperCase() + envName.slice(1)}`;

// ストレージスタック（DynamoDB・認証署名鍵）
const storageStack = new StorageStack(app, `${stackPrefix}StorageStack`, {
  env,
  description: `Comet Storage Stack (DynamoDB) - ${envName}`,
  envName,
  config,
  authEnabled,
});

// WebSocketスタック
const webSocketStack = new WebSocketStack(app, `${stackPrefix}WebSocketStack`, {
  env,
  description: `Comet WebSocket API Stack - ${envName}`,
  envName,
  config,
  connectionsTable: storageStack.connectionsTable,
  commentsTable: storageStack.commentsTable,
  roomsTable: storageStack.roomsTable,
  roomEventsTable: storageStack.roomEventsTable,
  pollsTable: storageStack.pollsTable,
  pollVotesTable: storageStack.pollVotesTable,
  authSigningSecret: storageStack.authSigningSecret,
});

const historyStack = new HistoryStack(app, `${stackPrefix}HistoryStack`, {
  env,
  description: `Comet History API Stack - ${envName}`,
  envName,
  config,
  roomsTable: storageStack.roomsTable,
  roomEventsTable: storageStack.roomEventsTable,
  roomCapturesTable: storageStack.roomCapturesTable,
});

// スタンプスタック（S3 + CloudFront + Lambda + DynamoDB）
const stampStack = new StampStack(app, `${stackPrefix}StampStack`, {
  env,
  description: `Comet Stamp Storage & CDN - ${envName}`,
  envName,
  config,
  authSigningSecret: storageStack.authSigningSecret,
});

// 認証有効時、Edge用のconfig生成に具体値のアカウントIDが必要
if (authEnabled && !env.account) {
  throw new Error(
    '認証を有効化するにはAWS認証情報（CDK_DEFAULT_ACCOUNT）が必要です'
  );
}
const signingSecretName = authEnabled
  ? physicalNameParts(env.account!, env.region, envName, 'auth-signing-key')
  : undefined;

// Webホスティングスタック（CloudFront + S3 + 任意のEdge認証）
new WebStack(app, `${stackPrefix}WebStack`, {
  env,
  description: `Comet Web Hosting - ${envName}`,
  envName,
  webSocketUrl: webSocketStack.webSocketUrl,
  historyApiUrl: historyStack.historyApiUrl,
  stampApiUrl: stampStack.stampApiBaseUrl,
  authEnabled,
  domain: config.domain,
  auth: config.auth,
  signingSecretName,
  signingSecretRegion: env.region,
  signingSecretArnPattern: authEnabled
    ? `arn:aws:secretsmanager:${env.region}:${env.account}:secret:${signingSecretName}-*`
    : undefined,
});

// タグを追加
cdk.Tags.of(app).add('Project', 'Comet');
cdk.Tags.of(app).add('Environment', envName);

app.synth();
