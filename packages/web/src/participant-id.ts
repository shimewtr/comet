const STORAGE_KEY = 'comet_participant_id';

let memoryParticipantId: string | null = null;

/**
 * 同じブラウザプロファイルのタブ間で共有する匿名ID。
 * Storageを利用できないプライベート環境では、ページを開いている間だけ維持する。
 */
export function getOrCreateParticipantId(): string {
  if (memoryParticipantId) return memoryParticipantId;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      memoryParticipantId = stored;
      return stored;
    }
  } catch {
    // localStorageを禁止しているブラウザでも投票以外の機能は利用できるようにする。
  }

  const created = crypto.randomUUID();
  memoryParticipantId = created;
  try {
    window.localStorage.setItem(STORAGE_KEY, created);
  } catch {
    // メモリ上のIDへフォールバックする。
  }
  return created;
}
