import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveDeployProfile } from './resolve-deploy-config.mjs';

function withConfig(contents, run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'comet-config-'));
  const configFile = path.join(directory, 'comet.config.test.json');
  fs.writeFileSync(configFile, contents);
  try {
    run(configFile);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('selected environment profile is returned', () => {
  withConfig(
    JSON.stringify({ envs: { dev: { profile: 'development' } } }),
    (configFile) => {
      assert.equal(
        resolveDeployProfile(configFile, 'dev', true),
        'development'
      );
    }
  );
});

test('profile is trimmed', () => {
  withConfig(
    JSON.stringify({ envs: { dev: { profile: '  development  ' } } }),
    (configFile) => {
      assert.equal(
        resolveDeployProfile(configFile, 'dev', true),
        'development'
      );
    }
  );
});

test('missing optional config falls back to an empty profile', () => {
  assert.equal(resolveDeployProfile('/missing/comet.config.json', 'dev'), '');
});

test('missing required config fails', () => {
  assert.throws(
    () => resolveDeployProfile('/missing/comet.config.json', 'dev', true),
    /設定ファイルが見つかりません/
  );
});

test('invalid JSON fails instead of falling back to the shell profile', () => {
  withConfig('{ invalid', (configFile) => {
    assert.throws(
      () => resolveDeployProfile(configFile, 'dev', true),
      /設定ファイルを読み込めません/
    );
  });
});

test('named config requires a non-empty profile', () => {
  withConfig(JSON.stringify({ envs: { dev: {} } }), (configFile) => {
    assert.throws(
      () => resolveDeployProfile(configFile, 'dev', true),
      /envs\.dev\.profile が必要/
    );
  });
});
