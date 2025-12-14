import { useState } from 'react';
import type { Comment } from '@comet/shared';
import { SectionBase } from '../common/SectionBase';
import { CopyIcon, CheckIcon } from '../../assets/icons';
import './style.scss';

interface CommentHistoryProps {
  comments: Comment[];
}

export function CommentHistory({ comments }: CommentHistoryProps) {
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopy = async (comment: Comment) => {
    try {
      await navigator.clipboard.writeText(comment.content);
      setCopiedId(comment.id);
      setTimeout(() => setCopiedId(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <SectionBase
      title={
        <div className="comment-history-title">
          <span>コメント履歴</span>
          <span className="comment-count">{comments.length}件</span>
        </div>
      }
      className="comment-history"
    >
      <div className="comment-history-list">
        {comments.length > 0 ? (
          comments.map((comment) => (
            <div key={comment.id} className="comment-history-item">
              <button
                className="copy-button"
                onClick={() => handleCopy(comment)}
                title="コピー"
              >
                {copiedId === comment.id ? (
                  <CheckIcon className="icon" />
                ) : (
                  <CopyIcon className="icon" />
                )}
              </button>
              <div className="comment-text">{comment.content}</div>
              <div className="comment-time">
                {new Date(comment.timestamp).toLocaleTimeString('ja-JP', {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
            </div>
          ))
        ) : (
          <div className="comment-history-empty">まだコメントがありません</div>
        )}
      </div>
    </SectionBase>
  );
}
