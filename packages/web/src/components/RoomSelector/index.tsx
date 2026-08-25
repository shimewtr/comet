import { useState } from 'react';
import type { Room } from '@comet/shared';
import { SectionBase } from '../common';
import './style.scss';

interface Props {
  rooms: Room[];
  currentRoom: Room;
  disabled: boolean;
  onJoin: (roomId: string) => Promise<boolean>;
  onCreate: (name: string) => Promise<boolean>;
  onRefresh: () => void;
}

export function RoomSelector({
  rooms,
  currentRoom,
  disabled,
  onJoin,
  onCreate,
  onRefresh,
}: Props) {
  const [name, setName] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    const value = name.trim();
    if (value && (await onCreate(value))) setName('');
  };

  return (
    <SectionBase
      title={
        <div className="room-section-title">
          <h3>Room</h3>
          <a className="room-history-link" href="/history">Room履歴を見る</a>
        </div>
      }
      className="room-selector"
    >
      <div className="room-selector-grid">
        <div className="room-form-group">
          <label htmlFor="room-select">参加中のRoom</label>
          <div className="room-input-row">
            <select
              id="room-select"
              value={currentRoom.id}
              disabled={disabled}
              onFocus={onRefresh}
              onChange={(event) => void onJoin(event.target.value)}
            >
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                  {room.id === 'global' ? '' : ` (${room.id.slice(0, 8)})`}
                </option>
              ))}
            </select>
            <button
              className="room-button room-button-secondary"
              type="button"
              onClick={onRefresh}
              disabled={disabled}
            >
              Room一覧を更新
            </button>
          </div>
        </div>
        <form onSubmit={submit} className="room-form-group room-create-form">
          <label htmlFor="room-name">新しいRoomを作成</label>
          <div className="room-input-row">
            <input
              id="room-name"
              value={name}
              maxLength={50}
              placeholder="Room名を入力"
              disabled={disabled}
              onChange={(event) => setName(event.target.value)}
            />
            <button
              className="room-button room-button-primary"
              type="submit"
              disabled={disabled || !name.trim()}
            >
              作成
            </button>
          </div>
        </form>
      </div>
    </SectionBase>
  );
}
