import { Stack } from 'aws-cdk-lib';

/**
 * CDK bootstrap の cdk-{qualifier}-{type}-{account}-{region} に倣い、
 * comet-{env}-{リソースタイプ}-{accountId}-{region} 形式の物理名を生成する。
 * accountId と region を含めることでアカウント・リージョン間の重複を避ける。
 */
export function physicalName(
  stack: Stack,
  envName: string,
  resourceType: string
): string {
  return `comet-${envName}-${resourceType}-${stack.account}-${stack.region}`;
}
