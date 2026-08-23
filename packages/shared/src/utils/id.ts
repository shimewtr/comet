/**
 * メッセージ・コメント・スタンプ等のID生成
 * crypto.randomUUIDが使える環境（ブラウザ / Node 19+）ではUUIDを使い、
 * 使えない環境ではタイムスタンプ+乱数にフォールバックする
 */
export function generateId(): string {
  const cryptoObj = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
