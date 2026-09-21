import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  MAX_COMMENT_LENGTH,
  changeTicketOwner,
  changeTicketStatus,
  createInternalNote,
  createStaffTicketComment,
  downloadStaffAttachment,
  getInternalNotes,
  getQueueOwners,
  getStaffTicketComments,
  getStaffTicketDetail,
  setItPriority,
  type InternalNote,
  type Priority,
  type PublicComment,
  type QueueOwner,
  type StaffTicketDetail,
  type StaffTicketStatus,
} from '../api';
import { useAuth } from '../auth/AuthContext';
import '../styles/staff-ticket-detail.css';

// Lab 3 §7 — IT Staff Ticket Detail (ui-spec §7, api-spec §6). Read-only
// group (Category, Requester, Summary, Description) + editable Owner,
// IT Priority, Status with Save/Discard; three-tab thread shell (Public
// Comments / Internal Notes / Attachments). Every write the UI offers is
// also enforced server-side (BR-20); an Administrator session renders
// read-only here because the server 403s all staff writes (AD-02).
// Internal Notes are styled amber with a lock + persistent warning banner
// so private content can never be mistaken for a public comment (BR-04).

const STATUS_TEXT: Record<StaffTicketStatus, string> = {
  NEW: 'New',
  OPEN: 'Open',
  IN_PROGRESS: 'In Progress',
  WAITING_FOR_REQUESTER: 'Waiting for Requester',
  RESOLVED: 'Resolved',
  CLOSED: 'Closed',
  REOPENED: 'Reopened',
  CANCELLED: 'Cancelled',
};

const PRIORITY_TEXT: Record<Priority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  CRITICAL: 'Critical',
};

