import { useEffect, useState, useRef } from 'react';
import { getTicketDetail, type TicketDetail } from '../api';
import { useDevRequester } from '../devRequesterContext';
import AttachmentSection from './AttachmentSection';
import '../styles/ticket-detail.css';

const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  OPEN: 'Open',
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  RESOLVED: 'Resolved',
};

function PriBadge({ priority }: { priority: string }) {
  const cls =
    priority === 'CRITICAL' ? 'td-b-critical' :
    priority === 'HIGH' ? 'td-b-high' :
    priority === 'MEDIUM' ? 'td-b-medium' : 'td-b-low';
  const label = priority.charAt(0) + priority.slice(1).toLowerCase();
  return <span className={`td-badge ${cls}`}>{priority === 'CRITICAL' ? '! ' : ''}{label}</span>;
}

function StatusBadge({ status }: { status: string }) {
  return <span className="td-badge td-b-status">{STATUS_LABEL[status] ?? status}</span>;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function TicketDetailPage({ ticketNumber, onBack }: { ticketNumber: string; onBack?: () => void }) {
  const { activeRequester } = useDevRequester();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'comments' | 'attachments' | 'actions' | 'log'>('attachments');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  async function load() {
    if (!activeRequester) return;
    setStatus('loading');
    try {
      const t = await getTicketDetail(ticketNumber, activeRequester.id);
      setTicket(t);
      setStatus('ready');
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setError(err?.body?.error || err?.message || 'Failed to load');
      setStatus('error');
    }
  }

  useEffect(() => { void load(); }, [ticketNumber, activeRequester?.id]);

  function onTabKeyDown(e: React.KeyboardEvent) {
    const order: Array<'comments' | 'attachments' | 'actions' | 'log'> = ['comments', 'attachments', 'actions', 'log'];
    const idx = order.indexOf(activeTab);
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const next = order[(idx + 1) % order.length];
      setActiveTab(next);
      tabRefs.current[next]?.focus();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const prev = order[(idx - 1 + order.length) % order.length];
      setActiveTab(prev);
      tabRefs.current[prev]?.focus();
    }
  }

  if (status === 'loading') return <main className="mt-page td-page"><div className="tt-skeleton" /><p aria-busy="true">Loading…</p></main>;
  if (status === 'error') return <main className="mt-page td-page"><div role="alert">{error}</div><button onClick={load}>Retry</button></main>;
  if (!ticket) return null;

  const attCount = ticket.attachments?.length ?? 0;

  return (
    <main className="mt-page td-page">
      <div className="td-crumbrow">
        <span className="td-crumbs">My Tickets&nbsp;&nbsp;/&nbsp;&nbsp;<b className="mono">{ticketNumber}</b></span>
        <button className="tok-btn secondary" onClick={() => onBack?.()}>← Back to My Tickets</button>
      </div>

      <section className="td-card">
        <div className="td-grid">
          <div className="td-field"><label>Ticket No.</label><div className="td-ro mono">{ticket.ticketNumber}</div></div>
          <div className="td-field"><label>Ticket Date</label><div className="td-ro">{fmtDate(ticket.createdAt)}</div></div>
          <div className="td-field"><label>Category</label><div className="td-ro">{ticket.category?.name ?? ''}</div></div>
          <div className="td-field"><label>Related System</label><div className="td-ro">{ticket.relatedSystem?.name ?? 'None'}</div></div>

          <div className="td-field"><label>Requester</label><div className="td-ro">{ticket.requester?.name ?? ''}</div></div>
          <div className="td-field"><label>Requested Priority</label><div className="td-ro">{ticket.priority ? <PriBadge priority={ticket.priority} /> : <span className="td-muted">Unset</span>}</div></div>
          <div className="td-field"><label>IT Priority</label><div className="td-ro">{ticket.itPriority ? <PriBadge priority={ticket.itPriority} /> : <span className="td-muted">Unset</span>}</div></div>
          <div className="td-field"><label>Current Status</label><div className="td-ro"><StatusBadge status={ticket.status} /></div></div>

          <div className="td-field"><label>Ticket Owner</label><div className="td-ro">{ticket.ownerName ?? <span className="td-muted">Unassigned</span>}</div></div>
          <div className="td-field td-span3"><label>Summary</label><div className="td-ro">{ticket.title}</div></div>

          <div className="td-field td-span4"><label>Description</label>
            <div className="td-ro warm tok-desc-warm" data-warm>{ticket.description ? String(ticket.description) : <span className="td-muted">No description provided</span>}</div>
          </div>
          <div className="td-field td-span4"><label>Resolution Summary</label>
            <div className="td-ro td-muted">No resolution summary available yet.</div>
          </div>
        </div>
      </section>

      <div className="td-tabs" role="tablist" onKeyDown={onTabKeyDown}>
        <button ref={el => { tabRefs.current['comments'] = el; }} className={`td-tab ${activeTab === 'comments' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'comments'} data-p="comments" onClick={() => setActiveTab('comments')}>💬 Public Comments <span className="count">3</span></button>
        <button ref={el => { tabRefs.current['attachments'] = el; }} className={`td-tab ${activeTab === 'attachments' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'attachments'} data-p="attachments" onClick={() => setActiveTab('attachments')}>📎 Attachments <span className="count">{attCount}</span></button>
        <button ref={el => { tabRefs.current['actions'] = el; }} className={`td-tab ${activeTab === 'actions' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'actions'} data-p="actions" onClick={() => setActiveTab('actions')}>🛠 Service Actions <span className="count">1</span></button>
        <button ref={el => { tabRefs.current['log'] = el; }} className={`td-tab ${activeTab === 'log' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'log'} data-p="log" onClick={() => setActiveTab('log')}>🕒 Event Log <span className="count">6</span></button>
      </div>

      <section id="comments" className={`td-panel ${activeTab === 'comments' ? 'active' : ''}`}>
        <div className="td-composer">
          <input placeholder="Type your comment here…" aria-label="Add comment" />
          <button className="tok-btn primary" disabled>➤ Post Comment</button>
        </div>
        <p className="td-caption" style={{ marginBottom: 12 }}>UI preview only — commenting arrives in a later lab.</p>
        <div className="td-comment"><span className="td-avatar">DA</span><div><div className="td-chead"><span className="name">Dev User Alpha</span><span className="td-badge td-b-status">Requester</span><span className="time">Aug 27, 2026 11:45 AM</span></div><p className="td-ctext">Thank you for the update. Please let me know if you need any additional information.</p></div></div>
        <div className="td-comment"><span className="td-avatar">MB</span><div><div className="td-chead"><span className="name">Michael Brown</span><span className="td-badge td-b-medium">IT Support</span><span className="time">Aug 27, 2026 10:30 AM</span></div><p className="td-ctext">We are investigating the macro policy on your device. We'll update you shortly.</p></div></div>
        <div className="td-comment"><span className="td-avatar">DA</span><div><div className="td-chead"><span className="name">Dev User Alpha</span><span className="td-badge td-b-status">Requester</span><span className="time">Aug 26, 2026 09:20 AM</span></div><p className="td-ctext">Just adding that this issue occurs even when I close all other applications.</p></div></div>
      </section>

      <section id="attachments" className={`td-panel ${activeTab === 'attachments' ? 'active' : ''}`}>
        <AttachmentSection ticketNumber={ticket.ticketNumber} attachments={ticket.attachments ?? []} onChanged={load} />
      </section>

      <section id="actions" className={`td-panel ${activeTab === 'actions' ? 'active' : ''}`}>
        <p className="td-caption" style={{ marginBottom: 8 }}>Read-only preview — service actions arrive in a later lab.</p>
        <div className="td-action"><span>🛠</span><div><b>Macro security scan run; policy settings reset.</b><div className="td-muted" style={{ fontSize: '.8rem' }}>Michael Brown · Aug 27, 2026 10:15 AM</div></div></div>
      </section>

      <section id="log" className={`td-panel ${activeTab === 'log' ? 'active' : ''}`}>
        <div className="td-event"><span className="td-dot"></span>Ticket created by {ticket.requester?.name ?? 'Dev User Alpha'}<span className="time">{fmtDate(ticket.createdAt)}</span></div>
        <div className="td-event"><span className="td-dot"></span>Ticket Owner set to {ticket.ownerName ?? ticket.requester?.name}<span className="time">{fmtDate(ticket.createdAt)}</span></div>
        <div className="td-event"><span className="td-dot"></span>Requested Priority set to {ticket.priority}<span className="time">{fmtDate(ticket.createdAt)}</span></div>
        <div className="td-event"><span className="td-dot"></span>Status changed New → Open<span className="time">Aug 26, 2026 08:00 AM</span></div>
        <div className="td-event"><span className="td-dot"></span>Status changed Open → In Progress<span className="time">Aug 26, 2026 09:10 AM</span></div>
        <div className="td-event"><span className="td-dot"></span>Attachment added: {attCount > 0 ? 'macros-error.png' : 'none'}<span className="time">Aug 26, 2026 12:40 AM</span></div>
      </section>
    </main>
  );
}
