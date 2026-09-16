import { useCallback, useEffect, useState } from 'react';
import type { Stamp } from '@comet/shared';
import { authHeaders, loadRuntimeConfig } from '../auth';

async function stampApiUrl(path: string): Promise<string> {
  const runtimeConfig = await loadRuntimeConfig();
  const baseUrl =
    runtimeConfig.stampApiUrl || import.meta.env.VITE_STAMP_API_URL;
  if (!baseUrl) {
    throw new Error('スタンプAPI URLが設定されていません');
  }
  return `${baseUrl.replace(/\/$/, '')}${path}`;
}

async function errorMessage(response: Response, fallback: string) {
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) return fallback;
  const data = (await response.json().catch(() => ({}))) as { error?: string };
  return data.error || fallback;
}

/**
 * カスタムスタンプの一覧取得・削除・アップロード。
 * HTTP API で完結するため、WebSocket の接続状態には依存させない。
 * 一覧はスタンプパレット（表示）とヘッダーの管理メニュー（編集）の両方で使うので App 側で持つ
 */
export function useCustomStamps() {
  const [customStamps, setCustomStamps] = useState<Stamp[]>([]);
  const [uploading, setUploading] = useState(false);

  const fetchCustomStamps = useCallback(async (signal?: AbortSignal) => {
    try {
      const response = await fetch(await stampApiUrl('/stamps'), {
        signal,
        headers: await authHeaders(),
      });
      if (response.ok) {
        const data = await response.json();
        setCustomStamps(data.stamps || []);
      } else {
        console.error('Failed to fetch custom stamps:', response.status);
      }
    } catch (error) {
      // アンマウントによる中断はエラー扱いしない
      if (error instanceof DOMException && error.name === 'AbortError') {
        return;
      }
      console.error('Failed to fetch custom stamps:', error);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchCustomStamps(controller.signal);
    return () => controller.abort();
  }, [fetchCustomStamps]);

  /** サーバから削除して一覧を更新する。失敗時は理由を持つ Error を投げる */
  const deleteStamp = useCallback(async (stampId: string) => {
    const response = await fetch(
      await stampApiUrl(`/stamps/${encodeURIComponent(stampId)}`),
      { method: 'DELETE', headers: await authHeaders() }
    );
    if (!response.ok) {
      throw new Error(await errorMessage(response, '不明なエラー'));
    }
    setCustomStamps((prev) => prev.filter((stamp) => stamp.id !== stampId));
  }, []);

  /** アップロード用 URL の取得 → 画像の PUT → 有効化、の順で登録する。失敗時は理由を持つ Error を投げる */
  const uploadStamp = useCallback(
    async (file: File, name: string) => {
      setUploading(true);
      try {
        const response = await fetch(await stampApiUrl('/upload'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(await authHeaders()),
          },
          body: JSON.stringify({
            fileName: file.name,
            fileType: file.type,
            fileSize: file.size,
            stampName: name,
          }),
        });
        if (!response.ok) {
          throw new Error(
            await errorMessage(response, 'アップロードURLの取得に失敗しました')
          );
        }

        const { uploadUrl, stampId } = await response.json();

        const uploadResponse = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': file.type },
          body: file,
        });
        if (!uploadResponse.ok) {
          throw new Error('画像のアップロードに失敗しました');
        }

        // アップロード完了をサーバに通知してスタンプを有効化する
        const confirmResponse = await fetch(
          await stampApiUrl(`/stamps/${encodeURIComponent(stampId)}/confirm`),
          { method: 'POST', headers: await authHeaders() }
        );
        if (!confirmResponse.ok) {
          throw new Error('スタンプの有効化に失敗しました');
        }

        await fetchCustomStamps();
      } finally {
        setUploading(false);
      }
    },
    [fetchCustomStamps]
  );

  return { customStamps, uploading, deleteStamp, uploadStamp };
}
