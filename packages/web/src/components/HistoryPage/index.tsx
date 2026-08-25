import { useCallback, useEffect, useState } from 'react';
import type {
  HistoryBucket,
  HistoryPeak,
  RoomEvent,
  RoomHistoryDetail,
  RoomHistorySummary,
  Stamp,
} from '@comet/shared';
import {
  getAllRoomEvents,
  getHistoryRooms,
  getRoomEvents,
  getRoomHistory,
} from '../../history-api';
import { SectionBase } from '../common';
import './style.scss';

const dateTime = (value: number) =>
  new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).format(value);

const dateOnly = (value: number) =>
  new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(value);

const dateMinute = (value: number) =>
  new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(value);

const eventDate = (from: number, to: number) => {
  const start = dateOnly(from);
  const end = dateOnly(to);
  return start === end ? start : `${start} 〜 ${end}`;
};

const durationText = (durationMs: number) => {
  const minutes = Math.max(0, Math.round(durationMs / 60_000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}時間${rest ? `${rest}分` : ''}` : `${rest}分`;
};

function HistoryStamp({ stamp, compact = false }: { stamp: Stamp; compact?: boolean }) {
  const [imageUnavailable, setImageUnavailable] = useState(
    stamp.category === 'custom' && !stamp.imageUrl
  );

  if (stamp.category === 'custom' && imageUnavailable) {
    return <span className="history-stamp deleted">削除済みスタンプ</span>;
  }

  return (
    <span className={`history-stamp ${compact ? 'compact' : ''}`}>
      {stamp.category === 'custom' && (
        <img
          src={stamp.imageUrl}
          alt=""
          onError={() => setImageUnavailable(true)}
        />
      )}
      <span>{stamp.name}</span>
    </span>
  );
}

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

const csvCell = (value: unknown) => {
  let text = String(value ?? '');
  if (/^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

function exportName(roomName: string, extension: string) {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `comet-${roomName.replace(/[\\/:*?"<>|]/g, '_')}-${day}.${extension}`;
}

function HistoryChart({
  detail,
  onSelect,
}: {
  detail: RoomHistoryDetail;
  onSelect: (bucket: HistoryBucket) => void;
}) {
  const [hovered, setHovered] = useState<HistoryBucket | null>(null);
  const width = 900;
  const height = 260;
  const left = 44;
  const bottom = 28;
  const chartWidth = width - left - 12;
  const chartHeight = height - bottom - 12;
  const max = Math.max(1, ...detail.buckets.map((bucket) => bucket.totalCount));
  const barWidth = chartWidth / Math.max(detail.buckets.length, 1);
  const capturedPeaks = (detail.peaks ?? []).filter((peak) => peak.capture);
  const hoveredCapture = hovered
    ? capturedPeaks.find((peak) => peak.start >= hovered.start && peak.start < hovered.end)?.capture
    : undefined;

  const pickBucket = (event: React.PointerEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * width;
    const index = Math.max(0, Math.min(detail.buckets.length - 1, Math.floor((x - left) / barWidth)));
    setHovered(detail.buckets[index] ?? null);
  };

  return (
    <div className="history-chart-wrap">
      <svg
        className="history-chart"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="時間帯ごとのコメントとスタンプ数"
        onPointerMove={pickBucket}
        onPointerLeave={() => setHovered(null)}
        onClick={() => hovered && onSelect(hovered)}
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = 12 + chartHeight * ratio;
          return <line key={ratio} x1={left} x2={width - 12} y1={y} y2={y} className="chart-grid" />;
        })}
        <text x={left - 8} y={17} textAnchor="end">{max}</text>
        <text x={left - 8} y={chartHeight + 16} textAnchor="end">0</text>
        {detail.buckets.map((bucket, index) => {
          const commentHeight = (bucket.commentCount / max) * chartHeight;
          const stampHeight = (bucket.stampCount / max) * chartHeight;
          const x = left + index * barWidth + 1;
          return (
            <g key={bucket.start}>
              <rect x={x} y={12 + chartHeight - commentHeight} width={Math.max(1, barWidth - 2)} height={commentHeight} className="chart-comment" />
              <rect x={x} y={12 + chartHeight - commentHeight - stampHeight} width={Math.max(1, barWidth - 2)} height={stampHeight} className="chart-stamp" />
            </g>
          );
        })}
        {capturedPeaks.map((peak) => {
          const x = left + ((peak.start - detail.from) / Math.max(1, detail.to - detail.from)) * chartWidth;
          return (
            <g className="chart-capture-marker" key={`capture-${peak.start}`} transform={`translate(${x} 22)`}>
              <circle r="6" />
              <text textAnchor="middle" dominantBaseline="central" aria-hidden="true">●</text>
              <title>{`${dateTime(peak.capture!.capturedAt)}の配信画面あり`}</title>
            </g>
          );
        })}
        <text x={left} y={height - 4}>{dateTime(detail.from)}</text>
        <text x={width - 12} y={height - 4} textAnchor="end">{dateTime(detail.to)}</text>
      </svg>
      {hovered && (
        <div className="history-tooltip">
          <strong>{dateTime(hovered.start)}〜</strong>
          {hoveredCapture && <img className="history-tooltip-capture" src={hoveredCapture.imageUrl} alt={`${dateTime(hoveredCapture.capturedAt)}の配信画面`} />}
          <span>合計 {hovered.totalCount}件（コメント {hovered.commentCount} / スタンプ {hovered.stampCount}）</span>
          {hovered.popularStamps.length > 0 && <span className="tooltip-popular"><span>人気:</span> {hovered.popularStamps.map((item) => <span className="tooltip-stamp" key={item.stamp.id || item.stamp.name}><HistoryStamp stamp={item.stamp} compact /><b>×{item.count}</b></span>)}</span>}
          {hovered.sampleComments.map((comment) => <span key={comment.id} className="tooltip-comment">「{comment.content}」</span>)}
          <small>クリックしてこの時間帯の全投稿を表示</small>
        </div>
      )}
      <div className="chart-legend"><span className="legend-comment">コメント</span><span className="legend-stamp">スタンプ</span>{capturedPeaks.length > 0 && <span className="legend-capture">配信画面あり</span>}</div>
    </div>
  );
}

function EventList({ roomId, bucket }: { roomId: string; bucket: HistoryBucket }) {
  const [events, setEvents] = useState<RoomEvent[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (next?: string) => {
    setLoading(true);
    try {
      const page = await getRoomEvents(roomId, bucket.start, Math.max(bucket.start, bucket.end - 1), next);
      setEvents((current) => next ? [...current, ...page.events] : page.events);
      setCursor(page.cursor);
    } finally { setLoading(false); }
  }, [roomId, bucket.start, bucket.end]);
  useEffect(() => { void load(); }, [load]);
  const grouped = [...events.reduce((groups, event) => {
    const key = event.type === 'comment'
      ? `comment:${event.comment.content}`
      : `stamp:${event.stamp.stamp.id || event.stamp.stamp.name}`;
    const current = groups.get(key);
    if (current) current.count += 1;
    else groups.set(key, { event, count: 1 });
    return groups;
  }, new Map<string, { event: RoomEvent; count: number }>()).values()];
  return (
    <SectionBase title={`${dateMinute(bucket.start)} 周辺の投稿`} className="history-events">
      {events.length === 0 && !loading && <p className="history-empty">この時間帯に投稿はありません。</p>}
      {grouped.map(({ event, count }) => event.type === 'comment' ? (
        <div className="history-event" key={`comment-${event.comment.content}`}>
          <span className="event-kind comment">コメント</span><p><span className="event-content" title={event.comment.content}>{event.comment.content}</span>{count > 1 && <strong className="event-count">× {count}</strong>}</p>
        </div>
      ) : (
        <div className="history-event" key={`stamp-${event.stamp.stamp.id || event.stamp.stamp.name}`}>
          <span className="event-kind stamp">スタンプ</span><p><HistoryStamp stamp={event.stamp.stamp} compact />{count > 1 && <strong className="event-count">× {count}</strong>}</p>
        </div>
      ))}
      {cursor && <button className="history-button secondary" disabled={loading} onClick={() => void load(cursor)}>さらに表示</button>}
      {loading && <p className="history-loading">読み込み中...</p>}
    </SectionBase>
  );
}

function PeakList({ peaks, onSelect }: { peaks: HistoryPeak[]; onSelect: (peak: HistoryPeak) => void }) {
  return (
    <SectionBase title="盛り上がりピーク">
      {peaks.length === 0 ? <p className="history-empty">ピークとして表示できる投稿はまだありません。</p> : (
        <div className="history-peaks">
          {peaks.map((peak, index) => (
            <button className="history-peak-card" key={peak.start} onClick={() => onSelect(peak)}>
              {peak.capture && <img src={peak.capture.imageUrl} alt={`${dateTime(peak.capture.capturedAt)}の配信画面`} />}
              <div className="history-peak-body">
                <div className="history-peak-heading"><strong>#{index + 1}</strong><time>{dateTime(peak.start)}</time><b>{peak.totalCount}件/分</b></div>
                <p>コメント {peak.commentCount}件・スタンプ {peak.stampCount}件</p>
                {peak.popularStamps.length > 0 && <div className="history-peak-stamps">{peak.popularStamps.map((item) => <span key={item.stamp.id || item.stamp.name}><HistoryStamp stamp={item.stamp} compact /><b>×{item.count}</b></span>)}</div>}
                {peak.sampleComments.length > 0 && <p className="history-peak-comment">「{peak.sampleComments.at(-1)?.content}」</p>}
                <small>クリックして周辺の投稿を表示</small>
              </div>
            </button>
          ))}
        </div>
      )}
    </SectionBase>
  );
}

function HistoryDetailView({ roomId }: { roomId: string }) {
  const [detail, setDetail] = useState<RoomHistoryDetail>();
  const [selected, setSelected] = useState<HistoryBucket>();
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const refresh = useCallback(async () => {
    try { setDetail(await getRoomHistory(roomId)); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '履歴の取得に失敗しました'); }
  }, [roomId]);
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    if (detail?.status !== 'active') return;
    const timer = window.setInterval(() => void refresh(), 10_000);
    return () => window.clearInterval(timer);
  }, [detail?.status, refresh]);

  const runExport = async (format: 'csv' | 'json') => {
    if (!detail) return;
    setExporting(true);
    try {
      const events = await getAllRoomEvents(roomId, detail.from, detail.to);
      if (format === 'json') {
        download(exportName(detail.room.name, 'json'), JSON.stringify({ room: detail.room, summary: { commentCount: detail.commentCount, stampCount: detail.stampCount, totalCount: detail.totalCount }, events }, null, 2), 'application/json;charset=utf-8');
      } else {
        const rows = [['timestamp','type','comment','color','size','stamp_id','stamp_name','stamp_category']];
        for (const event of events) rows.push(event.type === 'comment'
          ? [new Date(event.timestamp).toISOString(),'comment',event.comment.content,event.comment.style.color,event.comment.style.size,'','','']
          : [new Date(event.timestamp).toISOString(),'stamp','','','',event.stamp.stamp.id,event.stamp.stamp.name,event.stamp.stamp.category]);
        download(exportName(detail.room.name, 'csv'), `\ufeff${rows.map((row) => row.map(csvCell).join(',')).join('\r\n')}`, 'text/csv;charset=utf-8');
      }
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'エクスポートに失敗しました'); }
    finally { setExporting(false); }
  };

  if (!detail && !error) return <p className="history-page-message">履歴を読み込んでいます...</p>;
  if (!detail) return <p className="history-page-message error">{error}</p>;
  const metrics = detail.metrics ?? {
    durationMs: detail.to - detail.from,
    maxPostsPerMinute: 0,
    peakAt: null,
    topStamp: null,
    commentRatio: detail.totalCount ? detail.commentCount / detail.totalCount : 0,
  };
  return (
    <div className="history-detail">
      <div className="history-heading-row"><div><a className="history-back" href="/history">← 履歴一覧</a><h2>{detail.room.name}</h2><div className="history-title-meta"><time>{eventDate(detail.from, detail.to)}</time><span className={`history-status ${detail.status}`}>{detail.status === 'active' ? '開催中' : '終了済み'}</span></div></div><div className="history-actions"><button className="history-button secondary" disabled={exporting} onClick={() => void runExport('csv')}>CSV出力</button><button className="history-button secondary" disabled={exporting} onClick={() => void runExport('json')}>JSON出力</button></div></div>
      {error && <p className="history-inline-error">{error}</p>}
      <div className="history-summary">
        <div><strong>{detail.totalCount}</strong><span>合計投稿</span></div>
        <div><strong>{durationText(metrics.durationMs)}</strong><span>イベント時間</span></div>
        <div><strong>{metrics.maxPostsPerMinute}</strong><span>最大投稿数/分</span></div>
        <div><strong>{metrics.peakAt ? new Intl.DateTimeFormat('ja-JP', { hour: '2-digit', minute: '2-digit' }).format(metrics.peakAt) : '—'}</strong><span>最大ピーク</span></div>
        <div className="summary-stamp"><strong>{metrics.topStamp ? <HistoryStamp stamp={metrics.topStamp.stamp} compact /> : '—'}</strong><span>最多スタンプ{metrics.topStamp ? ` ×${metrics.topStamp.count}` : ''}</span></div>
        <div><strong>{Math.round(metrics.commentRatio * 100)}%</strong><span>コメント比率</span></div>
      </div>
      <PeakList peaks={detail.peaks ?? []} onSelect={setSelected} />
      <SectionBase title="盛り上がり"><HistoryChart detail={detail} onSelect={setSelected} /></SectionBase>
      {selected && <EventList roomId={roomId} bucket={selected} />}
    </div>
  );
}

