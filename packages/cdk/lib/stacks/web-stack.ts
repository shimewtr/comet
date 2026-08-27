import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';
import * as path from 'path';
import * as fs from 'fs';
import { physicalName } from '../naming';
import { AuthConfig, DomainConfig } from '../config';

export interface WebStackProps extends cdk.StackProps {
  envName: string;
  /** comet-config.jsonとして配信するWebSocket URL */
  webSocketUrl: string;
  /** 履歴画面が参照するHTTP API URL */
  historyApiUrl: string;
  /** 認証（チケット検証）が有効かどうか。クライアントはこのフラグで自動追従する */
  authEnabled: boolean;
  /** カスタムドメイン設定（未指定ならCloudFrontの自動ドメイン） */
  domain?: DomainConfig;
  /** OIDC認証設定（指定するとviewer-requestにEdge認証を装着する） */
  auth?: AuthConfig;
  /** チケット署名鍵のシークレット名（authと併せて指定。Edgeが参照する） */
  signingSecretName?: string;
  /** 署名鍵のあるリージョン */
  signingSecretRegion?: string;
  /** 署名鍵へのIAMポリシー用ARNパターン */
  signingSecretArnPattern?: string;
}

/**
 * WebアプリのホスティングStack（CloudFront + S3）
 * webのビルド成果物のアップロードとキャッシュ無効化までこのStackのデプロイで行う
 */
export class WebStack extends cdk.Stack {
  public readonly distribution: cloudfront.Distribution;
  /** webの公開URL（カスタムドメイン設定時はそのURL） */
  public readonly webUrl: string;

  constructor(scope: Construct, id: string, props: WebStackProps) {
    super(scope, id, props);

    // webの静的資産を置くS3バケット（CloudFront経由でのみアクセス）
    const webBucket = new s3.Bucket(this, 'WebBucket', {
      bucketName: physicalName(this, props.envName, 'web'),
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      // ビルドし直せる静的資産なので環境を問わず破棄可能
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const originAccessIdentity = new cloudfront.OriginAccessIdentity(
      this,
      'WebOAI'
    );
    webBucket.grantRead(originAccessIdentity);

    // カスタムドメイン（任意）
    let certificate: acm.ICertificate | undefined;
    let hostedZone: route53.IHostedZone | undefined;

    if (props.domain) {
      if (props.domain.certificateArn) {
        certificate = acm.Certificate.fromCertificateArn(
          this,
          'WebCertificate',
          props.domain.certificateArn
        );
      } else if (props.domain.hostedZoneName) {
        hostedZone = route53.HostedZone.fromLookup(this, 'WebHostedZone', {
          domainName: props.domain.hostedZoneName,
        });
        // CloudFront用の証明書はus-east-1発行が必須
        certificate = new acm.DnsValidatedCertificate(this, 'WebCertificate', {
          domainName: props.domain.domainName,
          hostedZone,
          region: 'us-east-1',
        });
      } else {
        throw new Error(
          'domain設定にはhostedZoneNameかcertificateArnのどちらかが必要です'
        );
      }
    }

    const origin = origins.S3BucketOrigin.withOriginAccessIdentity(webBucket, {
      originAccessIdentity,
    });

    // Chrome拡張（chrome-extension:// origin）からも設定ファイルを取得できるよう、
    // CloudFront側でOriginの値に依存せずCORSヘッダーを付与する。
    const runtimeConfigCorsPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      'RuntimeConfigCorsPolicy',
      {
        responseHeadersPolicyName: physicalName(
          this,
          props.envName,
          'runtime-config-cors'
        ),
        corsBehavior: {
          accessControlAllowCredentials: false,
          accessControlAllowHeaders: ['*'],
          accessControlAllowMethods: ['GET', 'HEAD', 'OPTIONS'],
          accessControlAllowOrigins: ['*'],
          originOverride: true,
        },
      }
    );

    // 認証有効時: OIDC認証+チケット発行を行うLambda@Edgeをviewer-requestに装着する。
    // Lambda@Edgeは環境変数を使えないため、設定はアセットにconfig.jsonとして同梱する
    let edgeLambdas: cloudfront.EdgeLambda[] | undefined;
    if (props.auth) {
      if (
        !props.signingSecretName ||
        !props.signingSecretRegion ||
        !props.signingSecretArnPattern
      ) {
        throw new Error('auth有効時はsigningSecret系のプロパティが必要です');
      }

      const edgeAssetDir = path.join(
        __dirname,
        '../../edge-auth-build',
        props.envName
      );
      fs.mkdirSync(edgeAssetDir, { recursive: true });
      fs.copyFileSync(
        path.join(__dirname, '../../../edge-auth/dist/index.js'),
        path.join(edgeAssetDir, 'index.js')
      );
      fs.writeFileSync(
        path.join(edgeAssetDir, 'config.json'),
        JSON.stringify(
          {
            issuer: props.auth.issuer,
            clientId: props.auth.clientId,
            clientSecretId: props.auth.clientSecretId,
            clientSecretRegion:
              props.auth.clientSecretRegion ?? props.signingSecretRegion,
            clientSecretMethod:
              props.auth.clientSecretMethod ?? 'client_secret_basic',
            signingSecretName: props.signingSecretName,
            signingSecretRegion: props.signingSecretRegion,
          },
          null,
          2
        )
      );

      const edgeFn = new cloudfront.experimental.EdgeFunction(
        this,
        'EdgeAuthFn',
        {
          runtime: lambda.Runtime.NODEJS_20_X,
          handler: 'index.handler',
          code: lambda.Code.fromAsset(edgeAssetDir),
          memorySize: 128,
          timeout: cdk.Duration.seconds(5),
        }
      );

      // Edgeがチケット署名鍵を読めるようにする
      // （Secrets Managerはシークレット名の後ろにランダムなサフィックスを付けるためワイルドカード指定）
      edgeFn.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['secretsmanager:GetSecretValue'],
          resources: [
            props.signingSecretArnPattern,
            ...(props.auth.clientSecretId
              ? [
                  props.auth.clientSecretId.startsWith('arn:')
                    ? props.auth.clientSecretId
                    : `arn:${cdk.Aws.PARTITION}:secretsmanager:${
                        props.auth.clientSecretRegion ??
                        props.signingSecretRegion
                      }:${cdk.Aws.ACCOUNT_ID}:secret:${props.auth.clientSecretId}*`,
                ]
              : []),
          ],
        })
      );

