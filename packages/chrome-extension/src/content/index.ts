import { CometSocket, GLOBAL_ROOM_ID, WebSocketMessageType } from '@comet/shared';
import { loadSettings, type CometSettings } from '../settings';
import { CommentRenderer } from './comment-renderer';
import { QrRenderer } from './qr-renderer';
import { SlideCaptureController } from './slide-capture-controller';
import { StampRenderer } from './stamp-renderer';

let socket: CometSocket | null = null;
let websocketURL = '';
let authToken = '';
let desiredRoomID = GLOBAL_ROOM_ID;
let joinedRoomID: string | null = null;
let settings: CometSettings | null = null;
let comments: CommentRenderer | null = null;
let stamps: StampRenderer | null = null;
let qr: QrRenderer | null = null;

const capture = new SlideCaptureController(() => settings, () => joinedRoomID);

function renderers(): void {
  comments ??= new CommentRenderer();
  stamps ??= new StampRenderer();
  qr ??= new QrRenderer();
}

function updateQR(): void {
  if (!settings?.qrEnabled || !settings.webAppUrl || !joinedRoomID) { qr?.hide(); return; }
  const url = new URL(settings.webAppUrl);
  if (joinedRoomID === GLOBAL_ROOM_ID) url.searchParams.delete('room');
  else url.searchParams.set('room', joinedRoomID);
  void qr?.show(url.toString());
}

function applyJoinedRoom(roomID: string): void {
  joinedRoomID = roomID;
  updateQR();
  capture.configure();
}

function connect(url: string): void {
  socket?.disconnect();
  websocketURL = url;
  if (!url) { console.error('Comet: WebSocket URL is not configured. Please set it in the extension popup.'); return; }
  const client = new CometSocket(url, { tokenProvider: () => authToken || null });
  client.on(WebSocketMessageType.NEW_COMMENT, (payload, message) => {
    if (joinedRoomID && message.roomId === joinedRoomID) comments?.renderComment(payload.comment);
  });
  client.on(WebSocketMessageType.NEW_STAMP, (payload, message) => {
    if (joinedRoomID && message.roomId === joinedRoomID) stamps?.renderStamp(payload.stamp);
  });
  client.on(WebSocketMessageType.ROOM_JOINED, ({ room }) => applyJoinedRoom(room.id));
  client.on(WebSocketMessageType.ERROR, ({ fallbackRoom }) => {
    if (!fallbackRoom) return;
    desiredRoomID = fallbackRoom.id;
    applyJoinedRoom(fallbackRoom.id);
    void chrome.storage.sync.set({ roomId: fallbackRoom.id });
  });
  client.connect().then(() => {
    console.log('Comet: Connected to WebSocket');
    joinedRoomID = null;
    client.send(WebSocketMessageType.JOIN_ROOM, { roomId: desiredRoomID });
  }).catch((error) => console.error('Comet: Failed to connect to WebSocket:', error));
  socket = client;
}

function applySettings(next: CometSettings): void {
  renderers(); settings = next;
  comments?.updateDisplaySettings({ speedScale: next.speedScale, fontScale: next.fontScale, displayArea: next.displayArea });
  comments?.setOpacity(next.commentOpacity);
  stamps?.updateDisplaySettings({ sizeScale: next.fontScale });
  stamps?.setOpacity(next.stampOpacity);
  updateQR(); capture.configure();
  const tokenChanged = next.authToken !== authToken;
  const roomChanged = next.roomId !== desiredRoomID;
  authToken = next.authToken; desiredRoomID = next.roomId;
  if (next.websocketUrl !== websocketURL || tokenChanged || !socket) connect(next.websocketUrl);
  else if (roomChanged && socket.isOpen) { joinedRoomID = null; socket.send(WebSocketMessageType.JOIN_ROOM, { roomId: desiredRoomID }); }
}

async function initialize(): Promise<void> {
  console.log('Comet: Initializing...'); renderers();
  const local = await chrome.storage.local.get('commentsEnabled');
  if (local.commentsEnabled === false) { comments?.disable(); stamps?.disable(); }
  applySettings(await loadSettings());
}

function cleanup(): void {
  socket?.disconnect(); comments?.destroy(); stamps?.destroy(); qr?.destroy(); capture.cleanup();
}

chrome.storage.onChanged.addListener((_, area) => {
  if (area === 'sync' || area === 'local') loadSettings().then(applySettings).catch((error) => console.error('Comet: Failed to apply settings:', error));
});
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'TOGGLE_COMMENTS') {
    if (message.enabled) {
      comments?.enable();
      stamps?.enable();
    } else {
      comments?.disable();
      stamps?.disable();
    }
    sendResponse({ success: true });
  } else sendResponse({ success: false, error: 'Unknown message type' });
  return true;
});
window.addEventListener('beforeunload', cleanup);
initialize().catch((error) => console.error('Comet: Failed to initialize:', error));
