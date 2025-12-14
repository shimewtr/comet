import { Comment, COMMENT_SIZES, DEFAULT_COMMENT_COLOR } from '@comet/shared';

/**
 * コメント表示を管理するクラス
 */
export class CommentRenderer {
  private container: HTMLElement;
  private activeComments: Set<HTMLElement> = new Set();
  private enabled: boolean = true;

  constructor() {
    this.container = this.createContainer();
    document.body.appendChild(this.container);
  }

  /**
   * コメントコンテナを作成
   */
  private createContainer(): HTMLElement {
    const container = document.createElement('div');
    container.id = 'comet-comment-container';
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 999999;
      overflow: hidden;
    `;
    return container;
  }

  /**
   * コメントを表示
   */
  renderComment(comment: Comment): void {
    if (!this.enabled) {
      return; // 無効化されている場合は表示しない
    }

    const element = this.createCommentElement(comment);
    this.container.appendChild(element);
    this.activeComments.add(element);

    // アニメーション開始
    const duration = this.animateComment(element, comment);

    // アニメーション終了後に削除
    setTimeout(() => {
      this.removeComment(element);
    }, duration);
  }

  /**
   * コメント要素を作成
   */
  private createCommentElement(comment: Comment): HTMLElement {
    const element = document.createElement('div');
    element.className = 'comet-comment';
    element.textContent = comment.content;

    const fontSize = COMMENT_SIZES[comment.style.size];
    const color = comment.style.color || DEFAULT_COMMENT_COLOR;

    // 白文字以外は白い影、白文字は黒い影
    const shadowColor = color === '#FFFFFF' ? '#000' : '#FFF';
    const shadowOpacity = color === '#FFFFFF' ? 0.8 : 1.0;

    element.style.cssText = `
      position: absolute;
      white-space: nowrap;
      font-size: ${fontSize}px;
      font-weight: bold;
      color: ${color};
      text-shadow:
        -1px -1px 0 ${shadowColor},
        1px -1px 0 ${shadowColor},
        -1px 1px 0 ${shadowColor},
        1px 1px 0 ${shadowColor},
        0 0 4px rgba(${color === '#FFFFFF' ? '0, 0, 0' : '255, 255, 255'}, ${shadowOpacity});
      pointer-events: none;
      user-select: none;
      font-family: 'Arial', 'Hiragino Sans', 'Meiryo', sans-serif;
    `;

    return element;
  }

  /**
   * コメントをアニメーション
   * @returns アニメーションの継続時間（ミリ秒）
   */
  private animateComment(element: HTMLElement, comment: Comment): number {
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;
    const elementWidth = element.offsetWidth;

    // Y座標を決定（画面の10%〜90%の範囲）
    const lineHeight = COMMENT_SIZES[comment.style.size] + 4;
    const y = this.getRandomYPosition(
      containerHeight * 0.1,
      containerHeight * 0.9,
      lineHeight
    );

    // 初期位置（右端外）
    element.style.left = `${containerWidth}px`;
    element.style.top = `${y}px`;

    // アニメーション設定
    // speedは速度を表す（大きいほど速い）ので、durationは速度に反比例
    const speed = comment.style.speed || 5;
    const baseDistance = containerWidth + elementWidth;
    // 速度をpx/sとして扱い、durationを計算（ミリ秒）
    const duration = (baseDistance / (speed * 100)) * 1000;
    const startTime = Date.now();

    // アニメーションタイプに応じたクラスを追加
    const animation = comment.style.animation || 'none';
    if (animation !== 'none') {
      element.classList.add(`comet-animation-${animation}`);
    }

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = elapsed / duration;

      if (progress >= 1) {
        element.style.left = `${-elementWidth}px`;
        return;
      }

      // 線形移動
      const x = containerWidth - baseDistance * progress;
      element.style.left = `${x}px`;

      requestAnimationFrame(animate);
    };

    requestAnimationFrame(animate);
    return duration;
  }

  /**
   * ランダムなY座標を取得（重複を避ける簡易版）
   */
  private getRandomYPosition(min: number, max: number, lineHeight: number): number {
    const lanes = Math.floor((max - min) / lineHeight);
    const lane = Math.floor(Math.random() * lanes);
    return min + lane * lineHeight;
  }

  /**
   * コメントを削除
   */
  private removeComment(element: HTMLElement): void {
    if (this.activeComments.has(element)) {
      this.activeComments.delete(element);
      element.remove();
    }
  }

  /**
   * 全コメントをクリア
   */
  clearAll(): void {
    this.activeComments.forEach((element) => element.remove());
    this.activeComments.clear();
  }

  /**
   * コメント表示を有効化
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * コメント表示を無効化
   */
  disable(): void {
    this.enabled = false;
    this.clearAll();
  }

  /**
   * コンテナを削除
   */
  destroy(): void {
    this.clearAll();
    this.container.remove();
  }
}
