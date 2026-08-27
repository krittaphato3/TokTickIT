import { useEffect, useState } from 'react';
import { getTicketDetail, type TicketDetail } from '../api';
import { useDevRequester } from '../devRequesterContext';
import AttachmentSection from './AttachmentSection';

export default function TicketDetailPage({ ticketNumber, onBack }: { ticketNumber: string; onBack?: ()=>void }) {
  const { activeRequester } = useDevRequester();
  const [ticket, setTicket] = useState<TicketDetail|null>(null);
  const [status, setStatus] = useState<'loading'|'ready'|'error'>('loading');
  const [error, setError] = useState<string>('');

  async function load() {
    if (!activeRequester) return;
    setStatus('loading');
    try {
      const t = await getTicketDetail(ticketNumber, activeRequester.id);
      setTicket(t);
      setStatus('ready');
    } catch (e:any) {
      setError(e?.body?.error || e?.message || 'Failed to load');
      setStatus('error');
    }
  }

  useEffect(()=>{ void load(); }, [ticketNumber, activeRequester?.id]);

  if (status==='loading') return <main className="tok-main"><div className="tt-skeleton"/><p aria-busy="true">Loading…</p></main>;
  if (status==='error') return <main className="tok-main"><div role="alert">{error}</div><button onClick={load}>Retry</button><p>Testing only — not real authentication</p></main>;
  if (!ticket) return null;

  return (
    <main className="tok-main">
      <nav className="tok-breadcrumb" aria-label="Breadcrumb"><a href="#/tickets">My Tickets</a><span className="sep">/</span><span className="current">{ticketNumber}</span></nav>
      <div style={{display:'flex', gap:'0.5rem', alignItems:'center'}}>
        <span className="tt-ticket-number" style={{fontFamily:'monospace'}}>{ticketNumber}</span>
        <span className="mt-badge badge-new">{ticket.status==='NEW'?'New':ticket.status}</span>
        <span className="mt-badge pri-medium">{ticket.priority}</span>
      </div>
      <h1 className="tok-page-title">{ticket.title}</h1>
      <dl>
        <dt>Category</dt><dd>{ticket.category?.name ?? ''}</dd>
        <dt>Priority</dt><dd>{ticket.priority}</dd>
        <dt>Status</dt><dd>{ticket.status}</dd>
        <dt>Created</dt><dd>{ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : ''}</dd>
        <dt>Updated</dt><dd>{ticket.updatedAt ? new Date(ticket.updatedAt).toLocaleString() : ''}</dd>
        <dt>Requested by</dt><dd>{ticket.requester?.name ?? ''}</dd>
        <dt>Related System</dt><dd>{ticket.relatedSystem?.name ?? 'None'}</dd>
      </dl>
      <div className="tok-desc-warm" data-warm style={{background:'#FAF6EF', border:'1px solid #D9E2DD', padding:'1rem'}}>
        {ticket.description ? String(ticket.description) : <span style={{color:'#5C6B64'}}>No description provided</span>}
      </div>
      <p>Testing only — not real authentication</p>
      <AttachmentSection ticketNumber={ticket.ticketNumber} attachments={ticket.attachments ?? []} onChanged={load} />
      <a href="#/tickets" onClick={e=>{e.preventDefault(); onBack?.();}}>Back to My Tickets</a>
    </main>
  );
}
