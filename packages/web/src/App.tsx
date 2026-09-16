import { useRef, useState, useEffect } from 'react';
import { CommentForm } from './components/CommentForm';
import { CommentHistory } from './components/CommentHistory';
import { StatusToast } from './components/StatusToast';
import { StampPicker } from './components/StampPicker';
import { useWebSocket } from './hooks/useWebSocket';
import { RoomSelector } from './components/RoomSelector';
import { HeaderMenu } from './components/HeaderMenu';
import { CustomStampManager } from './components/CustomStampManager';
import { useCustomStamps } from './hooks/useCustomStamps';
import type { CommentStyle, Stamp } from '@comet/shared';
import './App.scss';
import { HistoryPage } from './components/HistoryPage';
import { ExtensionAuthPage } from './components/ExtensionAuthPage';
import cometIconUrl from './assets/comet-icon.png';

const REPOSITORY_URL = 'https://github.com/shimewtr/comet';

function AppFooter() {
  return (
    <footer className="app-footer">
      <a href={REPOSITORY_URL} target="_blank" rel="noreferrer">
        Comet is open source on GitHub
      </a>
    </footer>
  );
}

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
  // カスタムスタンプはパレット（表示）とヘッダーの管理メニュー（編集）の両方で使う
  const { customStamps, uploading, deleteStamp, uploadStamp } =
    useCustomStamps();
  const [isStampManagerOpen, setStampManagerOpen] = useState(false);

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
        <div className="app-header-inner">
          <h1 className="app-title">
            <img className="comet-icon" src={cometIconUrl} alt="Comet Icon" />
            Comet
          </h1>

          <div className="app-header-actions">
            <RoomSelector
              rooms={rooms}
              currentRoom={currentRoom}
              connected={isConnected}
              disabled={!isConnected || isJoiningRoom}
              onJoin={joinRoom}
              onCreate={createRoom}
              onRefresh={refreshRooms}
            />
            {/* 履歴への導線と管理系の操作は「…」メニューに逃がす（小さい端末では非表示） */}
            <HeaderMenu
              items={[
                { label: '履歴を見る', href: '/history' },
                {
                  label: 'カスタムスタンプを管理',
                  onSelect: () => setStampManagerOpen(true),
                },
              ]}
            />
          </div>
        </div>
      </header>

      <div className="app-content">
        <div className="app-content-main">
          <main className="app-main">
            <CommentForm
              onSubmit={handleCommentSubmit}
              disabled={!isConnected || isJoiningRoom}
            />

            <div className="stamp-section">
              <StampPicker
                customStamps={customStamps}
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

      <AppFooter />
      {toast && <StatusToast message={toast.message} onReconnect={reconnect} />}
      <CustomStampManager
        isOpen={isStampManagerOpen}
        onClose={() => setStampManagerOpen(false)}
        customStamps={customStamps}
        uploading={uploading}
        onDeleteStamp={deleteStamp}
        onUploadStamp={uploadStamp}
      />
    </div>
  );
}

function App() {
  if (window.location.pathname === '/auth/extension') {
    return (
      <div className="app">
        <header className="app-header">
          <div className="app-header-inner">
            <span className="app-title">
              <img className="comet-icon" src={cometIconUrl} alt="Comet Icon" />
              Comet
            </span>
          </div>
        </header>
        <ExtensionAuthPage />
        <AppFooter />
      </div>
    );
  }
  if (!window.location.pathname.startsWith('/history')) return <LiveApp />;
  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header-inner">
          <a className="app-title" href="/">
            <img className="comet-icon" src={cometIconUrl} alt="Comet Icon" />
            Comet
          </a>
        </div>
      </header>
      <HistoryPage />
      <AppFooter />
    </div>
  );
}

export default App;
