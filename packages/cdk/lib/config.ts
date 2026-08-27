import * as fs from 'fs';
import * as path from 'path';

/**
 * カスタムドメイン設定（任意）
 */
export interface DomainConfig {
  /** webに割り当てるドメイン名（例: comet.example.com） */
  domainName: string;
  /**
   * Route 53のホストゾーン名（例: example.com）
   * 指定すると証明書のDNS検証とAレコード作成まで自動で行う
   */
  hostedZoneName?: string;
  /**
   * Route 53以外でDNSを管理する場合、us-east-1で発行済みの証明書ARNを指定する
   * （hostedZoneNameとどちらか一方を指定）
   */
  certificateArn?: string;
}

/**
 * OIDC認証設定（任意）。未設定なら認証なしの公開構成になる
 */
export interface AuthConfig {
  /** OIDCのissuer URL */
  issuer: string;
  /** OIDCクライアントID（秘密情報ではない） */
  clientId: string;
  /**
   * confidential clientで使うSecrets ManagerのシークレットID（任意）。
   * 未指定なら従来どおりPKCE public clientとしてコード交換する。
   */
  clientSecretId?: string;
  /** client secretを保存したリージョン（未指定ならデプロイ先リージョン） */
  clientSecretRegion?: string;
  /** token endpointで使うclient認証方式（デフォルト: client_secret_basic） */
  clientSecretMethod?: 'client_secret_basic' | 'client_secret_post';
}

/**
 * 環境ごとの設定
 */
export interface CometEnvConfig {
  lambdaMemorySize: number;
  logRetentionDays: number;
  domain?: DomainConfig;
  auth?: AuthConfig;
  /** scripts/deploy.sh が使うAWSプロファイル（CDKスタック自体は参照しない） */
  profile?: string;
}

const DEFAULT_ENV_CONFIGS: Record<string, CometEnvConfig> = {
  dev: {
    lambdaMemorySize: 256,
    logRetentionDays: 3, // 開発環境は短め
  },
  prod: {
    lambdaMemorySize: 512,
    logRetentionDays: 7,
  },
};

/**
 * 環境設定を読み込む。
 * packages/cdk/comet.config.json（gitignore対象）があれば、
 * デフォルト値の上に環境ごとの設定を重ねる。
 * ドメイン・認証などデプロイ先固有の値はすべてこのファイルに置き、
 * リポジトリには含めない。
 */
export function loadEnvConfig(envName: string): CometEnvConfig {
  const base = DEFAULT_ENV_CONFIGS[envName] ?? DEFAULT_ENV_CONFIGS.dev;

  const configPath = path.join(__dirname, '..', 'comet.config.json');
  if (!fs.existsSync(configPath)) {
    return { ...base };
  }

  const file = JSON.parse(fs.readFileSync(configPath, 'utf-8')) as {
    envs?: Record<string, Partial<CometEnvConfig>>;
  };
  const overrides = file.envs?.[envName] ?? {};

  return { ...base, ...overrides };
}
