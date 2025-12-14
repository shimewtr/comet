import './style.scss';

interface ConnectionStatusProps {
  isConnected: boolean;
  error: string | null;
  onReconnect?: () => void;
}

export function ConnectionStatus({ isConnected, error, onReconnect }: ConnectionStatusProps) {
  return (
    <div className={`connection-status ${isConnected ? 'connected' : 'disconnected'}`}>
      <div className="status-indicator">
        <span className="status-dot"></span>
        <span className="status-text">
          {isConnected ? '接続中' : '切断'}
        </span>
      </div>

      {error && (
        <div className="error-message">
          <span>{error}</span>
          {onReconnect && (
            <button onClick={onReconnect} className="reconnect-button">
              再接続
            </button>
          )}
        </div>
      )}
    </div>
  );
}
