import { Comment, COMMENT_SIZES, DEFAULT_COMMENT_COLOR } from '@comet/shared';
import { OverlayRenderer } from './overlay-renderer';

/**
 * コメント表示を管理するクラス
 */
export class CommentRenderer extends OverlayRenderer {
  constructor() {
    super('comet-comment-container', 999999);
  }

  /**
   * コメントを表示
   */
  renderComment(comment: Comment): void {
    if (!this.enabled) {
      return; // 無効化されている場合は表示しない
    }

    const element = this.createCommentElement(comment);

    // 幅の計測（offsetWidth）が必要なので先にDOMへ追加する
    this.container.appendChild(element);
    const duration = this.startScrollAnimation(element, comment);
    this.trackElement(element, duration);
  }

  /**
   * コメント要素を作成
   */
  private createCommentElement(comment: Comment): HTMLElement {
    const element = document.createElement('div');
    element.className = 'comet-comment';

    // bounce/shake等のCSSアニメーションはtransformを使うため、
    // スクロール移動（translateX）と衝突しないよう内側の要素に適用する
    const inner = document.createElement('span');
    inner.style.display = 'inline-block';
    inner.textContent = comment.content;

    const animation = comment.style.animation || 'none';
    if (animation !== 'none') {
      inner.classList.add(`comet-animation-${animation}`);
    }

    element.appendChild(inner);

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
   * コメントを右から左へ流すアニメーションを開始
   * 毎フレームJSでleftを書き換える方式は表示中のコメント数に比例して
   * レイアウト計算が発生し重くなるため、transformのCSS transitionで
   * コンポジタに任せる
   * @returns アニメーションの継続時間（ミリ秒）
   */
  private startScrollAnimation(element: HTMLElement, comment: Comment): number {
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

    // 初期スタイルを確定させてからtransitionを開始する
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        element.style.transition = `transform ${duration}ms linear`;
        element.style.transform = `translateX(${-baseDistance}px)`;
      });
    });

    return duration;
  }

  /**
   * ランダムなY座標を取得（重複を避ける簡易版）
   */
  private getRandomYPosition(
    min: number,
    max: number,
    lineHeight: number
  ): number {
    const lanes = Math.floor((max - min) / lineHeight);
    const lane = Math.floor(Math.random() * lanes);
    return min + lane * lineHeight;
  }
}
