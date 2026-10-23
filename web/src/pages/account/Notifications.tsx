import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BellRing, AlertTriangle } from 'lucide-react';
import { useAct, useApi } from '@/lib/hooks';
import { api } from '@/lib/api';
import { Button, Card, Empty, ErrorState, Notice, PageHeader, Pagination, Skeleton } from '@/components/ui';
import { ago } from '@/lib/format';

export default function Notifications() {
  const [page, setPage] = useState(1); const [unread, setUnread] = useState(false); const nav = useNavigate(); const { act } = useAct();
  const { data, isLoading, error, refetch } = useApi('/notifications', { page, limit: 20, unread: unread ? 'true' : undefined }, { keepPrevious: true });
  const open = async (n: any) => { if (!n.readAt) await api.post(`/notifications/${n._id}/read`).catch(() => {}); if (n.link) nav(n.link); else refetch(); };
  return <><PageHeader title="Notifications" subtitle={`${data?.unreadCount ?? 0} unread`} actions={<><Button variant="secondary" onClick={() => { setUnread(!unread); setPage(1); }}>{unread ? 'Show all' : 'Unread only'}</Button><Button variant="secondary" disabled={!data?.unreadCount} onClick={() => act(() => api.post('/notifications/read-all'), 'All marked as read')}>Mark all read</Button></>} />
    <Notice>Notifications are in-app only. Email and push delivery are not configured.</Notice><div className="mt-4" />
    {error ? <Card><ErrorState error={error} onRetry={refetch} /></Card> : isLoading ? <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16" />)}</div>
      : !data?.data?.length ? <Card><Empty icon={<BellRing className="h-5 w-5" />} title="You're all caught up" hint="Updates about viewings, applications, rent and maintenance will appear here." /></Card>
      : <Card className="divide-y divide-line overflow-hidden">{data.data.map((n: any) => <button key={n._id} onClick={() => open(n)} className={`flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-bg ${n.readAt ? '' : 'bg-emerald-soft/40'}`}>
        {n.priority === 'emergency' ? <AlertTriangle className="mt-0.5 h-4 w-4 text-danger-text" aria-label="Emergency" /> : <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.readAt ? 'bg-transparent' : 'bg-emerald'}`} aria-label={n.readAt ? 'Read' : 'Unread'} />}
        <div className="min-w-0 flex-1"><p className={`text-sm ${n.readAt ? '' : 'font-semibold'} text-navy`}>{n.title}</p>{n.body && <p className="truncate text-sm text-muted">{n.body}</p>}</div><span className="shrink-0 text-xs text-muted">{ago(n.createdAt)}</span></button>)}<Pagination meta={data.meta} onPage={setPage} /></Card>}</>;
}
