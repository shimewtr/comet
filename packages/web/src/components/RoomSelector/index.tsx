import { useState } from 'react';
import type { Room } from '@comet/shared';
import { RefreshIcon } from '../../assets/icons';
import './style.scss';

interface Props {
  rooms: Room[];
  currentRoom: Room;
  connected: boolean;
  disabled: boolean;
  onJoin: (roomId: string) => Promise<boolean>;
  onCreate: (name: string) => Promise<boolean>;
  onRefresh: () => void;
}

/** プルダウン末尾に置く「新規作成」用の特別な値（Room IDと衝突しない文字列） */
const CREATE_OPTION = '__create__';

/**
 * ヘッダーに収まるRoom操作ツールバー
 * Roomの切り替えと新規作成を1つのプルダウンにまとめる
 */
export function RoomSelector({
  rooms,
  currentRoom,
  connected,
  disabled,
  onJoin,
  onCreate,
  onRefresh,
}: Props) {
  const [isCreating, setIsCreating] = useState(false);
  const [name, setName] = useState('');

  const cancelCreate = () => {
    setIsCreating(false);
    setName('');
  };

  const handleSelect = (value: string) => {
    if (value === CREATE_OPTION) {
      setIsCreating(true);
      return;
    }
    void onJoin(value);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (value && (await onCreate(value))) cancelCreate();
  };

  return (
    <div className="room-toolbar" role="group" aria-label="Room設定">
      <div className={`room-toolbar-group ${isCreating ? 'is-creating' : ''}`}>
        <label
          htmlFor={isCreating ? 'room-name' : 'room-select'}
          className="room-toolbar-label"
        >
          <span
            className={`room-status-dot ${connected ? 'is-online' : ''}`}
            title={connected ? '接続中' : '未接続'}
            aria-hidden="true"
          />
          {/* モバイルでは文字を視覚的に隠し、ラベルとしての読み上げだけ残す */}
          <span className="room-toolbar-label-text">Room</span>
        </label>

        {isCreating ? (
          <form onSubmit={submit} className="room-create">
            <input
              id="room-name"
              value={name}
              maxLength={50}
              placeholder="新しいRoom名"
              disabled={disabled}
              autoFocus
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Escape') cancelCreate();
              }}
            />
            <button
              className="room-create-button"
              type="submit"
              disabled={disabled || !name.trim()}
            >
              作成
            </button>
            <button
              className="room-icon-button"
              type="button"
              onClick={cancelCreate}
              aria-label="作成をキャンセル"
              title="キャンセル (Esc)"
            >
              <span aria-hidden="true">×</span>
            </button>
          </form>
        ) : (
          <>
            <select
              id="room-select"
              value={currentRoom.id}
              disabled={disabled}
              onFocus={onRefresh}
              onChange={(event) => handleSelect(event.target.value)}
            >
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                  {room.id === 'global' ? '' : ` (${room.id.slice(0, 8)})`}
                </option>
              ))}
              <option disabled>──────────</option>
              <option value={CREATE_OPTION}>＋ 新しいRoomを作成…</option>
            </select>
            <button
              className="room-icon-button"
              type="button"
              onClick={onRefresh}
              disabled={disabled}
              aria-label="Room一覧を更新"
              title="Room一覧を更新"
            >
              <RefreshIcon />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
