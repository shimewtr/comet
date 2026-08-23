import QRCode from 'qrcode';

/**
 * 参加用QRコードを画面隅に表示するクラス
 * 投影中の画面を見ている人がスマホでWebアプリを開けるようにする
 */
export class QrRenderer {
  private container: HTMLElement | null = null;
  private currentUrl = '';
  private readonly handleFullscreenChange = () => {
    this.attachContainer();
  };

  constructor() {
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
  }

  /**
   * 指定URLのQRコードを表示する（表示済みのURLと同じなら何もしない）
   */
  async show(url: string): Promise<void> {
    if (this.container && this.currentUrl === url) {
      this.attachContainer();
      return;
    }

    this.hide();
    this.currentUrl = url;

    let dataUrl: string;
    try {
      dataUrl = await QRCode.toDataURL(url, { width: 140, margin: 1 });
    } catch (error) {
      console.error('Comet: Failed to generate QR code:', error);
      return;
    }

    const container = document.createElement('div');
    container.id = 'comet-qr-container';
    container.style.cssText = `
      position: fixed;
      right: 16px;
      bottom: 16px;
      z-index: 999997;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 8px;
      padding: 8px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
      pointer-events: none;
      text-align: center;
      font-family: 'Arial', 'Hiragino Sans', 'Meiryo', sans-serif;
    `;

    const img = document.createElement('img');
    img.src = dataUrl;
    img.style.cssText = 'width: 140px; height: 140px; display: block;';
    container.appendChild(img);

    const label = document.createElement('div');
    label.textContent = 'コメント投稿はこちら';
    label.style.cssText = 'font-size: 11px; color: #333; margin-top: 4px;';
    container.appendChild(label);

    this.container = container;
    this.attachContainer();
  }

  /**
   * QRコードを非表示にする
   */
  hide(): void {
    this.container?.remove();
    this.container = null;
    this.currentUrl = '';
  }

  /**
   * 破棄する
   */
  destroy(): void {
    this.hide();
    document.removeEventListener(
      'fullscreenchange',
      this.handleFullscreenChange
    );
  }

  private attachContainer(): void {
    if (!this.container) {
      return;
    }
    const target = document.fullscreenElement || document.body;
    if (!target.contains(this.container)) {
      target.appendChild(this.container);
    }
  }
}
