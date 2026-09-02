import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Chrome拡張が接続設定を自動取得するための /comet-config.json を
 * ビルド成果物に含めるプラグイン
 */
function cometConfigPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'comet-config',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'comet-config.json',
        source: JSON.stringify(
          {
            websocketUrl: env.VITE_WEBSOCKET_URL ?? '',
            historyApiUrl: env.VITE_HISTORY_API_URL ?? '',
            stampApiUrl: env.VITE_STAMP_API_URL ?? '',
            // ローカルプレビュー用フォールバック。本番配信ではCDKが生成する
            // comet-config.jsonで上書きされる
            authEnabled: false,
          },
          null,
          2
        ),
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  return {
    plugins: [react(), cometConfigPlugin(env)],
    css: {
      preprocessorOptions: {
        scss: {
          additionalData: `@use "/src/styles/variables" as *;`,
        },
      },
    },
    test: {
      environment: 'jsdom',
    },
  };
});
