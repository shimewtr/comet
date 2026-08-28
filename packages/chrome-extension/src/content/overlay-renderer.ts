/**
 * 画面全体を覆うオーバーレイ表示の共通基盤
 * コンテナ管理・フルスクリーン追従・要素の寿命（削除タイマー）管理を担う
 */
export abstract class OverlayRenderer {
  protected container: HTMLElement;
  protected activeElements: Set<HTMLElement> = new Set();
  private removalTimeouts: Set<number> = new Set();
  protected enabled: boolean = true;
  private readonly handleFullscreenChange = () => {
    this.attachContainer();
  };

  constructor(containerId: string, zIndex: number) {
    this.container = this.createContainer(containerId, zIndex);
    this.attachContainer();
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
  }

  /**
   * コンテナを適切な場所にアタッチ
   */
  private attachContainer(): void {
    const target = document.fullscreenElement || document.body;
    if (!target.contains(this.container)) {
      target.appendChild(this.container);
    }
  }

  /**
   * オーバーレイコンテナを作成
   */
  private createContainer(id: string, zIndex: number): HTMLElement {
    const container = document.createElement('div');
    container.id = id;
    container.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: ${zIndex};
      overflow: hidden;
    `;
    return container;
  }

  /**
   * 追加済みの要素を管理対象にし、指定時間後に削除するタイマーを張る
   */
  protected trackElement(element: HTMLElement, lifetimeMs: number): void {
    this.activeElements.add(element);
    this.scheduleTimeout(() => this.removeElement(element), lifetimeMs);
  }

  /**
   * clearAll/destroy時にまとめて破棄されるタイマーを張る
   */
  protected scheduleTimeout(callback: () => void, delayMs: number): void {
    const timeoutId = window.setTimeout(() => {
      this.removalTimeouts.delete(timeoutId);
      callback();
    }, delayMs);
    this.removalTimeouts.add(timeoutId);
  }

  /**
   * 要素をコンテナに追加して管理対象にする
   */
  protected addElement(element: HTMLElement, lifetimeMs: number): void {
    this.container.appendChild(element);
    this.trackElement(element, lifetimeMs);
  }

  /**
   * 要素を削除
   */
  protected removeElement(element: HTMLElement): void {
    if (this.activeElements.has(element)) {
      this.activeElements.delete(element);
      element.remove();
    }
  }

  /**
   * 全要素をクリア
   */
  clearAll(): void {
    this.removalTimeouts.forEach((id) => window.clearTimeout(id));
    this.removalTimeouts.clear();
    this.activeElements.forEach((element) => element.remove());
    this.activeElements.clear();
  }

  /**
   * オーバーレイ全体の不透明度を設定する（表示中の要素にも即時反映される）
   * 個々の要素が持つopacity（フェードアウトやblinkアニメーション）とは
   * 乗算されるため、演出とは競合しない
   */
  setOpacity(opacity: number): void {
    this.container.style.opacity = String(opacity);
  }

  /**
   * 表示を有効化
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * 表示を無効化
   */
  disable(): void {
    this.enabled = false;
    this.clearAll();
  }

  /**
   * コンテナごと破棄
   */
  destroy(): void {
    this.clearAll();
    document.removeEventListener(
      'fullscreenchange',
      this.handleFullscreenChange
    );
    this.container.remove();
  }
}
