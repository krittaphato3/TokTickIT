import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getTicketDetail,
  getTicketComments,
  createTicketComment,
  ApiError,
  MAX_COMMENT_LENGTH,
  type PublicComment,
  type TicketDetail,
} from '../api';
import { useAuth } from '../auth/AuthContext';
import AttachmentSection from './AttachmentSection';
import '../styles/ticket-detail.css';

// Lab 3 — Ticket Detail (requester surface, ui-spec §5). Lab 2 read-only
// header and Attachments tab are preserved; the Public Comments tab is now a
// live append-only thread (FR-08/BR-14) and the header carries the BR-05
// "Problem appears resolved" signal action. Per ui-spec §5/§7 the Lab 2
// Service Actions tab and Resolution Summary field are removed; the Event Log
// tab is superseded by the Attachment Events ledger inside Attachments.

const STATUS_LABEL: Record<string, string> = {
  NEW: 'New',
  OPEN: 'Open',
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

const ROLE_LABEL: Record<string, string> = {
  REQUESTER: 'Requester',
  IT_STAFF: 'IT Support',
  ADMIN: 'Administrator',
  ADMINISTRATOR: 'Administrator',
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

type PanelStatus = 'loading' | 'ready' | 'error';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function CommentRow({ comment }: { comment: PublicComment }) {
  return (
    <div className={`td-comment${comment.appearsResolved ? ' td-comment-signal' : ''}`} data-appears-resolved={comment.appearsResolved || undefined}>
      <span className="td-avatar" aria-hidden="true">{initialsOf(comment.author.name)}</span>
      <div>
        <div className="td-chead">
          <span className="name">{comment.author.name}</span>
          <span className={`td-badge ${comment.author.role === 'REQUESTER' ? 'td-b-status' : 'td-b-medium'}`}>
            {ROLE_LABEL[comment.author.role] ?? comment.author.role}
          </span>
          {comment.appearsResolved ? <span className="td-signal-chip" title="Requester indicated this problem appears resolved">✓ appears resolved</span> : null}
          <span className="time">{fmtDate(comment.createdAt)}</span>
        </div>
        <p className="td-ctext">{comment.body}</p>
      </div>
    </div>
  );
}

export default function TicketDetailPage({ ticketNumber, onBack }: { ticketNumber: string; onBack?: () => void }) {
  const { user } = useAuth();
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'comments' | 'attachments'>('comments');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // Public Comments state (load / post / feedback).
  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentsStatus, setCommentsStatus] = useState<PanelStatus>('loading');
  const [commentsError, setCommentsError] = useState<string>('');
  const [draft, setDraft] = useState('');
  const [posting, setPosting] = useState(false);
  const [postError, setPostError] = useState('');
  const [justPosted, setJustPosted] = useState(false);

  // Appears-resolved signal state (BR-05). The signal is posted as a flagged
  // public comment, so the modal carries its own editable note (pre-filled
  // with suggested wording when the composer is empty).
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signalNote, setSignalNote] = useState('');
  const [signaling, setSignaling] = useState(false);
  const [signalError, setSignalError] = useState('');
  const [signalDone, setSignalDone] = useState(false);
  const signalNoteTrimmed = signalNote.trim();
  const signalNoteTooLong = signalNoteTrimmed.length > MAX_COMMENT_LENGTH;

  const load = useCallback(async function load() {
    setStatus('loading');
    try {
      const t = await getTicketDetail(ticketNumber);
      setTicket(t);
      setStatus('ready');
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setError(err?.body?.error || err?.message || 'Failed to load');
      setStatus('error');
    }
  }, [ticketNumber]);

  const loadComments = useCallback(async function loadComments() {
    setCommentsStatus((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    setCommentsError('');
    try {
      const list = await getTicketComments(ticketNumber);
      // Tolerate unexpected bodies (unknown extra fields are ignored per the
      // api.ts convention): a non-array response renders as an empty thread.
      setComments(Array.isArray(list) ? list : []);
      setCommentsStatus('ready');
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setCommentsError(err?.body?.error || err?.message || 'Failed to load comments');
      setCommentsStatus('error');
    }
  }, [ticketNumber]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { void loadComments(); }, [loadComments]);

  const hasSignal = (ticket?.appearsResolvedAt ?? null) !== null;
  const signalBlocked = hasSignal || signalDone;
  // Visible only to the ticket's own requester while the ticket is not
  // formally Resolved/Closed/Cancelled (ui-spec §5). Requesters never see
  // staff-only states; staff/admin use their own detail screen (later issue).
  const canSignal =
    user?.role === 'REQUESTER' &&
    !signalBlocked &&
    ticket !== null &&
    !['RESOLVED', 'CLOSED', 'CANCELLED'].includes(ticket.status);

  const trimmedDraft = draft.trim();
  const draftTooLong = trimmedDraft.length > MAX_COMMENT_LENGTH;
  const charsRemaining = MAX_COMMENT_LENGTH - trimmedDraft.length;

  async function postComment() {
    if (posting || trimmedDraft.length === 0 || draftTooLong) return;
    setPosting(true);
    setPostError('');
    try {
      const created = await createTicketComment(ticketNumber, {
        body: trimmedDraft,
      });
      setComments((prev) => [...prev, created]);
      setDraft('');
      setJustPosted(true);
      window.setTimeout(() => setJustPosted(false), 3000);
    } catch (e: unknown) {
      const err = e as ApiError;
      if (err?.status === 404) {
        setPostError('This ticket is no longer available.');
      } else if (err?.status === 403) {
        setPostError('You are not allowed to comment on this ticket.');
      } else {
        setPostError(err?.body?.error || 'Could not post your comment. Please try again.');
      }
    } finally {
      setPosting(false);
    }
  }

  function openSignalModal() {
    setSignalError('');
    setSignalNote(
      trimmedDraft.length > 0
        ? draft
        : 'The problem appears resolved from my side.',
    );
    setConfirmOpen(true);
  }

  async function confirmSignal() {
    if (signaling || signalNoteTrimmed.length === 0 || signalNoteTooLong) return;
    setSignaling(true);
    setSignalError('');
    try {
      const created = await createTicketComment(ticketNumber, {
        body: signalNoteTrimmed,
        appearsResolved: true,
      });
      setComments((prev) => [...prev, created]);
      setDraft('');
      setSignalDone(true);
      setConfirmOpen(false);
    } catch (e: unknown) {
      const err = e as ApiError;
      if (err?.status === 409) {
        setSignalError('This ticket was already marked as appearing resolved.');
      } else if (err?.status === 404) {
        setSignalError('This ticket is no longer available.');
      } else if (err?.status === 403) {
        setSignalError('You are not allowed to update this ticket.');
      } else {
        setSignalError(err?.body?.error || 'Could not record the indication. Please try again.');
      }
    } finally {
      setSignaling(false);
    }
  }

  function onTabKeyDown(e: React.KeyboardEvent) {
    const order: Array<'comments' | 'attachments'> = ['comments', 'attachments'];
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

  const signalBanner = useMemo(() => {
    const at = ticket?.appearsResolvedAt;
    return at ? (
      <div className="td-signal-banner" role="status" data-testid="appears-resolved-banner">
        <span aria-hidden="true">✓</span>
        <span>
          You marked this problem as appearing resolved{at ? ` on ${fmtDate(at)}` : ''}. IT staff will review and formally resolve it.
        </span>
      </div>
    ) : null;
  }, [ticket?.appearsResolvedAt]);

  if (status === 'loading') return <main className="mt-page td-page"><div className="tt-skeleton" /><p aria-busy="true">Loading…</p></main>;
  if (status === 'error') return <main className="mt-page td-page"><div role="alert">{error}</div><button onClick={load}>Retry</button></main>;
  if (!ticket) return null;

  const attCount = ticket.attachments?.filter((a) => !a.removedAt).length ?? 0;

  return (
    <main className="mt-page td-page">
      <div className="td-crumbrow">
        <span className="td-crumbs"><a href="#/tickets" onClick={(e) => { e.preventDefault(); onBack?.(); }}>My Tickets</a>&nbsp;&nbsp;/&nbsp;&nbsp;<b className="mono">{ticketNumber}</b></span>
        <button className="tok-btn secondary" onClick={() => onBack?.()}>← Back to My Tickets</button>
      </div>

      <section className="td-card">
        {signalBanner}
        <div className="td-grid">
          <div className="td-field"><label>Ticket No.</label><div className="td-ro mono">{ticket.ticketNumber}</div></div>
          <div className="td-field"><label>Ticket Date</label><div className="td-ro">{fmtDate(ticket.createdAt)}</div></div>
          <div className="td-field"><label>Category</label><div className="td-ro">{ticket.category?.name ?? ''}</div></div>
          <div className="td-field"><label>Related System</label><div className="td-ro">{ticket.relatedSystem?.name ?? 'None'}</div></div>

          <div className="td-field"><label>Requester</label><div className="td-ro">{ticket.requester?.name ?? ''}</div></div>
          <div className="td-field"><label>Requested Priority</label><div className="td-ro">{ticket.priority ? <PriBadge priority={ticket.priority} /> : <span className="td-muted">Unset</span>}</div></div>
          <div className="td-field"><label>IT Priority</label><div className="td-ro">{ticket.itPriority ? <PriBadge priority={ticket.itPriority} /> : <span className="td-muted">Unset</span>}</div></div>
          <div className="td-field"><label>Current Status</label><div className="td-ro"><StatusBadge status={ticket.status} /></div></div>

          <div className="td-field"><label>Ticket Owner</label><div className="td-ro">{(ticket.owner?.name ?? ticket.ownerName) ? (ticket.owner?.name ?? ticket.ownerName) : <span className="td-muted">Unassigned</span>}</div></div>
          <div className="td-field td-span3"><label>Summary</label><div className="td-ro">{ticket.title}</div></div>

          <div className="td-field td-span4"><label>Description</label>
            <div className="td-ro warm tok-desc-warm" data-warm>{ticket.description ? String(ticket.description) : <span className="td-muted">No description provided</span>}</div>
          </div>
        </div>

        {canSignal ? (
          <div className="td-signal-row">
            <button
              type="button"
              className="tok-btn secondary"
              disabled={signaling}
              onClick={openSignalModal}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" /></svg>
              Problem appears resolved
            </button>
          </div>
        ) : null}
        {signalBlocked && user?.role === 'REQUESTER' ? (
          <p className="td-caption td-signal-caption">Marked as appearing resolved ✓</p>
        ) : null}
      </section>

      <div className="td-tabs" role="tablist" onKeyDown={onTabKeyDown}>
        <button ref={el => { tabRefs.current['comments'] = el; }} className={`td-tab ${activeTab === 'comments' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'comments'} data-p="comments" onClick={() => setActiveTab('comments')}>💬 Public Comments <span className="count">{comments.length}</span></button>
        <button ref={el => { tabRefs.current['attachments'] = el; }} className={`td-tab ${activeTab === 'attachments' ? 'active' : ''}`} role="tab" aria-selected={activeTab === 'attachments'} data-p="attachments" onClick={() => setActiveTab('attachments')}>📎 Attachments <span className="count">{attCount}</span></button>
      </div>

      <section id="comments" className={`td-panel ${activeTab === 'comments' ? 'active' : ''}`} aria-label="Public Comments">
        {justPosted ? (
          <div className="td-post-ok" role="status">Comment posted.</div>
        ) : null}
        {commentsStatus === 'loading' && <div className="tt-skeleton" role="status" aria-label="Loading comments" />}
        {commentsStatus === 'error' && (
          <div className="td-thread-error" role="alert">
            <span>{commentsError}</span>
            <button type="button" className="tok-btn secondary" onClick={() => void loadComments()}>Try again</button>
          </div>
        )}
        {commentsStatus === 'ready' && comments.length === 0 && (
          <p className="td-caption" style={{ marginBottom: 12 }}>No public comments yet. Start the conversation below.</p>
        )}
        {commentsStatus === 'ready' && comments.map((c) => <CommentRow key={c.id} comment={c} />)}

        <div className="td-composer">
          <textarea
            className="td-composer-input"
            placeholder="Type your comment here…"
            aria-label="Add a public comment"
            value={draft}
            maxLength={MAX_COMMENT_LENGTH + 100}
            disabled={posting}
            onChange={(e) => { setDraft(e.target.value); setPostError(''); }}
          />
        </div>
        <div className="td-composer-meta">
          <span className="td-caption">Visible to IT staff. Do not include secrets.</span>
          <span className={`td-caption${draftTooLong ? ' td-limit-hit' : ''}`} aria-live="polite">
            {charsRemaining.toLocaleString('en-US')} characters remaining
          </span>
        </div>
        {postError ? <p className="td-post-error" role="alert">{postError}</p> : null}
        {draftTooLong ? <p className="td-post-error" role="alert">Keep this entry under 2000 characters.</p> : null}
        <button
          type="button"
          className="tok-btn primary td-post-btn"
          disabled={posting || trimmedDraft.length === 0 || draftTooLong}
          aria-busy={posting}
          onClick={() => void postComment()}
        >
          {posting ? 'Posting…' : '➤ Post Comment'}
        </button>
      </section>

      <section id="attachments" className={`td-panel ${activeTab === 'attachments' ? 'active' : ''}`}>
        <AttachmentSection ticketNumber={ticket.ticketNumber} attachments={ticket.attachments ?? []} onChanged={load} />
      </section>

      {confirmOpen ? (
        <div className="td-modal-backdrop" role="presentation" onClick={() => { if (!signaling) setConfirmOpen(false); }}>
          <div className="td-modal" role="dialog" aria-modal="true" aria-labelledby="td-modal-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="td-modal-title" className="h6">Mark this ticket as appearing resolved?</h2>
            <p className="td-hint">IT staff will review and formally resolve it. This does not change the ticket status.</p>
            <textarea
              className="td-composer-input"
              aria-label="Message about the problem appearing resolved"
              value={signalNote}
              maxLength={MAX_COMMENT_LENGTH + 100}
              disabled={signaling}
              onChange={(e) => { setSignalNote(e.target.value); setSignalError(''); }}
            />
            {signalError ? <p className="td-post-error" role="alert">{signalError}</p> : null}
            <div className="td-modal-actions">
              <button
                type="button"
                className="tok-btn primary"
                disabled={signaling || signalNoteTrimmed.length === 0 || signalNoteTooLong}
                aria-busy={signaling}
                onClick={() => void confirmSignal()}
              >
                {signaling ? 'Recording…' : 'Confirm'}
              </button>
              <button type="button" className="tok-btn secondary" disabled={signaling} onClick={() => setConfirmOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
