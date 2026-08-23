import {
  StampMessage,
  DEFAULT_STAMP_SIZE,
  STAMP_DISPLAY_DURATION,
  isAllowedStampImageUrl,
} from '@comet/shared';
import { OverlayRenderer } from './overlay-renderer';

/**
 * スタンプ表示を管理するクラス
 */
export class StampRenderer extends OverlayRenderer {
  constructor() {
    super('comet-stamp-container', 999998);
  }

  /**
   * スタンプを表示
   */
  renderStamp(stampMessage: StampMessage): void {
    if (!this.enabled) {
      return; // 無効化されている場合は表示しない
    }

    const element = this.createStampElement(stampMessage);
    this.addElement(element, STAMP_DISPLAY_DURATION);

    // アニメーション開始（拡大しながら消える）
    this.animateStamp(element);
  }

  /**
   * スタンプ要素を作成
   */
  private createStampElement(stampMessage: StampMessage): HTMLElement {
    const element = document.createElement('div');
    element.className = 'comet-stamp';

    // 位置を設定（指定がない場合はランダム）
    const position = stampMessage.position || this.getRandomPosition();

    element.style.cssText = `
      position: absolute;
      left: ${position.x}px;
      top: ${position.y}px;
      font-size: ${DEFAULT_STAMP_SIZE}px;
      pointer-events: none;
      user-select: none;
      transform: scale(0);
      opacity: 1;
      z-index: 999998;
      filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.8));
    `;

    // スタンプの表示
    // 画像URLはWebSocket経由の外部入力なので、許可された配信元のみimgとして読み込む
    if (
      stampMessage.stamp.category === 'custom' &&
      stampMessage.stamp.imageUrl &&
      isAllowedStampImageUrl(stampMessage.stamp.imageUrl)
    ) {
      // カスタムスタンプの場合は画像を表示
      const img = document.createElement('img');
      img.src = stampMessage.stamp.imageUrl;
      img.style.cssText = `
        width: ${DEFAULT_STAMP_SIZE}px;
        height: ${DEFAULT_STAMP_SIZE}px;
        object-fit: contain;
      `;
      element.appendChild(img);
    } else {
      // デフォルトスタンプの場合は絵文字を表示
      element.textContent = stampMessage.stamp.name.split(' ')[0];
    }

    return element;
  }

  /**
   * スタンプをアニメーション
   */
  private animateStamp(element: HTMLElement): void {
    // 拡大しながら消えるアニメーション
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        element.style.transform = 'scale(2.5)';
        element.style.opacity = '0';
        element.style.transition = `transform ${STAMP_DISPLAY_DURATION}ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity ${STAMP_DISPLAY_DURATION}ms ease-out`;
      });
    });
  }

  /**
   * ランダムな表示位置を取得
   */
  private getRandomPosition(): { x: number; y: number } {
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;

    // 画面端から少し内側に表示
    const margin = 100;

    return {
      x:
        margin +
        Math.random() * (containerWidth - margin * 2 - DEFAULT_STAMP_SIZE),
      y:
        margin +
        Math.random() * (containerHeight - margin * 2 - DEFAULT_STAMP_SIZE),
    };
  }
}
