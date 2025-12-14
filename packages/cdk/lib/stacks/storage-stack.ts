import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';

export interface StorageStackProps extends cdk.StackProps {
  envName: string;
  config: {
    lambdaMemorySize: number;
    logRetentionDays: number;
  };
}

export class StorageStack extends cdk.Stack {
  public readonly connectionsTable: dynamodb.Table;

  constructor(scope: Construct, id: string, props: StorageStackProps) {
    super(scope, id, props);

    // WebSocket接続情報を管理するDynamoDBテーブル
    this.connectionsTable = new dynamodb.Table(this, 'ConnectionsTable', {
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