function HistoryListView() {
  const [rooms, setRooms] = useState<RoomHistorySummary[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = async (next?: string) => {
    setLoading(true);
    try { const page = await getHistoryRooms(next); setRooms((current) => next ? [...current, ...page.rooms] : page.rooms); setCursor(page.cursor); setError(''); }
    catch (reason) { setError(reason instanceof Error ? reason.message : '履歴一覧の取得に失敗しました'); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  return (
    <div className="history-list"><div className="history-heading-row"><div><h2>Room履歴</h2><p>開催中・終了済みのRoomの盛り上がりを確認できます。</p></div></div>
      {error && <p className="history-inline-error">{error}</p>}
      <div className="history-room-grid">{rooms.map((summary) => <a className="history-room-card" href={`/history/${encodeURIComponent(summary.room.id)}`} key={summary.room.id}><div><h3>{summary.room.name}</h3><span className={`history-status ${summary.status}`}>{summary.status === 'active' ? '開催中' : '終了済み'}</span></div><p>{dateTime(summary.room.createdAt)}〜</p><dl><div><dt>合計</dt><dd>{summary.totalCount}</dd></div><div><dt>コメント</dt><dd>{summary.commentCount}</dd></div><div><dt>スタンプ</dt><dd>{summary.stampCount}</dd></div></dl></a>)}</div>
      {!loading && rooms.length === 0 && <p className="history-page-message">履歴のあるRoomはまだありません。</p>}
      {cursor && <button className="history-button secondary load-more" disabled={loading} onClick={() => void load(cursor)}>さらに表示</button>}
      {loading && <p className="history-page-message">読み込み中...</p>}
    </div>
  );
}

export function HistoryPage() {
  const match = window.location.pathname.match(/^\/history\/([^/]+)\/?$/);
  return <main className="history-page">{match ? <HistoryDetailView roomId={decodeURIComponent(match[1])} /> : <HistoryListView />}</main>;
}
