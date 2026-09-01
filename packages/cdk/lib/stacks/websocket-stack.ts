import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { WebSocketLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { WebSocketLambdaAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { nodejsLambdaCode } from '../lambda-bundling';
import { physicalName } from '../naming';

export interface WebSocketStackProps extends cdk.StackProps {
  envName: string;
  config: {
    lambdaMemorySize: number;
    logRetentionDays: number;
  };
  connectionsTable: dynamodb.Table;
  commentsTable: dynamodb.Table;
  roomsTable: dynamodb.Table;
  roomEventsTable: dynamodb.Table;
  pollsTable: dynamodb.Table;
  pollVotesTable: dynamodb.Table;
  /** 認証チケットの署名鍵。指定すると$connectにオーソライザーを装着する */
  authSigningSecret?: secretsmanager.ISecret;
}

export class WebSocketStack extends cdk.Stack {
  public readonly webSocketApi: apigatewayv2.WebSocketApi;
  /** クライアントが接続するWebSocket URL（wss://.../prod） */
  public readonly webSocketUrl: string;

  constructor(scope: Construct, id: string, props: WebSocketStackProps) {
    super(scope, id, props);

    const handlerCode = nodejsLambdaCode('websocket-handler');

    // Lambda実行ロール
    const lambdaRole = new iam.Role(this, 'WebSocketLambdaRole', {
      roleName: physicalName(this, props.envName, 'websocket-lambda-role'),
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AWSLambdaBasicExecutionRole'
        ),
      ],
    });

    // DynamoDBアクセス権限を追加
    props.connectionsTable.grantReadWriteData(lambdaRole);
    props.commentsTable.grantReadWriteData(lambdaRole);
    props.roomsTable.grantReadWriteData(lambdaRole);
    props.roomEventsTable.grantReadWriteData(lambdaRole);
    props.pollsTable.grantReadWriteData(lambdaRole);
    props.pollVotesTable.grantReadWriteData(lambdaRole);

    // 環境変数
    const environment = {
      CONNECTIONS_TABLE_NAME: props.connectionsTable.tableName,
      COMMENTS_TABLE_NAME: props.commentsTable.tableName,
      ROOMS_TABLE_NAME: props.roomsTable.tableName,
      ROOM_EVENTS_TABLE_NAME: props.roomEventsTable.tableName,
      POLLS_TABLE_NAME: props.pollsTable.tableName,
      POLL_VOTES_TABLE_NAME: props.pollVotesTable.tableName,
      NODE_ENV: props.envName === 'prod' ? 'production' : 'development',
      ENV_NAME: props.envName,
    };

    // Lambda関数はCDKがソースからbundleする。事前にdistを生成しておく方式では、
    // `cdk deploy` を直接実行したときに未bundleのworkspace依存を配備し得るため。
    const lambdaConfig = {
      runtime: lambda.Runtime.NODEJS_22_X,
      role: lambdaRole,
      timeout: cdk.Duration.seconds(30),
      memorySize: props.config.lambdaMemorySize,
      code: handlerCode,
      handler: 'index.handler',
    };

    // ロググループは明示的に作成する
    // （logRetentionは非推奨で、リテンション設定用のカスタムリソースLambdaが余分に作られるため）
    const createLogGroup = (id: string, functionName: string) =>
      new logs.LogGroup(this, id, {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: props.config.logRetentionDays as logs.RetentionDays,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      });

    // Connect Lambda
    const connectName = physicalName(this, props.envName, 'websocket-connect');
    const connectHandler = new lambda.Function(this, 'ConnectHandler', {
      ...lambdaConfig,
      functionName: connectName,
      logGroup: createLogGroup('ConnectHandlerLogGroup', connectName),
      environment: {
        ...environment,
        HANDLER_TYPE: 'connect',
      },
    });

    // Disconnect Lambda
    const disconnectName = physicalName(
      this,
      props.envName,
      'websocket-disconnect'
    );
    const disconnectHandler = new lambda.Function(this, 'DisconnectHandler', {
      ...lambdaConfig,
      functionName: disconnectName,
      logGroup: createLogGroup('DisconnectHandlerLogGroup', disconnectName),
      environment: {
        ...environment,
        HANDLER_TYPE: 'disconnect',
      },
    });

    // Message Lambda
    const messageName = physicalName(this, props.envName, 'websocket-message');
    const messageHandler = new lambda.Function(this, 'MessageHandler', {
      ...lambdaConfig,
      functionName: messageName,
      logGroup: createLogGroup('MessageHandlerLogGroup', messageName),
      environment: {
        ...environment,
        HANDLER_TYPE: 'message',
      },
    });

    // 認証有効時は$connectでチケット（?token=）を検証するオーソライザーを作る
    let connectAuthorizer: WebSocketLambdaAuthorizer | undefined;
    if (props.authSigningSecret) {
      const authorizerName = physicalName(
        this,
        props.envName,
        'websocket-authorizer'
      );
      const authorizerFn = new lambda.Function(this, 'ConnectAuthorizer', {
        runtime: lambda.Runtime.NODEJS_22_X,
        code: handlerCode,
        handler: 'index.wsAuthorizer',
        functionName: authorizerName,
        logGroup: createLogGroup('ConnectAuthorizerLogGroup', authorizerName),
        timeout: cdk.Duration.seconds(10),
        memorySize: props.config.lambdaMemorySize,
        environment: {
          AUTH_SIGNING_SECRET_ARN: props.authSigningSecret.secretArn,
        },
      });
      props.authSigningSecret.grantRead(authorizerFn);

      connectAuthorizer = new WebSocketLambdaAuthorizer(
        'ConnectAuth',
        authorizerFn,
        {
          identitySource: ['route.request.querystring.token'],
        }
      );
    }

    // WebSocket API
    this.webSocketApi = new apigatewayv2.WebSocketApi(this, 'WebSocketApi', {
      apiName: physicalName(this, props.envName, 'websocket-api'),
      description: `WebSocket API for Comet real-time comments (${props.envName})`,
      connectRouteOptions: {
        integration: new WebSocketLambdaIntegration(
          'ConnectIntegration',
          connectHandler
        ),
        authorizer: connectAuthorizer,
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

    this.webSocketUrl = stage.url;

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
