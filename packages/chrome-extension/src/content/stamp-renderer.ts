import {
  Stamp,
  StampMessage,
  DEFAULT_STAMP_SIZE,
  STAMP_DISPLAY_DURATION,
  isAllowedStampImageUrl,
} from '@comet/shared';
import { OverlayRenderer } from './overlay-renderer';

// 連打コンボの判定・演出パラメータ
const COMBO_WINDOW_MS = 2000; // この間隔以内に同じスタンプが来たらコンボ継続
const COMBO_BURST_EVERY = 5; // 5連打ごとに破裂演出
const BURST_STAMP_SIZE = 160;
const BURST_HOLD_MS = 550; // ポップ表示してから破裂するまで
const BURST_DISPLAY_DURATION = 1400;
const BURST_PARTICLE_COUNT = 12;
const PARTICLE_SIZE = 36;
const PARTICLE_DURATION = 800;

interface ComboState {
  count: number;
  lastAt: number;
}

/**
 * スタンプ表示を管理するクラス
 */
export class StampRenderer extends OverlayRenderer {
  /** スタンプごとの連打コンボ状態 */
  private comboStates = new Map<string, ComboState>();

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

    this.updateCombo(stampMessage);
  }

  clearAll(): void {
    super.clearAll();
    this.comboStates.clear();
  }

  /**
   * 連打コンボを更新し、一定数ごとに破裂演出を出す
   */
  private updateCombo(stampMessage: StampMessage): void {
    const stamp = stampMessage.stamp;
    const key = stamp.id || stamp.name;
    const now = Date.now();

    const state = this.comboStates.get(key);
    const count =
      state && now - state.lastAt <= COMBO_WINDOW_MS ? state.count + 1 : 1;
    this.comboStates.set(key, { count, lastAt: now });

    if (count >= COMBO_BURST_EVERY && count % COMBO_BURST_EVERY === 0) {
      this.renderBurst(stamp, count);
    }
  }

  /**
   * コンボ達成時の破裂演出
   * 巨大なスタンプが中央付近にポップ→破裂して粒が飛び散る
   */
  private renderBurst(stamp: Stamp, comboCount: number): void {
    const containerWidth = this.container.clientWidth;
    const containerHeight = this.container.clientHeight;

    // 中央付近にランダム配置
    const x = containerWidth * (0.3 + Math.random() * 0.4);
    const y = containerHeight * (0.3 + Math.random() * 0.3);

    const burst = document.createElement('div');
    burst.className = 'comet-stamp-burst';
    burst.style.cssText = `
      position: absolute;
      left: ${x}px;
      top: ${y}px;
      transform: translate(-50%, -50%) scale(0);
      opacity: 1;
      pointer-events: none;
      user-select: none;
      text-align: center;
      z-index: 999998;
      filter: drop-shadow(0 0 14px rgba(255, 255, 255, 0.9));
    `;

    burst.appendChild(this.createStampFace(stamp, BURST_STAMP_SIZE));

    const label = document.createElement('div');
    label.textContent = `×${comboCount}`;
    label.style.cssText = `
      font-size: 40px;
      font-weight: bold;
      color: #FFD700;
      text-shadow:
        -2px -2px 0 #000,
        2px -2px 0 #000,
        -2px 2px 0 #000,
        2px 2px 0 #000;
      font-family: 'Arial', 'Hiragino Sans', 'Meiryo', sans-serif;
    `;
    burst.appendChild(label);

    this.addElement(burst, BURST_DISPLAY_DURATION);

    // 出現（勢いよくポップ）
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        burst.style.transition =
          'transform 200ms cubic-bezier(0.34, 1.56, 0.64, 1)';
        burst.style.transform = 'translate(-50%, -50%) scale(1)';
      });
    });

    // 少し見せてから破裂（本体は膨張しながら消え、粒が飛び散る）
    this.scheduleTimeout(() => {
      burst.style.transition = 'transform 250ms ease-in, opacity 250ms ease-in';
      burst.style.transform = 'translate(-50%, -50%) scale(1.7)';
      burst.style.opacity = '0';
      this.spawnParticles(stamp, x, y);
    }, BURST_HOLD_MS);
  }

  /**
   * 破裂時に四方八方へ飛び散る粒を生成する
   */
  private spawnParticles(stamp: Stamp, x: number, y: number): void {
    for (let i = 0; i < BURST_PARTICLE_COUNT; i++) {
      const particle = document.createElement('div');
      particle.style.cssText = `
        position: absolute;
        left: ${x}px;
        top: ${y}px;
        transform: translate(-50%, -50%) scale(1);
        opacity: 1;
        pointer-events: none;
        user-select: none;
        z-index: 999998;
      `;
      particle.appendChild(this.createStampFace(stamp, PARTICLE_SIZE));

      this.addElement(particle, PARTICLE_DURATION + 100);

      // 全方位に均等 + 少しランダムにばらす
      const angle =
        (Math.PI * 2 * i) / BURST_PARTICLE_COUNT + Math.random() * 0.5;
      const distance = 120 + Math.random() * 160;
      const dx = Math.cos(angle) * distance;
      const dy = Math.sin(angle) * distance;
      const rotation = Math.random() * 360 - 180;

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          particle.style.transition = `transform ${PARTICLE_DURATION}ms cubic-bezier(0.16, 0.84, 0.44, 1), opacity ${PARTICLE_DURATION}ms ease-in`;
          particle.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.4) rotate(${rotation}deg)`;
          particle.style.opacity = '0';
        });
      });
    }
  }

  /**
   * スタンプの見た目（カスタム画像 or 絵文字）を指定サイズで生成する
   * 画像URLはWebSocket経由の外部入力なので、許可された配信元のみimgとして読み込む
   */
  private createStampFace(stamp: Stamp, size: number): HTMLElement {
    if (
      stamp.category === 'custom' &&
      stamp.imageUrl &&
      isAllowedStampImageUrl(stamp.imageUrl)
    ) {
      const img = document.createElement('img');
      img.src = stamp.imageUrl;
      img.style.cssText = `
        width: ${size}px;
        height: ${size}px;
        object-fit: contain;
        display: block;
        margin: 0 auto;
      `;
      return img;
    }

    const span = document.createElement('span');
    span.textContent = stamp.name.split(' ')[0];
    span.style.cssText = `font-size: ${size}px; line-height: 1; display: block;`;
    return span;
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
      pointer-events: none;
      user-select: none;
      transform: scale(0);
      opacity: 1;
      z-index: 999998;
      filter: drop-shadow(0 0 10px rgba(255, 255, 255, 0.8));
    `;

    element.appendChild(
      this.createStampFace(stampMessage.stamp, DEFAULT_STAMP_SIZE)
    );

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
