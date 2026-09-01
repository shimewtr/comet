export const MIN_POLL_OPTIONS = 2;
export const MAX_POLL_OPTIONS = 8;
export const MIN_POLL_DURATION_SECONDS = 10;
export const MAX_POLL_DURATION_SECONDS = 10 * 60;
export const MAX_POLL_TITLE_LENGTH = 80;
export const MAX_POLL_LABEL_LENGTH = 30;

export interface PollOption {
  /** Poll内で不変の選択肢ID */
  id: string;
  /** Webの組み込み絵文字スタンプID（例: emoji-31-fe0f-20e3） */
  emojiId: string;
  emoji: string;
  label: string;
}

export interface PollResult {
  optionId: string;
  count: number;
  percentage: number;
}

export type PollStatus = 'active' | 'ended';

export interface Poll {
  id: string;
  roomId: string;
  title: string;
  options: PollOption[];
  status: PollStatus;
  startsAt: number;
  endsAt: number;
  totalVotes: number;
  /** 途中経過を公開しないため、終了後だけ設定される */
  results?: PollResult[];
}

export interface StartPollPayload {
  controllerId: string;
  title: string;
  options: PollOption[];
  durationSeconds: number;
}

export interface PollControlPayload {
  pollId: string;
  controllerId: string;
}

export interface PollStatePayload {
  /** 投票なし、キャンセル、結果を閉じた状態ではnull */
  poll: Poll | null;
}
