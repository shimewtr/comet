import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CometSocket, CometSocketStatus } from './comet-socket.js';
import { WebSocketMessageType } from './types/index.js';

/**
 * WebSocketのモック
 * テストから open() / serverClose() / message() で状態遷移を起こす
 */
class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  readyState = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;

  constructor(public url: string) {
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  // ---- テスト用ヘルパー ----
  open(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  serverClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }

  message(obj: unknown): void {
    this.onmessage?.({ data: JSON.stringify(obj) });
  }
}

function latestWs(): MockWebSocket {
  return MockWebSocket.instances[MockWebSocket.instances.length - 1];
}

describe('CometSocket', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    MockWebSocket.instances = [];
    vi.stubGlobal('WebSocket', MockWebSocket);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('openでconnectが解決しstatusがopenになる', async () => {
    const statuses: CometSocketStatus[] = [];
    const socket = new CometSocket('wss://example.com', {
      onStatusChange: (s) => statuses.push(s),
    });

    const promise = socket.connect();
    latestWs().open();
    await promise;

    expect(socket.isOpen).toBe(true);
    expect(statuses).toEqual(['connecting', 'open']);
  });

  it('購読したハンドラーにpayloadが届き、解除後は届かない', async () => {
    const socket = new CometSocket('wss://example.com');
    const received: unknown[] = [];
    const unsubscribe = socket.on(WebSocketMessageType.NEW_COMMENT, (p) =>
      received.push(p)
    );

    const promise = socket.connect();
    latestWs().open();
    await promise;

    latestWs().message({
      type: WebSocketMessageType.NEW_COMMENT,
      payload: { comment: { id: '1' } },
      timestamp: 0,
    });
    expect(received).toEqual([{ comment: { id: '1' } }]);

    unsubscribe();
    latestWs().message({
      type: WebSocketMessageType.NEW_COMMENT,
      payload: { comment: { id: '2' } },
      timestamp: 0,
    });
    expect(received).toHaveLength(1);
  });

  it('未接続時のsendはfalseを返す', () => {
    const socket = new CometSocket('wss://example.com');
    expect(socket.send(WebSocketMessageType.NEW_COMMENT, {})).toBe(false);
  });

  it('sendWhenOpenは接続完了を待ってから送信する', async () => {
    const socket = new CometSocket('wss://example.com');
    socket.connect().catch(() => {});

    const sendPromise = socket.sendWhenOpen(WebSocketMessageType.NEW_COMMENT, {
      test: true,
    });

    // 100ms後に接続完了させる
    await vi.advanceTimersByTimeAsync(100);
    latestWs().open();
    await vi.advanceTimersByTimeAsync(100);

    await expect(sendPromise).resolves.toBe(true);
    expect(latestWs().sent).toHaveLength(1);
    expect(JSON.parse(latestWs().sent[0]).type).toBe(
      WebSocketMessageType.NEW_COMMENT
    );
  });

  it('sendWhenOpenはタイムアウトするとfalseを返す', async () => {
    const socket = new CometSocket('wss://example.com');
    socket.connect().catch(() => {});

    const sendPromise = socket.sendWhenOpen(
      WebSocketMessageType.NEW_COMMENT,
      {},
      3000
    );
    await vi.advanceTimersByTimeAsync(3500);

    await expect(sendPromise).resolves.toBe(false);
  });

  it('切断されると指数バックオフで再接続する', async () => {
    const socket = new CometSocket('wss://example.com');
    const promise = socket.connect();
    latestWs().open();
    await promise;

    // 1回目の切断 → 1秒後に再接続
    latestWs().serverClose();
    expect(socket.currentStatus).toBe('reconnecting');
    expect(MockWebSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(2);

    // 2回目の切断 → 2秒後に再接続（1.9秒時点ではまだ）
    latestWs().serverClose();
    await vi.advanceTimersByTimeAsync(1900);
    expect(MockWebSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(100);
    expect(MockWebSocket.instances).toHaveLength(3);

    // 再接続に成功するとattemptsがリセットされる
    latestWs().open();
    expect(socket.currentStatus).toBe('open');
    latestWs().serverClose();
    await vi.advanceTimersByTimeAsync(1000);
    expect(MockWebSocket.instances).toHaveLength(4);
  });

  it('再接続の上限に達するとfailedになる', async () => {
    const socket = new CometSocket('wss://example.com', {
      maxReconnectAttempts: 2,
    });
    const promise = socket.connect();
    latestWs().open();
    await promise;

    latestWs().serverClose(); // attempt 1をスケジュール
    await vi.advanceTimersByTimeAsync(1000);
    latestWs().serverClose(); // attempt 2をスケジュール
    await vi.advanceTimersByTimeAsync(2000);
    latestWs().serverClose(); // 上限超過

    expect(socket.currentStatus).toBe('failed');
    const count = MockWebSocket.instances.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockWebSocket.instances).toHaveLength(count);
  });

  it('disconnectでは再接続せずclosedになる', async () => {
    const socket = new CometSocket('wss://example.com');
    const promise = socket.connect();
    latestWs().open();
    await promise;

    socket.disconnect();
    expect(socket.currentStatus).toBe('closed');

    await vi.advanceTimersByTimeAsync(60_000);
    expect(MockWebSocket.instances).toHaveLength(1);
  });

  it('reconnectNowで再接続カウントがリセットされて接続し直す', async () => {
    const socket = new CometSocket('wss://example.com', {
      maxReconnectAttempts: 1,
    });
    const promise = socket.connect();
    latestWs().open();
    await promise;

    latestWs().serverClose();
    await vi.advanceTimersByTimeAsync(1000);
    latestWs().serverClose(); // 上限超過 → failed
    expect(socket.currentStatus).toBe('failed');

    socket.reconnectNow();
    expect(MockWebSocket.instances).toHaveLength(3);
    latestWs().open();
    expect(socket.currentStatus).toBe('open');
  });

  it('接続中は一定間隔でPINGを送り、切断後は送らない', async () => {
    const socket = new CometSocket('wss://example.com', {
      keepaliveIntervalMs: 1000,
    });
    const promise = socket.connect();
    const ws = latestWs();
    ws.open();
    await promise;

    await vi.advanceTimersByTimeAsync(3000);
    const pings = ws.sent.filter(
      (d) => JSON.parse(d).type === WebSocketMessageType.PING
    );
    expect(pings).toHaveLength(3);

    socket.disconnect();
    await vi.advanceTimersByTimeAsync(3000);
    expect(
      ws.sent.filter((d) => JSON.parse(d).type === WebSocketMessageType.PING)
    ).toHaveLength(3);
  });

  it('tokenProviderのトークンを接続URLに付与する', async () => {
    const socket = new CometSocket('wss://example.com', {
      tokenProvider: () => 'ticket-123',
    });
    const promise = socket.connect();
    await vi.advanceTimersByTimeAsync(0); // tokenProviderの解決を待つ
    latestWs().open();
    await promise;

    expect(latestWs().url).toBe('wss://example.com?token=ticket-123');
  });

  it('認証の有無に関係なく匿名参加者IDを接続URLへ付与する', async () => {
    const socket = new CometSocket('wss://example.com?existing=true', {
      tokenProvider: () => 'ticket-123',
      participantId: 'participant 123',
    });
    const promise = socket.connect();
    await vi.advanceTimersByTimeAsync(0);
    latestWs().open();
    await promise;

    expect(latestWs().url).toBe(
      'wss://example.com?existing=true&token=ticket-123&participantId=participant%20123'
    );
  });

  it('keepaliveIntervalMsに0以下を指定するとPINGを送らない', async () => {
    const socket = new CometSocket('wss://example.com', {
      keepaliveIntervalMs: 0,
    });
    const promise = socket.connect();
    const ws = latestWs();
    ws.open();
    await promise;

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(ws.sent).toHaveLength(0);
  });
});