      edgeLambdas = [
        {
          eventType: cloudfront.LambdaEdgeEventType.VIEWER_REQUEST,
          functionVersion: edgeFn.currentVersion,
        },
      ];
    }

    this.distribution = new cloudfront.Distribution(this, 'WebDistribution', {
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        edgeLambdas,
      },
      additionalBehaviors: {
        // Chrome拡張が接続設定を取得するファイル。
        // どこからでもfetchできるようCORSを許可し、更新が即時反映されるようキャッシュしない
        '/comet-config.json': {
          origin,
          viewerProtocolPolicy:
            cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
          cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
          responseHeadersPolicy: runtimeConfigCorsPolicy,
        },
      },
      defaultRootObject: 'index.html',
      // SPAルーティング: 存在しないパスはindex.htmlを返す
      errorResponses: [
        {
          httpStatus: 403,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
        {
          httpStatus: 404,
          responseHttpStatus: 200,
          responsePagePath: '/index.html',
        },
      ],
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      comment: `Comet Web (${props.envName})`,
      domainNames: props.domain ? [props.domain.domainName] : undefined,
      certificate,
    });

    // Route 53管理のドメインならAレコードまで作成
    if (props.domain && hostedZone) {
      new route53.ARecord(this, 'WebAliasRecord', {
        zone: hostedZone,
        recordName: props.domain.domainName,
        target: route53.RecordTarget.fromAlias(
          new targets.CloudFrontTarget(this.distribution)
        ),
      });
    }

    // webのビルド成果物をアップロードし、CloudFrontのキャッシュを無効化する。
    // comet-config.jsonはインフラ側の値から生成して上書きする（インフラが正）
    new s3deploy.BucketDeployment(this, 'WebDeployment', {
      destinationBucket: webBucket,
      sources: [
        s3deploy.Source.asset(path.join(__dirname, '../../../web/dist')),
        s3deploy.Source.jsonData('comet-config.json', {
          websocketUrl: props.webSocketUrl,
          historyApiUrl: props.historyApiUrl,
          authEnabled: props.authEnabled,
        }),
      ],
      distribution: this.distribution,
      distributionPaths: ['/*'],
    });

    this.webUrl = props.domain
      ? `https://${props.domain.domainName}`
      : `https://${this.distribution.distributionDomainName}`;

    // Outputs
    new cdk.CfnOutput(this, 'WebUrl', {
      value: this.webUrl,
      description: 'Web App URL',
      exportName: `CometWebUrl-${props.envName}`,
    });

    new cdk.CfnOutput(this, 'WebDistributionId', {
      value: this.distribution.distributionId,
      description: 'Web CloudFront Distribution ID',
      exportName: `CometWebDistributionId-${props.envName}`,
    });

    // Tags
    cdk.Tags.of(this).add('Environment', props.envName);
    cdk.Tags.of(this).add('Project', 'Comet');
  }
}
