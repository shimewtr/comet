import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';
import { physicalName } from '../naming';

export interface StorageStackProps extends cdk.StackProps {
  envName: string;
  config: {
    lambdaMemorySize: number;
    logRetentionDays: number;
  };
  /** 認証（チケット検証）を有効にするか */
  authEnabled: boolean;
}

export class StorageStack extends cdk.Stack {
  public readonly connectionsTable: dynamodb.Table;
  public readonly commentsTable: dynamodb.Table;
  /** 認証チケット(JWT)の署名鍵。認証有効時のみ作成される */
  public readonly authSigningSecret?: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // WebSocket接続情報を管理するDynamoDBテーブル
    this.connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
      tableName: physicalName(this, props.envName, 'connections'),
      partitionKey: {
        name: 'connectionId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        name: 'roomId',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // オンデマンド課金
      removalPolicy:
        props.envName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      pointInTimeRecovery: props.envName === 'prod', // 本番環境のみバックアップ
      timeToLiveAttribute: 'ttl', // TTLで自動削除
    });

    // roomIdでの検索用GSI
    this.connectionsTable.addGlobalSecondaryIndex({
      indexName: 'RoomIdIndex',
      partitionKey: {
        name: 'roomId',
        type: dynamodb.AttributeType.STRING,
      },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // コメント履歴を保持するDynamoDBテーブル
    // 途中参加者への直近履歴の提供用。TTL（1時間）で自動削除される一時データなので
    // 環境を問わずDESTROYでよい
    this.commentsTable = new dynamodb.Table(this, 'CommentsTable', {
      tableName: physicalName(this, props.envName, 'comments'),
      partitionKey: {
        name: 'roomId',
        type: dynamodb.AttributeType.STRING,
      },
      sortKey: {
        // `${timestamp(ms)}#${commentId}` 形式。時系列順に並び、同時刻でも衝突しない
        name: 'sk',
        type: dynamodb.AttributeType.STRING,
      },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // 認証チケットの署名鍵（認証有効時のみ）。
    // デプロイ時に自動生成し、利用者が秘密情報を扱わずに済むようにする
    if (props.authEnabled) {
      this.authSigningSecret = new secretsmanager.Secret(
        this,
        'AuthSigningSecret',
        {
          secretName: physicalName(this, props.envName, 'auth-signing-key'),
          description: 'Comet auth ticket (JWT) HS256 signing key',
          generateSecretString: {
            passwordLength: 64,
            excludePunctuation: true,
          },
        }
      );
    }

    // 出力（環境名を含める）
    new cdk.CfnOutput(this, 'ConnectionsTableName', {
      value: this.connectionsTable.tableName,
      description: 'DynamoDB Connections Table Name',
      exportName: `Comet${props.envName}ConnectionsTable`,
    });

    new cdk.CfnOutput(this, 'ConnectionsTableArn', {
      value: this.connectionsTable.tableArn,
      description: 'DynamoDB Connections Table ARN',
      exportName: `Comet${props.envName}ConnectionsTableArn`,
    });
  }
}
