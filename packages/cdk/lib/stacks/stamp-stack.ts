import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayIntegrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import * as path from 'path';

export interface StampStackProps extends cdk.StackProps {
  envName: string;
  config: {
    lambdaMemorySize: number;
    logRetentionDays: number;
  };
}

export class StampStack extends cdk.Stack {
  public readonly stampBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;
  public readonly stampsTable: dynamodb.Table;
  public readonly uploadApi: apigateway.HttpApi;

  constructor(scope: Construct, id: string, props: StampStackProps) {
    super(scope, id, props);

    // S3バケット for スタンプ画像
    this.stampBucket = new s3.Bucket(this, 'StampBucket', {
      bucketName: `comet-stamps-${props.envName}-${this.account}`,
      // CORS設定
      cors: [
        {
          allowedMethods: [
            s3.HttpMethods.GET,
            s3.HttpMethods.HEAD,
            s3.HttpMethods.PUT,
          ],
          allowedOrigins: ['*'], // 本番環境では特定のドメインに制限
          allowedHeaders: ['*'],
          maxAge: 3600,
        },
      ],
      // パブリック読み取りアクセス（スタンプ画像は公開）
      publicReadAccess: false, // CloudFront経由でアクセス
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // 削除時の動作
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    // CloudFront OAI (Origin Access Identity)
    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'StampOAI'
    );

    // S3バケットポリシー: CloudFrontからのアクセスを許可
    this.stampBucket.grantRead(originAccessIdentity);

    // CloudFront Distribution for スタンプ配信
    this.distribution = new cloudfront.Distribution(this, 'StampDistribution', {
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessIdentity(
          this.stampBucket,
          { originAccessIdentity }
        ),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: cloudfront.CachedMethods.CACHE_GET_HEAD,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200, // アジア・北米・欧州
      comment: `Comet Stamp CDN (${props.envName})`,
    });

    // DynamoDBテーブル for カスタムスタンプメタデータ
    this.stampsTable = new dynamodb.Table(this, 'StampsTable', {
      tableName: `comet-stamps-${props.envName}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // Lambda関数: スタンプアップロード用プリサインドURL生成
    const uploadLambda = new lambda.Function(this, 'UploadLambda', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset(
        path.join(__dirname, '../../../api/stamp-upload/dist')
      ),
      environment: {
        STAMP_BUCKET_NAME: this.stampBucket.bucketName,
        STAMPS_TABLE_NAME: this.stampsTable.tableName,
        STAMP_CDN_DOMAIN: this.distribution.distributionDomainName,
      },
      memorySize: props.config.lambdaMemorySize,
      timeout: cdk.Duration.seconds(30),
      logRetention: props.config.logRetentionDays,
    });

    // Lambda関数に権限付与
    this.stampBucket.grantPut(uploadLambda);
    this.stampBucket.grantDelete(uploadLambda);
    this.stampsTable.grantWriteData(uploadLambda);
    this.stampsTable.grantReadData(uploadLambda);

    // HTTP API Gateway
    this.uploadApi = new apigateway.HttpApi(this, 'StampUploadApi', {
      apiName: `comet-stamp-upload-${props.envName}`,
      description: 'API for stamp upload',
      corsPreflight: {
        allowOrigins: ['*'],
        allowMethods: [
          apigateway.CorsHttpMethod.GET,
          apigateway.CorsHttpMethod.POST,
          apigateway.CorsHttpMethod.DELETE,
          apigateway.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type'],
      },
    });

    // Lambda統合
    const uploadIntegration = new apigatewayIntegrations.HttpLambdaIntegration(
      'UploadIntegration',
      uploadLambda
    );

    this.uploadApi.addRoutes({
      path: '/upload',
      methods: [apigateway.HttpMethod.POST],
      integration: uploadIntegration,
    });

    this.uploadApi.addRoutes({
      path: '/stamps',
      methods: [apigateway.HttpMethod.GET],
      integration: uploadIntegration,
    });

    this.uploadApi.addRoutes({
      path: '/stamps/{id}',
      methods: [apigateway.HttpMethod.DELETE],
      integration: uploadIntegration,
    });

    // Outputs
    new cdk.CfnOutput(this, 'StampBucketName', {
      value: this.stampBucket.bucketName,
      description: 'Stamp S3 Bucket Name',
      exportName: `CometStampBucket-${props.envName}`,
    });

    new cdk.CfnOutput(this, 'StampCdnDomain', {
      value: this.distribution.distributionDomainName,
      description: 'Stamp CDN Domain',
      exportName: `CometStampCDN-${props.envName}`,
    });

    new cdk.CfnOutput(this, 'StampCdnUrl', {
      value: `https://${this.distribution.distributionDomainName}`,
      description: 'Stamp CDN Base URL',
      exportName: `CometStampCDNUrl-${props.envName}`,
    });

    new cdk.CfnOutput(this, 'StampUploadApiUrl', {
      value: this.uploadApi.url || '',
      description: 'Stamp Upload API URL',
      exportName: `CometStampUploadApiUrl-${props.envName}`,
    });

    new cdk.CfnOutput(this, 'StampsTableName', {
      value: this.stampsTable.tableName,
      description: 'Stamps DynamoDB Table Name',
      exportName: `CometStampsTable-${props.envName}`,
    });

    // Tags
    cdk.Tags.of(this).add('Environment', props.envName);
    cdk.Tags.of(this).add('Project', 'Comet');
  }
}
