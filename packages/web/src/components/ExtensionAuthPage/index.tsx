import { useEffect, useState } from 'react';
import { getAuthTicket } from '../../auth';

type AuthState = 'working' | 'success' | 'error';

interface ChromeRuntime {
  lastError?: { message?: string };
  sendMessage: (
    extensionId: string,
    message: unknown,
    callback: (response?: { success?: boolean; error?: string }) => void
  ) => void;
}

declare global {
  interface Window {
    chrome?: { runtime?: ChromeRuntime };
  }
}

export function ExtensionAuthPage() {
  const [state, setState] = useState<AuthState>('working');
  const [message, setMessage] = useState(
    'Chrome拡張へログイン情報を連携しています…'
  );

  useEffect(() => {
    const extensionId =
      new URLSearchParams(window.location.search).get('extensionId') ?? '';
    if (!/^[a-p]{32}$/.test(extensionId)) {
      setState('error');
      setMessage(
        'Chrome拡張IDが正しくありません。拡張のポップアップからやり直してください。'
      );
      return;
    }

    void (async () => {
      try {
        const ticket = await getAuthTicket();
        if (!ticket) throw new Error('認証チケットを取得できませんでした');
        const runtime = window.chrome?.runtime;
        if (!runtime?.sendMessage) {
          throw new Error('Comet Chrome拡張が見つかりません');
        }
        await new Promise<void>((resolve, reject) => {
          runtime.sendMessage(
            extensionId,
            { type: 'COMET_AUTH_TOKEN', ...ticket },
            (response) => {
              const error = runtime.lastError?.message ?? response?.error;
              if (error || !response?.success) {
                reject(new Error(error ?? 'Chrome拡張への連携に失敗しました'));
                return;
              }
              resolve();
            }
          );
        });
        setState('success');
        setMessage(
          'ログインが完了しました。このタブを閉じてComet拡張を開いてください。'
        );
      } catch (error) {
        setState('error');
        setMessage(
          error instanceof Error
            ? error.message
            : 'ログイン情報の連携に失敗しました'
        );
      }
    })();
  }, []);

  return (
    <main className="extension-auth-page">
      <section className={`extension-auth-card ${state}`}>
        <h2>Chrome拡張の認証</h2>
        <p>{message}</p>
        {state !== 'working' && (
          <button type="button" onClick={() => window.close()}>
            このタブを閉じる
          </button>
        )}
      </section>
    </main>
  );
}
