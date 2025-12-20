import { useRef, useState, useEffect } from 'react';
import { CommentForm } from './components/CommentForm';
import { CommentHistory } from './components/CommentHistory';
import { StatusToast } from './components/StatusToast';
import { StampPicker, type StampPickerRef } from './components/StampPicker';
import { useWebSocket } from './hooks/useWebSocket';
import type { CommentStyle, Stamp } from '@comet/shared';
import './App.scss';

function App() {
  const {
    isConnected,
    error,
    commentHistory,
    sendComment,
    sendStamp,
    reconnect,
  } = useWebSocket();
  const stampPickerRef = useRef<StampPickerRef>(null);
  const [toast, setToast] = useState<{ message: string } | null>(null);
  const prevConnectedRef = useRef<boolean>(isConnected);

  useEffect(() => {
    const wasConnected = prevConnectedRef.current;

    if (!isConnected && wasConnected) {
      setToast({ message: '接続が切断されました' });
    } else if (isConnected && !wasConnected && toast) {
      setToast(null);
    }

    prevConnectedRef.current = isConnected;
  }, [isConnected, toast]);

  useEffect(() => {
    if (error) {
      setToast({ message: error });
    }
  }, [error]);

  const handleCommentSubmit = (content: string, style: CommentStyle) => {
    const success = sendComment({ content, style });
    if (!success) {
      console.error('Failed to send comment');
    }
  };

  const handleStampSelect = (stamp: Stamp) => {
    const success = sendStamp(stamp);
    if (!success) {
      console.error('Failed to send stamp');
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
        <div className="app-content-main">
          <main className="app-main">
            <CommentForm
              onSubmit={handleCommentSubmit}
              disabled={!isConnected}
            />

            <div className="stamp-section">
              <StampPicker
                ref={stampPickerRef}
                onSelectStamp={handleStampSelect}
                disabled={!isConnected}
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

export default App;