// BR-15 matrix mirrored for the UI: Status select offers only permitted
// targets (disallowed options omitted, not disabled — ui-spec §7.1).
const NEXT_STATUS: Record<StaffTicketStatus, StaffTicketStatus[]> = {
  NEW: ['OPEN', 'CANCELLED'],
  OPEN: ['IN_PROGRESS', 'WAITING_FOR_REQUESTER', 'CANCELLED'],
  IN_PROGRESS: ['WAITING_FOR_REQUESTER', 'RESOLVED', 'CANCELLED'],
  WAITING_FOR_REQUESTER: ['IN_PROGRESS', 'RESOLVED', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['OPEN', 'IN_PROGRESS'],
  CANCELLED: ['REOPENED'],
};

// Transitions that need `confirm: true` server-side (BR-15). Reopen also
// needs a reason comment; the composer appears for those targets.
const CONFIRM_TARGETS: StaffTicketStatus[] = ['RESOLVED', 'CLOSED', 'CANCELLED'];
const REASON_TARGETS: StaffTicketStatus[] = ['REOPENED'];

type LoadState = 'loading' | 'ready' | 'forbidden' | 'notfound' | 'error';

interface OpsDraft {
  owner: string; // '', 'unassigned', or user id string
  itPriority: string; // '' = unset, else LOW/MEDIUM/HIGH/CRITICAL
  status: string; // '' = unchanged (status saves go through their own flow)
}

function errMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const detail = err.body.details?.[0]?.message;
    return detail ?? err.message;
  }
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true,
  });
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function StaffTicketDetail({
  ticketNumber,
  onBack,
}: {
  ticketNumber: string;
  onBack?: () => void;
}) {
  const { user } = useAuth();
  const isItStaff = user?.role === 'IT_STAFF';

  const [ticket, setTicket] = useState<StaffTicketDetail | null>(null);
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [loadError, setLoadError] = useState('');

  const [owners, setOwners] = useState<QueueOwner[]>([]);
  const [draft, setDraft] = useState<OpsDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveBanner, setSaveBanner] = useState<{ kind: 'success' | 'conflict' | 'error'; text: string } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [confirmTarget, setConfirmTarget] = useState<StaffTicketStatus | null>(null);
  const [confirmReason, setConfirmReason] = useState('');
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [confirmError, setConfirmError] = useState('');

  const [activeTab, setActiveTab] = useState<'public' | 'internal' | 'attachments'>('public');
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const [comments, setComments] = useState<PublicComment[]>([]);
  const [commentsState, setCommentsState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [commentDraft, setCommentDraft] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const [commentError, setCommentError] = useState('');

  const [notes, setNotes] = useState<InternalNote[]>([]);
  const [notesState, setNotesState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [noteDraft, setNoteDraft] = useState('');
  const [postingNote, setPostingNote] = useState(false);
  const [noteError, setNoteError] = useState('');

  const load = useCallback(async () => {
    setLoadState((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    try {
      const data = await getStaffTicketDetail(ticketNumber);
      setTicket(data);
      setDraft({
        owner: data.owner ? String(data.owner.id) : 'unassigned',
        itPriority: data.itPriority ?? '',
        status: '',
      });
      setLoadState('ready');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 403) setLoadState('forbidden');
        else if (err.status === 404) setLoadState('notfound');
        else {
          setLoadState('error');
          setLoadError(errMessage(err, 'We could not load this ticket. Please try again.'));
        }
      } else {
        setLoadState('error');
        setLoadError(errMessage(err, 'We could not load this ticket. Please try again.'));
      }
    }
  }, [ticketNumber]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let cancelled = false;
    getQueueOwners()
      .then((list) => { if (!cancelled) setOwners(list); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const loadComments = useCallback(async () => {
    setCommentsState((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    try {
      const list = await getStaffTicketComments(ticketNumber);
      setComments(list);
      setCommentsState('ready');
    } catch {
      setCommentsState('error');
    }
  }, [ticketNumber]);

  const loadNotes = useCallback(async () => {
    setNotesState((prev) => (prev === 'ready' ? 'ready' : 'loading'));
    try {
      const list = await getInternalNotes(ticketNumber);
      setNotes(list);
      setNotesState('ready');
    } catch (err) {
      // A 403/404 here means this session is not permitted notes access —
      // render the error state without retry loops (server-enforced BR-04).
      setNotesState('error');
      void err;
    }
  }, [ticketNumber]);

  useEffect(() => {
    void loadComments();
    void loadNotes();
  }, [loadComments, loadNotes]);

  const onTabKeyDown = (e: React.KeyboardEvent) => {
    const order: Array<keyof typeof tabRefs.current> = ['public', 'internal', 'attachments'];
    const idx = order.indexOf(activeTab);
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      const next = e.key === 'ArrowRight' ? (idx + 1) % order.length : (idx + order.length - 1) % order.length;
      setActiveTab(order[next] as typeof activeTab);
      tabRefs.current[order[next]]?.focus();
    }
  };

  const dirty =
    draft !== null &&
    ticket !== null &&
    (draft.owner !== (ticket.owner ? String(ticket.owner.id) : 'unassigned') ||
      draft.itPriority !== (ticket.itPriority ?? ''));

  const resetDraft = () => {
    if (!ticket) return;
    setDraft({
      owner: ticket.owner ? String(ticket.owner.id) : 'unassigned',
      itPriority: ticket.itPriority ?? '',
      status: '',
    });
    setFieldErrors({});
    setSaveBanner(null);
  };

  // BR-13 copy-on-claim: claiming an unassigned ticket copies the requested
  // priority into IT Priority when unset; the server response reports it.
  const saveOps = async (overrideStatus?: { status: StaffTicketStatus; confirm?: boolean; reason?: string }) => {
    if (!ticket || !draft) return;
    setSaving(true);
    setSaveBanner(null);
    setFieldErrors({});
    try {
      const ownerChanged = draft.owner !== (ticket.owner ? String(ticket.owner.id) : 'unassigned');
      const prioChanged = draft.itPriority !== (ticket.itPriority ?? '');
      if (ownerChanged) {
        const ownerId = draft.owner === 'unassigned' ? null : Number(draft.owner);
        const res = await changeTicketOwner(ticket.ticketNumber, ownerId);
        setTicket((t) => (t ? { ...t, owner: res.owner ? { ...res.owner, role: t.owner?.role ?? 'IT_STAFF', isActive: true } : null, itPriority: res.itPriority, updatedAt: res.updatedAt } : t));
        setDraft((d) => (d ? { ...d, owner: res.owner ? String(res.owner.id) : 'unassigned' } : d));
        setSaveBanner({
          kind: 'success',
          text: res.owner
            ? res.itPriorityCopied
              ? `Ticket assigned to ${res.owner.name}. Requested Priority copied into IT Priority.`
              : `Ticket assigned to ${res.owner.name}.`
            : 'Ticket is now unassigned.',
        });
      } else if (prioChanged) {
        const res = await setItPriority(ticket.ticketNumber, draft.itPriority as Priority);
        setTicket((t) => (t ? { ...t, itPriority: res.itPriority, updatedAt: res.updatedAt } : t));
        setDraft((d) => (d ? { ...d, itPriority: res.itPriority ?? '' } : d));
        setSaveBanner({ kind: 'success', text: 'IT Priority updated.' });
      } else if (overrideStatus) {
        const res = await changeTicketStatus(ticket.ticketNumber, overrideStatus.status, {
          confirm: overrideStatus.confirm,
          reason: overrideStatus.reason,
        });
        setTicket((t) => (t ? { ...t, status: res.status, updatedAt: res.updatedAt } : t));
        setSaveBanner({ kind: 'success', text: `Status changed to ${STATUS_TEXT[res.status]}.` });
      }
      void loadComments();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setSaveBanner({ kind: 'conflict', text: errMessage(err, 'The ticket changed on the server. Reload and try again.') });
      } else if (err instanceof ApiError && err.status === 400) {
        const map: Record<string, string> = {};
        for (const d of err.body.details ?? []) map[d.field] = d.message;
        setFieldErrors(map);
        setSaveBanner({ kind: 'error', text: err.body.error ?? 'Validation failed.' });
      } else if (err instanceof ApiError && err.status === 403) {
        setSaveBanner({ kind: 'error', text: 'You do not have permission to change this ticket.' });
      } else {
        setSaveBanner({ kind: 'error', text: errMessage(err, 'We could not save the ticket. Try again.') });
      }
    } finally {
      setSaving(false);
    }
  };

  const requestStatusChange = (target: StaffTicketStatus) => {
    if (!ticket) return;
    if (REASON_TARGETS.includes(target)) {
      setConfirmTarget(target);
      setConfirmReason('');
      setConfirmError('');
      return;
    }
    if (CONFIRM_TARGETS.includes(target)) {
      setConfirmTarget(target);
      setConfirmReason('');
      setConfirmError('');
      return;
    }
    void saveOps({ status: target });
  };

  const runConfirmedStatus = async () => {
    if (!ticket || !confirmTarget) return;
    setConfirmBusy(true);
    setConfirmError('');
    try {
      const needsReason = REASON_TARGETS.includes(confirmTarget);
      if (needsReason && confirmReason.trim().length === 0) {
        setConfirmError('A reason comment is required to reopen this ticket.');
        setConfirmBusy(false);
        return;
      }
      const res = await changeTicketStatus(ticket.ticketNumber, confirmTarget, {
        confirm: true,
        reason: needsReason ? confirmReason.trim() : undefined,
      });
      setTicket((t) => (t ? { ...t, status: res.status, updatedAt: res.updatedAt } : t));
      setDraft((d) => (d ? { ...d, status: '' } : d));
      setConfirmTarget(null);
      setConfirmReason('');
      setSaveBanner({ kind: 'success', text: `Status changed to ${STATUS_TEXT[res.status]}.` });
      void loadComments();
    } catch (err) {
      setConfirmError(errMessage(err, 'We could not update the status. Try again.'));
    } finally {
      setConfirmBusy(false);
    }
  };

  const postComment = async () => {
    if (!ticket || commentDraft.trim().length === 0) return;
    setPostingComment(true);
    setCommentError('');
    try {
      const created = await createStaffTicketComment(ticket.ticketNumber, commentDraft.trim());
      setComments((prev) => [...prev, created]);
      setCommentDraft('');
      void loadComments();
    } catch (err) {
      setCommentError(errMessage(err, 'We could not post your comment. Try again.'));
    } finally {
      setPostingComment(false);
    }
  };

  const postNote = async () => {
    if (!ticket || noteDraft.trim().length === 0) return;
    setPostingNote(true);
    setNoteError('');
    try {
      const created = await createInternalNote(ticket.ticketNumber, noteDraft.trim());
      setNotes((prev) => [...prev, created]);
      setNoteDraft('');
      void loadNotes();
    } catch (err) {
      setNoteError(errMessage(err, 'We could not post your note. Try again.'));
    } finally {
      setPostingNote(false);
    }
  };

  const download = async (attachmentId: number, fileName: string) => {
    if (!ticket) return;
    try {
      const blob = await downloadStaffAttachment(ticket.ticketNumber, attachmentId);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      window.alert('Download failed. Please try again.');
    }
  };

  const activeAttachments = useMemo(
    () => (ticket?.attachments ?? []).filter((a) => !a.removedAt),
    [ticket],
  );

  const charsLeftComment = MAX_COMMENT_LENGTH - commentDraft.trim().length;

  if (loadState === 'loading') {
    return (
      <main className="std-page" aria-busy="true">
        <div className="tt-skeleton" role="status" aria-label="Loading ticket" />
      </main>
    );
  }

  if (loadState === 'forbidden') {
    return (
      <main className="std-page">
        <div className="std-state" role="alert">
          <span className="std-state-icon" aria-hidden="true">🔒</span>
          <h1>You do not have access to staff ticket operations.</h1>
          <p>Staff ticket detail is restricted to IT Staff.</p>
          <button type="button" className="tok-btn secondary" onClick={() => onBack?.()}>Back to Queue</button>
        </div>
      </main>
    );
  }

  if (loadState === 'notfound') {
    return (
      <main className="std-page">
        <div className="std-state">
          <h1>Ticket not found.</h1>
          <p>The ticket number may be wrong, or the ticket no longer exists.</p>
          <button type="button" className="tok-btn secondary" onClick={() => onBack?.()}>Back to Queue</button>
        </div>
      </main>
    );
  }

  if (loadState === 'error' || ticket === null) {
    return (
      <main className="std-page">
        <div className="std-state" role="alert">
          <h1>We could not load this ticket.</h1>
          <p>{loadError}</p>
          <button type="button" className="tok-btn secondary" onClick={() => void load()}>Try again</button>
        </div>
      </main>
    );
  }

  const statusTargets = NEXT_STATUS[ticket.status] ?? [];

  return (
    <main className="std-page">
      <div className="td-crumbrow">
        <nav className="td-crumbs" aria-label="Breadcrumb">
          <a
            href="#/staff/queue"
            onClick={(e) => { e.preventDefault(); onBack?.(); }}
          >
            Ticket Queue
          </a>
          <span className="sep">/</span>
          <b>{ticket.ticketNumber}</b>
        </nav>
        <button type="button" className="tok-btn secondary" onClick={() => onBack?.()}>Back to Queue</button>
      </div>

      <section className="td-card std-header" aria-label="Ticket summary">
        <div className="std-head-row">
          <h1 className="std-title">
            {ticket.ticketNumber}
            <span className={`td-badge ${ticket.priority === 'CRITICAL' ? 'td-b-critical' : ticket.priority === 'HIGH' ? 'td-b-high' : ticket.priority === 'MEDIUM' ? 'td-b-medium' : 'td-b-low'}`}>
              {PRIORITY_TEXT[ticket.priority]} (requested)
            </span>
            <span className="td-badge td-b-status">{STATUS_TEXT[ticket.status]}</span>
          </h1>
          <span className="td-caption">{fmtDate(ticket.createdAt)}</span>
        </div>
        {ticket.appearsResolvedAt ? (
          <div className="std-resolved-hint" role="status">
            ✓ The requester indicated this problem appears resolved
            {' '}({fmtDate(ticket.appearsResolvedAt)}). Verify with the requester, then formally resolve.
          </div>
        ) : null}
      </section>

      <section className="td-card" aria-label="Ticket fields">
        <div className="std-grid">
          {/* Read-only group */}
          <div className="std-field">
            <label>Category</label>
            <div className="td-ro">{ticket.category.name}</div>
          </div>
          <div className="std-field">
            <label>Requester</label>
            <div className="td-ro">
              {ticket.requester.name}
              <span className="td-muted"> · {ticket.requester.email}</span>
            </div>
          </div>
          <div className="std-field std-span2">
            <label>Summary</label>
            <div className="td-ro">{ticket.title}</div>
          </div>
          <div className="std-field std-span4">
            <label>Description</label>
            <div className="td-ro warm tok-desc-warm" data-warm>
              {ticket.description ? ticket.description : <span className="td-muted">No description provided.</span>}
            </div>
          </div>

          {/* Editable group (disabled render for ADMIN view-only, AD-02) */}
          <div className="std-field">
            <label htmlFor="std-owner">Owner</label>
            <select
              id="std-owner"
              className="tok-select std-editable"
              value={draft?.owner ?? ''}
              disabled={!isItStaff || saving}
              onChange={(e) => { setDraft((d) => (d ? { ...d, owner: e.target.value } : d)); setFieldErrors((m) => ({ ...m, ownerId: '' })); }}
            >
              <option value="unassigned">Unassigned</option>
              {owners.map((o) => (
                <option key={o.id} value={String(o.id)}>{o.name}</option>
              ))}
              {ticket.owner && !owners.some((o) => o.id === ticket.owner?.id) ? (
                <option value={String(ticket.owner.id)}>
                  {ticket.owner.name}{ticket.owner.isActive ? '' : ' (deactivated)'}
                </option>
              ) : null}
            </select>
            {fieldErrors.ownerId ? <p className="td-post-error" role="alert">{fieldErrors.ownerId}</p> : null}
          </div>
          <div className="std-field">
            <label htmlFor="std-itpriority">IT Priority</label>
            <select
              id="std-itpriority"
              className="tok-select std-editable"
              value={draft?.itPriority ?? ''}
              disabled={!isItStaff || saving}
              onChange={(e) => { setDraft((d) => (d ? { ...d, itPriority: e.target.value } : d)); setFieldErrors((m) => ({ ...m, itPriority: '' })); }}
            >
              <option value="">Unset</option>
              {(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as Priority[]).map((p) => (
                <option key={p} value={p}>{PRIORITY_TEXT[p]}</option>
              ))}
            </select>
            {draft?.owner === 'unassigned' && ticket.owner === null && draft.itPriority === '' && isItStaff ? (
              <p className="td-caption">Claiming copies Requested Priority into IT Priority when unset.</p>
            ) : null}
            {fieldErrors.itPriority ? <p className="td-post-error" role="alert">{fieldErrors.itPriority}</p> : null}
          </div>
          <div className="std-field">
            <label htmlFor="std-status">Status</label>
            <select
              id="std-status"
              className="tok-select std-editable"
              value=""
              disabled={!isItStaff || saving}
              onChange={(e) => {
                const target = e.target.value as StaffTicketStatus;
                if (e.target.value === '') return;
                setDraft((d) => (d ? { ...d, status: target } : d));
                requestStatusChange(target);
              }}
            >
              <option value="">{STATUS_TEXT[ticket.status]} (current)</option>
              {statusTargets.map((s) => (
                <option key={s} value={s}>{STATUS_TEXT[s]}</option>
              ))}
            </select>
            {!isItStaff ? (
              <p className="td-caption">Administrators have view-only access to ticket operations.</p>
            ) : null}
          </div>

          {dirty && isItStaff ? (
            <div className="std-savebar std-span4" role="group" aria-label="Save or discard changes">
              <button
                type="button"
                className="tok-btn primary"
                disabled={saving}
                aria-busy={saving}
                onClick={() => void saveOps()}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" className="tok-btn secondary" disabled={saving} onClick={resetDraft}>
                Discard
              </button>
            </div>
          ) : null}
        </div>

        {saveBanner ? (
          <div
            className={`std-banner ${saveBanner.kind}`}
            role={saveBanner.kind === 'success' ? 'status' : 'alert'}
            aria-live="polite"
          >
            <span>{saveBanner.text}</span>
            {saveBanner.kind === 'conflict' ? (
              <button type="button" className="tok-btn secondary" onClick={() => { resetDraft(); void load(); }}>
                Reload
              </button>
            ) : null}
            <button type="button" className="std-banner-x" aria-label="Dismiss" onClick={() => setSaveBanner(null)}>✕</button>
          </div>
        ) : null}
      </section>

      <div className="td-tabs" role="tablist" onKeyDown={onTabKeyDown} aria-label="Ticket threads">
        <button
          ref={(el) => { tabRefs.current['public'] = el; }}
          className={`td-tab ${activeTab === 'public' ? 'active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'public'}
          onClick={() => setActiveTab('public')}
        >
          💬 Public Comments <span className="count">{comments.length}</span>
        </button>
        <button
          ref={(el) => { tabRefs.current['internal'] = el; }}
          className={`td-tab std-tab-internal ${activeTab === 'internal' ? 'active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'internal'}
          onClick={() => setActiveTab('internal')}
        >
          🔒 Internal Notes (staff only) <span className="count">{notes.length}</span>
        </button>
        <button
          ref={(el) => { tabRefs.current['attachments'] = el; }}
          className={`td-tab ${activeTab === 'attachments' ? 'active' : ''}`}
          role="tab"
          aria-selected={activeTab === 'attachments'}
          onClick={() => setActiveTab('attachments')}
        >
          📎 Attachments <span className="count">{activeAttachments.length}</span>
        </button>
      </div>

      <section
        id="panel-public"
        className={`td-panel ${activeTab === 'public' ? 'active' : ''}`}
        role="tabpanel"
        aria-label="Public Comments"
      >
        {commentsState === 'loading' && <div className="tt-skeleton" role="status" aria-label="Loading comments" />}
        {commentsState === 'error' && (
          <div className="td-thread-error" role="alert">
            <span>We could not load the public comments.</span>
            <button type="button" className="tok-btn secondary" onClick={() => void loadComments()}>Try again</button>
          </div>
        )}
        {commentsState === 'ready' && comments.length === 0 ? (
          <p className="td-caption" style={{ marginBottom: 12 }}>No public comments yet. Start the conversation below.</p>
        ) : null}
        {comments.map((c) => (
          <div key={c.id} className={`td-comment${c.appearsResolved ? ' td-comment-signal' : ''}`}>
            <div>
              <div className="td-chead">
                <span className="name">{c.author.name}</span>
                <span className={`td-badge ${c.author.role === 'REQUESTER' ? 'td-b-status' : 'td-b-medium'}`}>
                  {c.author.role === 'REQUESTER' ? 'Requester' : c.author.role === 'IT_STAFF' ? 'IT Support' : 'Administrator'}
                </span>
                {c.appearsResolved ? <span className="td-signal-chip">✓ appears resolved</span> : null}
                <span className="time">{fmtDate(c.createdAt)}</span>
              </div>
              <div className="td-ctext">{c.body}</div>
            </div>
          </div>
        ))}

        {isItStaff ? (
          <>
            <div className="std-composer">
              <textarea
                className="td-composer-input"
                placeholder="Type a public reply — the requester will see this…"
                aria-label="Add a public comment"
                value={commentDraft}
                disabled={postingComment}
                onChange={(e) => { setCommentDraft(e.target.value); setCommentError(''); }}
              />
              <div className="td-composer-meta">
                <span className="std-public-hint">Visible to the requester.</span>
                <span className={`td-caption${charsLeftComment < 0 ? ' td-limit-hit' : ''}`} aria-live="polite">
                  {Math.max(charsLeftComment, 0).toLocaleString('en-US')} characters remaining
                </span>
              </div>
              {commentError ? <p className="td-post-error" role="alert">{commentError}</p> : null}
              {charsLeftComment < 0 ? <p className="td-post-error" role="alert">Keep this entry under 2000 characters.</p> : null}
              <button
                type="button"
                className="tok-btn primary td-post-btn"
                disabled={postingComment || commentDraft.trim().length === 0 || charsLeftComment < 0}
                aria-busy={postingComment}
                onClick={() => void postComment()}
              >
                {postingComment ? 'Posting…' : '➤ Post Comment'}
              </button>
            </div>
          </>
        ) : null}
      </section>

      <section
        id="panel-internal"
        className={`td-panel ${activeTab === 'internal' ? 'active' : ''}`}
        role="tabpanel"
        aria-label="Internal Notes"
      >
        <div className="std-internal-warning" role="note">
          🔒 Staff only — never visible to the requester.
        </div>
        {notesState === 'loading' && <div className="tt-skeleton" role="status" aria-label="Loading internal notes" />}
        {notesState === 'error' && (
          <div className="td-thread-error" role="alert">
            <span>We could not load the internal notes.</span>
            <button type="button" className="tok-btn secondary" onClick={() => void loadNotes()}>Try again</button>
          </div>
        )}
        {notesState === 'ready' && notes.length === 0 ? (
          <p className="td-caption std-note-empty">No internal notes yet.</p>
        ) : null}
        {notes.map((n) => (
          <div key={n.id} className="std-note">
            <div className="td-chead">
              <span className="name">{n.author.name}</span>
              <span className="td-badge td-b-internal">{n.author.role === 'IT_STAFF' ? 'IT Support' : 'Administrator'}</span>
              <span className="time">{fmtDate(n.createdAt)}</span>
            </div>
            <div className="td-ctext">{n.body}</div>
          </div>
        ))}

        {isItStaff ? (
          <div className="std-composer std-composer-internal">
            <textarea
              className="td-composer-input"
              placeholder="Add an internal note (visible only to IT staff and administrators)…"
              aria-label="Add an internal note"
              value={noteDraft}
              disabled={postingNote}
              onChange={(e) => { setNoteDraft(e.target.value); setNoteError(''); }}
            />
            <div className="td-composer-meta">
              <span className="std-internal-hint">Visible only to IT staff and administrators.</span>
            </div>
            {noteError ? <p className="td-post-error" role="alert">{noteError}</p> : null}
            <button
              type="button"
              className="tok-btn primary td-post-btn"
              disabled={postingNote || noteDraft.trim().length === 0}
              aria-busy={postingNote}
              onClick={() => void postNote()}
            >
              {postingNote ? 'Posting…' : '🔒 Post Internal Note'}
            </button>
          </div>
        ) : null}
      </section>

      <section
        id="panel-attachments"
        className={`td-panel ${activeTab === 'attachments' ? 'active' : ''}`}
        role="tabpanel"
        aria-label="Attachments"
      >
        {activeAttachments.length === 0 ? (
          <p className="td-caption">No attachments on this ticket.</p>
        ) : (
          <ul className="std-att-list">
            {activeAttachments.map((a) => (
              <li key={a.id} className="std-att-row">
                <div>
                  <div className="std-att-name">{a.fileName}</div>
                  <div className="td-caption">{a.mimeType} · {fmtSize(a.sizeBytes)} · {fmtDate(a.uploadedAt)}</div>
                </div>
                <button
                  type="button"
                  className="tok-btn secondary std-att-dl"
                  onClick={() => void download(a.id, a.fileName)}
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {confirmTarget ? (
        <div className="td-modal-backdrop" role="presentation" onClick={() => { if (!confirmBusy) setConfirmTarget(null); }}>
          <div className="td-modal" role="dialog" aria-modal="true" aria-labelledby="std-confirm-title" onClick={(e) => e.stopPropagation()}>
            <h2 id="std-confirm-title">
              {confirmTarget === 'CANCELLED' ? 'Cancel this ticket?'
                : confirmTarget === 'RESOLVED' ? 'Mark this ticket resolved?'
                  : confirmTarget === 'CLOSED' ? 'Close this ticket?'
                    : 'Reopen this ticket?'}
            </h2>
            <p className="td-hint">
              {confirmTarget === 'CANCELLED'
                ? 'The requester will see the ticket as Cancelled. This cannot be undone except by reopening.'
                : confirmTarget === 'RESOLVED'
                  ? 'Formal resolution. A system comment records the change on the public thread.'
                  : confirmTarget === 'CLOSED'
                    ? 'Closing archives the ticket after resolution.'
                    : 'Reopening re-engages the workflow. A reason comment is required.'}
            </p>
            {REASON_TARGETS.includes(confirmTarget) ? (
              <>
                <textarea
                  className="td-composer-input"
                  aria-label="Reason for reopening"
                  placeholder="Why is this ticket being reopened?"
                  value={confirmReason}
                  disabled={confirmBusy}
                  onChange={(e) => { setConfirmReason(e.target.value); setConfirmError(''); }}
                />
                {confirmReason.trim().length === 0 ? (
                  <p className="td-caption">A reason comment is required and will be posted to the public thread.</p>
                ) : null}
              </>
            ) : null}
            {confirmError ? <p className="td-post-error" role="alert">{confirmError}</p> : null}
            <div className="td-modal-actions">
              <button
                type="button"
                className="tok-btn primary"
                disabled={confirmBusy || (REASON_TARGETS.includes(confirmTarget) && confirmReason.trim().length === 0)}
                aria-busy={confirmBusy}
                onClick={() => void runConfirmedStatus()}
              >
                {confirmBusy ? 'Saving…' : 'Confirm'}
              </button>
              <button type="button" className="tok-btn secondary" disabled={confirmBusy} onClick={() => setConfirmTarget(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
