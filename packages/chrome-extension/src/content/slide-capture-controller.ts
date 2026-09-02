import { GLOBAL_ROOM_ID } from '@comet/shared';
import type { CometSettings } from '../settings';

type CaptureResult = { success: boolean; dataUrl?: string; error?: string };

/** Observes slide changes and records a capture only while this client holds the Room lock. */
export class SlideCaptureController {
  private timer: number | null = null;
  private debounceTimer: number | null = null;
  private observer: MutationObserver | null = null;
  private captureInProgress = false;
  private lastFingerprint = '';

  constructor(
    private readonly getSettings: () => CometSettings | null,
    private readonly getRoomId: () => string | null
  ) {}

  configure(): void {
    this.cleanup();
    const settings = this.getSettings();
    const roomId = this.getRoomId();
    if (!settings?.captureEnabled || !settings.historyApiUrl || !roomId || roomId === GLOBAL_ROOM_ID) return;

    const schedule = () => {
      if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
      this.debounceTimer = window.setTimeout(() => void this.capture(), 800);
    };
    this.observer = new MutationObserver(schedule);
    this.observer.observe(document.body, {
      subtree: true, childList: true, attributes: true, characterData: true,
    });
    this.timer = window.setInterval(() => void this.capture(true), 60_000);
    void this.capture(true);
  }

  cleanup(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    if (this.debounceTimer !== null) window.clearTimeout(this.debounceTimer);
    this.observer?.disconnect();
    this.timer = null;
    this.debounceTimer = null;
    this.observer = null;
  }

  private async capture(force = false): Promise<void> {
    const settings = this.getSettings();
    const roomId = this.getRoomId();
    if (this.captureInProgress || !settings?.captureEnabled || !settings.historyApiUrl || !roomId || roomId === GLOBAL_ROOM_ID) return;
    const fingerprint = this.slideFingerprint();
    if (!force && fingerprint === this.lastFingerprint) return;
    this.captureInProgress = true;
    try {
      const deviceId = await this.getDeviceId();
      if (!(await this.claimRecorder(settings, roomId, deviceId))) return;
      const dataUrl = await this.captureVisibleTab();
      const response = await fetch(`${settings.historyApiUrl}/rooms/${encodeURIComponent(roomId)}/captures`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ deviceId, dataUrl, capturedAt: Date.now() }),
      });
      if (!response.ok) throw new Error(`Capture upload failed: HTTP ${response.status}`);
      this.lastFingerprint = fingerprint;
    } catch (error) {
      console.warn('Comet: Failed to record the slide:', error);
    } finally { this.captureInProgress = false; }
  }

  private async getDeviceId(): Promise<string> {
    const stored = await chrome.storage.local.get('captureDeviceId');
    if (typeof stored.captureDeviceId === 'string') return stored.captureDeviceId;
    const deviceId = crypto.randomUUID();
    await chrome.storage.local.set({ captureDeviceId: deviceId });
    return deviceId;
  }

  private slideFingerprint(): string {
    const selectors = ['.punch-viewer-page-wrapper:not([style*="display: none"])', '.sketchy-content-text', '[aria-label*="Slide"]', '[aria-label*="スライド"]'];
    const slide = selectors.map((selector) => document.querySelector<HTMLElement>(selector)).find(Boolean);
    return `${location.href}|${slide?.getAttribute('aria-label') ?? ''}|${slide?.textContent?.trim().slice(0, 500) ?? ''}`;
  }

  private async claimRecorder(settings: CometSettings, roomId: string, deviceId: string): Promise<boolean> {
    const response = await fetch(`${settings.historyApiUrl}/rooms/${encodeURIComponent(roomId)}/recorder`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deviceId }),
    });
    if (!response.ok) console.info('Comet: Another presenter is recording this Room.');
    return response.ok;
  }

  private async captureVisibleTab(): Promise<string> {
    const overlays = ['comet-comment-container', 'comet-stamp-container', 'comet-qr-container']
      .map((id) => document.getElementById(id)).filter((element): element is HTMLElement => Boolean(element));
    const visibility = overlays.map((element) => element.style.visibility);
    overlays.forEach((element) => { element.style.visibility = 'hidden'; });
    let result: CaptureResult;
    try {
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      result = await chrome.runtime.sendMessage({ type: 'CAPTURE_VISIBLE_TAB' });
    } finally { overlays.forEach((element, index) => { element.style.visibility = visibility[index]; }); }
    if (!result.success || !result.dataUrl) throw new Error(result.error ?? 'Capture failed');
    return result.dataUrl;
  }
}
