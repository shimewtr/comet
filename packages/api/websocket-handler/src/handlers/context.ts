import { WebSocketMessageType } from '@comet/shared';

export interface MessageContext {
  connectionId: string;
  sendToRequester: <T>(
    type: WebSocketMessageType,
    payload: T,
    roomId?: string
  ) => Promise<void>;
  sendError: (code: 'INVALID_ROOM_NAME' | 'ROOM_EXPIRED' | 'INVALID_MESSAGE' | 'POLL_INVALID' | 'POLL_ALREADY_ACTIVE' | 'POLL_NOT_FOUND' | 'POLL_FORBIDDEN', message: string) => Promise<void>;
  sendPollState: (roomId: string, poll: import('@comet/shared').Poll | null) => Promise<void>;
  currentRoomForActivity: () => Promise<string | null>;
  fallbackToGlobal: () => Promise<void>;
}
