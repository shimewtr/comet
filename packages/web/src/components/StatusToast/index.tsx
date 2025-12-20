import { useState } from 'react';
import './style.scss';

export interface StatusToastProps {
  message: string;
  onReconnect: () => void;
}

export function StatusToast({ message, onReconnect }: StatusToastProps) {
  const [isReconnecting, setIsReconnecting] = useState(false);

  const handleReconnect = () => {
    setIsReconnecting(true);
    onReconnect();
    // 一定時間後にローディング状態を解除（接続成功時はトーストごと消えるので問題ない）
    setTimeout(() => {
      setIsReconnecting(false);
    }, 3000);
  };

  return (
    <div className="status-toast">
      <div className="status-toast-content">
        <span className="status-toast-message">{message}</span>
        <button
          className="status-toast-reconnect"
          onClick={handleReconnect}
          disabled={isReconnecting}
        >
          {isReconnecting ? '再接続中...' : '再接続'}
        </button>
      </div>
    </div>
  );
}
