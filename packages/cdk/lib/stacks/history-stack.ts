import * as cdk from 'aws-cdk-lib';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { physicalName } from '../naming';

export interface HistoryStackProps extends cdk.StackProps {
  envName: string;
  config: { lambdaMemorySize: number; logRetentionDays: number };
  roomsTable: dynamodb.Table;
  roomEventsTable: dynamodb.Table;
  roomCapturesTable: dynamodb.Table;
}

export class HistoryStack extends cdk.Stack {
  public readonly historyApiUrl: string;

  constructor(scope: Construct, id: string, props: HistoryStackProps) {
    super(scope, id, props);

    const functionName = physicalName(this, props.envName, 'history-api');
    const captureBucket = new s3.Bucket(this, 'CaptureBucket', {
      bucketName: physicalName(this, props.envName, 'room-captures'),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      lifecycleRules: [{ expiration: cdk.Duration.days(90) }],
      removalPolicy:
        props.envName === 'prod'
          ? cdk.RemovalPolicy.RETAIN
          : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: props.envName !== 'prod',
    });
    const handler = new lambda.Function(this, 'HistoryHandler', {
      functionName,
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../api/history-handler/dist'),
      timeout: cdk.Duration.seconds(30),
      memorySize: props.config.lambdaMemorySize,
      environment: {
        ROOMS_TABLE_NAME: props.roomsTable.tableName,
        ROOM_EVENTS_TABLE_NAME: props.roomEventsTable.tableName,
        ROOM_CAPTURES_TABLE_NAME: props.roomCapturesTable.tableName,
        CAPTURE_BUCKET_NAME: captureBucket.bucketName,
      },
      logGroup: new logs.LogGroup(this, 'HistoryHandlerLogGroup', {
        logGroupName: `/aws/lambda/${functionName}`,
        retention: props.config.logRetentionDays as logs.RetentionDays,
        removalPolicy: cdk.RemovalPolicy.DESTROY,
      }),
    });
    props.roomsTable.grantReadData(handler);
    props.roomEventsTable.grantReadData(handler);
    props.roomCapturesTable.grantReadWriteData(handler);
    props.roomsTable.grantWriteData(handler);
    captureBucket.grantReadWrite(handler);

    const api = new apigatewayv2.HttpApi(this, 'HistoryApi', {
      apiName: physicalName(this, props.envName, 'history-api'),
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [apigatewayv2.CorsHttpMethod.GET, apigatewayv2.CorsHttpMethod.POST],
        allowHeaders: ['content-type'],
      },
    });
    const integration = new HttpLambdaIntegration('HistoryIntegration', handler);
    for (const route of [
      '/history/rooms',
      '/history/rooms/{roomId}',
      '/history/rooms/{roomId}/events',
    ]) {
      api.addRoutes({
        path: route,
        methods: [apigatewayv2.HttpMethod.GET],
        integration,
      });
    }
    for (const route of [
      '/history/rooms/{roomId}/recorder',
      '/history/rooms/{roomId}/captures',
    ]) {
      api.addRoutes({
        path: route,
        methods: [apigatewayv2.HttpMethod.POST],
        integration,
      });
    }

    this.historyApiUrl = `${api.apiEndpoint}/history`;
    new cdk.CfnOutput(this, 'HistoryApiUrl', { value: this.historyApiUrl });
  }
}
