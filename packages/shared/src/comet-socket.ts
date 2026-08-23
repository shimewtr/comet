/// <reference lib="dom" />
import { WebSocketMessage, WebSocketMessageType } from './types/index.js';

/**
 * 接続状態
 * - connecting: 初回接続中
 * - open: 接続済み
 * - reconnecting: 切断され再接続待ち・再接続中
 * - closed: 手動切断
 * - failed: 再接続の上限に達した
 */
export type CometSocketStatus =
  | 'connecting'
  | 'open'
  | 'reconnecting'
  | 'closed'
  | 'failed';

export interface CometSocketOptions {
  /** 再接続の最大試行回数（デフォルト: 5） */
  maxReconnectAttempts?: number;
  /** 再接続の基準遅延ミリ秒。指数バックオフする（デフォルト: 1000） */
  reconnectBaseDelayMs?: number;
  /** 接続状態が変わったときに呼ばれる */
  onStatusChange?: (status: CometSocketStatus) => void;
}

type MessageHandler<T> = (payload: T, message: WebSocketMessage) => void;

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;
const SEND_WAIT_POLL_INTERVAL_MS = 50;

/**
 * Cometの共通WebSocketクライアント
 * 接続・自動再接続（指数バックオフ）・型付きメッセージ購読・送信を提供する。
 * Webアプリ（useWebSocket）とChrome拡張の両方から使う。
 */
export class CometSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<WebSocketMessageType, Set<MessageHandler<any>>>();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private manuallyClosed = false;
  private status: CometSocketStatus = 'closed';

  constructor(
    private readonly url: string,
    private readonly options: CometSocketOptions = {}
  ) {}

  get isOpen(): boolean {
    return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
  }

  get currentStatus(): CometSocketStatus {
    return this.status;
  }

  /**
   * 接続する。openで解決、open前のエラーで棄却する。
   * 棄却された場合も自動再接続は継続する。
   */
  connect(): Promise<void> {
    this.manuallyClosed = false;

    return new Promise((resolve, reject) => {
      let settled = false;

      try {
        this.setStatus(
          this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting'
        );
        const ws = new WebSocket(this.url);
        this.ws = ws;

        ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.setStatus('open');
          settled = true;
          resolve();
        };

        ws.onmessage = (event) => {
          try {
            const message: WebSocketMessage = JSON.parse(event.data);
            this.dispatch(message);
          } catch (error) {
            console.error('Error parsing WebSocket message:', error);
          }
        };

        ws.onerror = (event) => {
          console.error('WebSocket error:', event);
          if (!settled) {
            settled = true;
            reject(new Error('WebSocket connection error'));
          }
        };

        ws.onclose = () => {
          this.ws = null;
          if (this.manuallyClosed) {
            this.setStatus('closed');
            return;
          }
          this.scheduleReconnect();
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * メッセージハンドラーを登録する
   * @returns 登録解除する関数
   */
  on<T>(type: WebSocketMessageType, handler: MessageHandler<T>): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(handler);

    return () => {
      set.delete(handler);
    };
  }

  /**
   * メッセージを送信する（未接続なら送信せずfalse）
   */
  send(type: WebSocketMessageType, payload: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message: WebSocketMessage = {
      type,
      payload,
      timestamp: Date.now(),
    };

    try {
      this.ws.send(JSON.stringify(message));
      return true;
    } catch (error) {
      console.error('Failed to send message:', error);
      return false;
    }
  }

  /**
   * 接続処理中なら完了を待ってから送信する
   */
  async sendWhenOpen(
    type: WebSocketMessageType,
    payload: unknown,
    timeoutMs = 3000
  ): Promise<boolean> {
    const startTime = Date.now();

    while (
      this.ws?.readyState === WebSocket.CONNECTING &&
      Date.now() - startTime < timeoutMs
    ) {
      await new Promise((resolve) =>
        setTimeout(resolve, SEND_WAIT_POLL_INTERVAL_MS)
      );
    }

    return this.send(type, payload);
  }

  /**
   * 再接続カウントをリセットして接続し直す（手動再接続用）
   */
  reconnectNow(): void {
    this.clearReconnectTimer();
    this.reconnectAttempts = 0;

    if (this.ws) {
      // 既存接続を閉じるとoncloseから再接続が走る
      this.ws.close();
    } else {
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error);
      });
    }
  }

  /**
   * 手動切断する（自動再接続しない）
   */
  disconnect(): void {
    this.manuallyClosed = true;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setStatus('closed');
  }

  private dispatch(message: WebSocketMessage): void {
    const handlers = this.handlers.get(message.type);
    if (handlers) {
      handlers.forEach((handler) => handler(message.payload, message));
    }
  }

  private scheduleReconnect(): void {
    const maxAttempts =
      this.options.maxReconnectAttempts ?? DEFAULT_MAX_RECONNECT_ATTEMPTS;
    const baseDelay =
      this.options.reconnectBaseDelayMs ?? DEFAULT_RECONNECT_BASE_DELAY_MS;

    if (this.reconnectAttempts >= maxAttempts) {
      console.error('Max reconnection attempts reached');
      this.setStatus('failed');
      return;
    }

    this.reconnectAttempts++;
    const delay = baseDelay * Math.pow(2, this.reconnectAttempts - 1);
    console.log(
      `Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`
    );

    this.setStatus('reconnecting');
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch((error) => {
        console.error('Reconnection failed:', error);
      });
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: CometSocketStatus): void {
    if (this.status !== status) {
      this.status = status;
      this.options.onStatusChange?.(status);
    }
  }
}
