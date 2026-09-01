/// <reference lib="dom" />
import {
  ClientWebSocketMessageType,
  WebSocketMessage,
  WebSocketMessageType,
  WebSocketPayload,
} from './types/index.js';
import {
  IncomingWebSocketMessage,
  parseIncomingWebSocketMessage,
} from './utils/websocket.js';

/**
 * 接続状態
 * - connecting: 初回接続中
 * - open: 接続済み
 * - reconnecting: 切断され再接続待ち・再接続中
 * - closed: 手動切断
 * - failed: 再接続の上限に達した
 */
export type CometSocketStatus =
  'connecting' | 'open' | 'reconnecting' | 'closed' | 'failed';

export interface CometSocketOptions {
  /** 再接続の最大試行回数（デフォルト: 5） */
  maxReconnectAttempts?: number;
  /** 再接続の基準遅延ミリ秒。指数バックオフする（デフォルト: 1000） */
  reconnectBaseDelayMs?: number;
  /**
   * キープアライブPINGの送信間隔ミリ秒（デフォルト: 5分、0以下で無効）
   * API GatewayのWebSocketはアイドル10分で切断されるため、それより短くする
   */
  keepaliveIntervalMs?: number;
  /** 接続状態が変わったときに呼ばれる */
  onStatusChange?: (status: CometSocketStatus) => void;
  /**
   * 認証チケットの取得関数（認証を有効化した構成で使う）。
   * 返したトークンは接続URLの ?token= に付与される。nullなら付与しない
   */
  tokenProvider?: () => string | null | Promise<string | null>;
  /** 匿名ブラウザ単位の投票識別子。接続URL以外のメッセージには含めない */
  participantId?: string;
}

type MessageHandler<T extends WebSocketMessageType> = (
  payload: WebSocketPayload<T>,
  message: IncomingWebSocketMessage<T>
) => void;

type UntypedMessageHandler = (
  payload: unknown,
  message: IncomingWebSocketMessage
) => void;

const DEFAULT_MAX_RECONNECT_ATTEMPTS = 5;
const DEFAULT_RECONNECT_BASE_DELAY_MS = 1000;
const DEFAULT_KEEPALIVE_INTERVAL_MS = 5 * 60 * 1000;
const SEND_WAIT_POLL_INTERVAL_MS = 50;

/**
 * Cometの共通WebSocketクライアント
 * 接続・自動再接続（指数バックオフ）・型付きメッセージ購読・送信を提供する。
 * Webアプリ（useWebSocket）とChrome拡張の両方から使う。
 */
export class CometSocket {
  private ws: WebSocket | null = null;
  private handlers = new Map<
    WebSocketMessageType,
    Set<UntypedMessageHandler>
  >();
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
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
  async connect(): Promise<void> {
    this.manuallyClosed = false;
    this.setStatus(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    // 認証チケットと匿名参加者IDを接続URLに付与する
    let url = this.url;
    if (this.options.tokenProvider) {
      try {
        const token = await this.options.tokenProvider();
        if (token) {
          url += `${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
        }
      } catch (error) {
        console.error('Failed to get auth token:', error);
      }
    }
    if (this.options.participantId) {
      url += `${url.includes('?') ? '&' : '?'}participantId=${encodeURIComponent(
        this.options.participantId
      )}`;
    }

    return new Promise((resolve, reject) => {
      let settled = false;

      try {
        const ws = new WebSocket(url);
        this.ws = ws;

        ws.onopen = () => {
          this.reconnectAttempts = 0;
          this.setStatus('open');
          this.startKeepalive();
          settled = true;
          resolve();
        };

        ws.onmessage = (event) => {
          const message = parseIncomingWebSocketMessage(event.data);
          if (!message) {
            console.error('Received an invalid WebSocket message');
            return;
          }
          this.dispatch(message);
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
          this.clearKeepalive();
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
  on<T extends WebSocketMessageType>(
    type: T,
    handler: MessageHandler<T>
  ): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    const dispatchHandler: UntypedMessageHandler = (payload, message) => {
      handler(
        payload as WebSocketPayload<T>,
        message as IncomingWebSocketMessage<T>
      );
    };
    set.add(dispatchHandler);

    return () => {
      set.delete(dispatchHandler);
    };
  }

  /**
   * メッセージを送信する（未接続なら送信せずfalse）
   */
  send<T extends ClientWebSocketMessageType>(
    type: T,
    payload: WebSocketPayload<T>
  ): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message: WebSocketMessage<WebSocketPayload<T>> = {
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
  async sendWhenOpen<T extends ClientWebSocketMessageType>(
    type: T,
    payload: WebSocketPayload<T>,
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
    this.clearKeepalive();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.setStatus('closed');
  }

  /**
   * API Gatewayのアイドルタイムアウト（10分）による切断を防ぐため、
   * 接続中は定期的にPINGを送る
   */
  private startKeepalive(): void {
    this.clearKeepalive();

    const interval =
      this.options.keepaliveIntervalMs ?? DEFAULT_KEEPALIVE_INTERVAL_MS;
    if (interval <= 0) {
      return;
    }

    this.keepaliveTimer = setInterval(() => {
      this.send(WebSocketMessageType.PING, {});
    }, interval);
  }

  private clearKeepalive(): void {
    if (this.keepaliveTimer !== null) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
  }

  private dispatch(message: IncomingWebSocketMessage): void {
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
