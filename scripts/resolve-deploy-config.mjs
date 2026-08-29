import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function resolveDeployProfile(configFile, envName, required = false) {
  if (!fs.existsSync(configFile)) {
    if (required) {
      throw new Error(`設定ファイルが見つかりません: ${configFile}`);
    }
    return '';
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`設定ファイルを読み込めません: ${configFile}\n${detail}`);
  }

  const profile = config.envs?.[envName]?.profile;
  if (typeof profile === 'string' && profile.trim()) {
    return profile.trim();
  }
  if (required) {
    throw new Error(
      `名前付き設定には envs.${envName}.profile が必要です: ${configFile}`
    );
  }
  return '';
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [, , configFile, envName, requiredArg] = process.argv;
  try {
    process.stdout.write(
      resolveDeployProfile(configFile, envName, requiredArg === 'required')
    );
  } catch (error) {
    console.error(error instanceof Error ? `error: ${error.message}` : error);
    process.exit(1);
  }
}
