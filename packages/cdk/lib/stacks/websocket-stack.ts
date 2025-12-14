import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';

export interface WebSocketStackProps extends cdk.StackProps {
  envName: string;
  config: {
    lambdaMemorySize: number;
    logRetentionDays: number;
  };
  connectionsTable: dynamodb.Table;
}

export class WebSocketStack extends cdk.Stack {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;

  constructor(scope: Construct, id: string, props: WebSocketStackProps) {
    super(scope, id, props);

    // Lambda実行ロール
    const lambdaRole = new iam.Role(this, 'WebSocketLambdaRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    // DynamoDBアクセス権限を追加
    props.connectionsTable.grantReadWriteData(lambdaRole);

    // API Gateway管理権限を追加
    lambdaRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ['execute-api:ManageConnections', 'execute-api:Invoke'],
        resources: ['*'],
      })
    );

    // 環境変数
    const environment = {
      CONNECTIONS_TABLE_NAME: props.connectionsTable.tableName,
      NODE_ENV: props.envName === 'prod' ? 'production' : 'development',
      ENV_NAME: props.envName,
    };

    // Lambda関数の共通設定
    const lambdaConfig = {
      runtime: lambda.Runtime.NODEJS_18_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../api/websocket-handler/dist'),
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: props.config.lambdaMemorySize,
      logRetention: props.config.logRetentionDays as logs.RetentionDays,
    };

    // Connect Lambda
    const connectHandler = new lambda.Function(this, 'ConnectHandler', {
      ...lambdaConfig,
      environment: {
        ...environment,
        HANDLER_TYPE: 'connect',
      },
    });

    // Disconnect Lambda
    const disconnectHandler = new lambda.Function(this, 'DisconnectHandler', {
      ...lambdaConfig,
      environment: {
        ...environment,
        HANDLER_TYPE: 'disconnect',
      },
    });

    // Message Lambda
    const messageHandler = new lambda.Function(this, 'MessageHandler', {
      ...lambdaConfig,
      environment: {
        ...environment,
        HANDLER_TYPE: 'message',
      },
    });

    // WebSocket API
    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: `CometWebSocketApi-${props.envName}`,
      description: `WebSocket API for Comet real-time comments (${props.envName})`,
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          'ConnectIntegration',
          connectHandler
        ),
      },
      disconnectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          'DisconnectIntegration',
          disconnectHandler
        ),
      },
      defaultRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          'MessageIntegration',
          messageHandler
        ),
      },
    });

    // WebSocket ステージ
    const stage = new apigatewayv2.WebSocketStage(this, 'ProductionStage', {
      webSocketApi: this.webSocketApi,
      stageName: 'prod',
      autoDeploy: true,
    });

    // Lambda関数にAPI Gateway呼び出し権限を付与
    const apiArn = `arn:aws:execute-api:${this.region}:${this.account}:${this.webSocketApi.apiId}/*`;

    [connectHandler, disconnectHandler, messageHandler].forEach((handler) => {
      handler.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['execute-api:ManageConnections'],
          resources: [apiArn],
        })
      );
    });

    // 出力（環境名を含める）
    new cdk.CfnOutput(this, 'WebSocketURL', {
      value: stage.url,
      description: 'WebSocket API URL',
      exportName: `Comet${props.envName}WebSocketURL`,
    });

    new cdk.CfnOutput(this, 'WebSocketApiId', {
      value: this.webSocketApi.apiId,
      description: 'WebSocket API ID',
      exportName: `Comet${props.envName}WebSocketApiId`,
    });
  }
}
