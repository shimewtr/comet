import { useRef, useState, useEffect } from 'react';
import { CommentForm } from './components/CommentForm';
import { CommentHistory } from './components/CommentHistory';
import { StatusToast } from './components/StatusToast';
import { StampPicker } from './components/StampPicker';
import { useWebSocket } from './hooks/useWebSocket';
import { RoomSelector } from './components/RoomSelector';
import type { CommentStyle, Stamp } from '@comet/shared';
import './App.scss';
import { HistoryPage } from './components/HistoryPage';
import { ExtensionAuthPage } from './components/ExtensionAuthPage';

function LiveApp() {
  const {
    isConnected,
    error,
    commentHistory,
    sendComment,
    sendStamp,
    reconnect,
    isJoiningRoom,
    rooms,
    currentRoom,
    joinRoom,
    createRoom,
    refreshRooms,
  } = useWebSocket();
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const prevConnectedRef = useRef<boolean>(isConnected);

  useEffect(() => {
    const wasConnected = prevConnectedRef.current;

    if (!isConnected && wasConnected) {
      setToast({ message: '接続が切断されました' });
    } else if (isConnected && !wasConnected) {
      setToast(null);
    }

    prevConnectedRef.current = isConnected;
  }, [isConnected]);

  useEffect(() => {
    if (error) {
      setToast({ message: error });
    }
  }, [error]);

  const handleCommentSubmit = async (content: string, style: CommentStyle) => {
    const success = await sendComment({ content, style });
    if (!success) {
      console.error('Failed to send comment');
      setToast({ message: 'コメントを送信できませんでした' });
    }
  };

  const handleStampSelect = async (stamp: Stamp) => {
    const success = await sendStamp(stamp);
    if (!success) {
      console.error('Failed to send stamp');
      setToast({ message: 'スタンプを送信できませんでした' });
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">
          <img className="comet-icon" src="comet-icon.png" alt="Comet Icon" />
          Comet
        </h1>
      </header>

      <div className="app-content">
        <RoomSelector
          rooms={rooms}
          currentRoom={currentRoom}
          disabled={!isConnected || isJoiningRoom}
          onJoin={joinRoom}
          onCreate={createRoom}
          onRefresh={refreshRooms}
        />

        <div className="app-content-main">
          <main className="app-main">
            <CommentForm
              onSubmit={handleCommentSubmit}
              disabled={!isConnected || isJoiningRoom}
            />

            <div className="stamp-section">
              <StampPicker
                onSelectStamp={handleStampSelect}
                disabled={!isConnected || isJoiningRoom}
              />
            </div>
          </main>

          <aside className="app-aside">
            <CommentHistory comments={commentHistory} />
          </aside>
        </div>
      </div>

      {toast && <StatusToast message={toast.message} onReconnect={reconnect} />}
    </div>
  );
}

function App() {
  if (window.location.pathname === '/auth/extension') {
    return (
      <div className="app">
        <header className="app-header compact-header">
          <span className="app-title">
            <img
              className="comet-icon"
              src="/comet-icon.png"
              alt="Comet Icon"
            />
            Comet
          </span>
        </header>
        <ExtensionAuthPage />
      </div>
    );
  }
  if (!window.location.pathname.startsWith('/history')) return <LiveApp />;
  return (
    <div className="app">
      <header className="app-header compact-header">
        <a className="app-title" href="/">
          <img className="comet-icon" src="/comet-icon.png" alt="Comet Icon" />
          Comet
        </a>
      </header>
      <HistoryPage />
    </div>
  );
}

export default App;
