import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { deleteAttachment, downloadAttachment, getTicketEvents, restoreAttachment, uploadAttachment, type AttachmentEvent, type AttachmentMeta } from '../api';

const ALLOWED_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
const MAX_SIZE = 5 * 1024 * 1024;
const MAX_ACTIVE = 5;
export const REMOVE_REASON_CODES = ['Duplicate', 'Obsolete', 'Sensitive content', 'Uploaded in error', 'Other'] as const;

function extOf(name: string) { const p = name.split('.'); return p.length>1? p.pop()!.toLowerCase():''; }
function fmtSize(bytes:number){ if(bytes>=1048576) return `${(bytes/1048576).toFixed(1)} MB`; return `${Math.max(1, Math.round(bytes/1024))} KB`; }
function fmtDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true });
}
function tileKind(ext: string): 'IMG' | 'PDF' | 'DOC' | 'ARC' | 'GEN' {
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext)) return 'IMG';
  if (ext === 'pdf') return 'PDF';
  if (['doc', 'docx', 'txt', 'md', 'rtf'].includes(ext)) return 'DOC';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'ARC';
  return 'GEN';
}
function tileClass(kind: string): string {
  if (kind === 'IMG') return 'tok-att-tile--img';
  if (kind === 'PDF') return 'tok-att-tile--pdf';
  if (kind === 'DOC') return 'tok-att-tile--doc';
  if (kind === 'ARC') return 'tok-att-tile--arc';
  return 'tok-att-tile--gen';
}
function delay(ms: number): Promise<void> { return new Promise(res => setTimeout(res, ms)); }

function saveBlob(blob: Blob, fileName: string): void {
  const createURL = (URL as unknown as { createObjectURL?: (b: Blob) => string }).createObjectURL;
  const revokeURL = (URL as unknown as { revokeObjectURL?: (u: string) => void }).revokeObjectURL;
  if (typeof createURL !== 'function') throw new Error('Download not supported in this browser.');
  const url = createURL.call(URL, blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  if (typeof revokeURL === 'function') {
    setTimeout(() => { try { revokeURL.call(URL, url); } catch { /* noop */ } }, 4000);
  }
}

export function pad4(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return String(Math.trunc(n)).padStart(4, '0');
}
export function attLabel(id: number | null | undefined): string {
  if (typeof id !== 'number' || !Number.isFinite(id)) return 'ATT-—';
  return `ATT-${pad4(id)}`;
}
export function audLabel(id: number | null | undefined): string {
  if (typeof id !== 'number' || !Number.isFinite(id)) return 'AUD-—';
  return `AUD-${pad4(id)}`;
}
export function shaShort(sha: string | null | undefined): string | null {
  if (!sha || typeof sha !== 'string' || sha.length < 8) return sha ? String(sha) : null;
  return `sha256:${sha.slice(0, 4)}…${sha.slice(-4)}`;
}

interface Props {
  ticketNumber: string;
  attachments: AttachmentMeta[];
  onChanged: () => void;
}

type SortKey = 'newest' | 'oldest' | 'name' | 'size';

export default function AttachmentSection({ ticketNumber, attachments, onChanged }: Props) {
  const [pending, setPending] = useState<Array<{id:string,name:string,size:number,error?:string,uploading?:boolean}>>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const [localRemoved, setLocalRemoved] = useState<Set<number>>(new Set());
  const [downloadingIds, setDownloadingIds] = useState<Set<number>>(new Set());
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({});
  const [bulkStatus, setBulkStatus] = useState<string | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortKey>('newest');

  const [events, setEvents] = useState<AttachmentEvent[]>([]);
  const [restoringId, setRestoringId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [removeTarget, setRemoveTarget] = useState<AttachmentMeta | null>(null);
  const [reasonCode, setReasonCode] = useState<string>(REMOVE_REASON_CODES[0]);
  const [ledgerNote, setLedgerNote] = useState('');
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const reasonRef = useRef<HTMLSelectElement>(null);
  const lastFocusRef = useRef<HTMLElement | null>(null);
  const toastTimer = useRef<number | null>(null);

  const displayAttachments = attachments.map(a=> localRemoved.has(a.id)? {...a, removedAt: new Date().toISOString()}: a);
  const activeCount = displayAttachments.filter(a=>!a.removedAt).length;
  const limitReached = activeCount >= MAX_ACTIVE;

  function showToast(msg: string): void {
    setToast(msg);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 4000);
  }
  useEffect(() => () => { if (toastTimer.current !== null) window.clearTimeout(toastTimer.current); }, []);

  const refreshEvents = useCallback(async () => {
    try {
      const list = await getTicketEvents(ticketNumber);
      setEvents(Array.isArray(list) ? list : []);
    } catch {
      setEvents([]);
    }
  }, [ticketNumber]);

  useEffect(() => { void refreshEvents(); }, [refreshEvents]);

  function openRemove(att: AttachmentMeta): void {
    lastFocusRef.current = document.activeElement as HTMLElement | null;
    setRemoveTarget(att);
    setReasonCode(REMOVE_REASON_CODES[0]);
    setLedgerNote('');
    setRemoveError(null);
  }
  function closeRemove(): void {
    if (removing) return;
    setRemoveTarget(null);
    setRemoveError(null);
    const el = lastFocusRef.current;
    if (el && typeof el.focus === 'function') {
      window.setTimeout(() => { try { el.focus(); } catch { /* noop */ } }, 0);
    }
  }

  useEffect(() => {
    if (removeTarget) {
      const t = window.setTimeout(() => reasonRef.current?.focus(), 0);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [removeTarget]);

  useEffect(() => {
    if (!removeTarget) return undefined;
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeRemove();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [removeTarget, removing]);

  async function confirmRemove(): Promise<void> {
    if (!removeTarget || removing) return;
    const target = removeTarget;
    setRemoving(true);
    setRemoveError(null);
    try {
      await deleteAttachment(ticketNumber, target.id, { reasonCode, note: ledgerNote.trim() });
      setRemoveTarget(null);
      setLocalRemoved(prev => new Set([...prev, target.id]));
      onChanged();
      await refreshEvents();
      showToast(`Attachment removed · ${attLabel(target.id)} written to ledger`);
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      setRemoveError(err?.body?.error || err?.message || 'Remove failed');
    } finally {
      setRemoving(false);
    }
  }

  async function handleRestore(fileId: number): Promise<void> {
    if (restoringId !== null) return;
    setRestoringId(fileId);
    try {
      await restoreAttachment(ticketNumber, fileId);
      setLocalRemoved(prev => { const c = new Set(prev); c.delete(fileId); return c; });
      onChanged();
      await refreshEvents();
      showToast(`Attachment restored · ${attLabel(fileId)}`);
    } catch (e: unknown) {
      const err = e as { body?: { error?: string }; message?: string };
      showToast(err?.body?.error || err?.message || 'Restore failed');
    } finally {
      setRestoringId(null);
    }
  }

  function handleExport(): void {
    const payload = {
      ticket: ticketNumber,
      exportedAt: new Date().toISOString(),
      retention: 'RET-7',
      events,
    };
    try {
      saveBlob(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }), `audit_${ticketNumber}.json`);
      showToast(`Audit ledger exported (${events.length} events)`);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : 'Export failed');
    }
  }

  async function handleFiles(files: FileList | File[]) {
    const next = [...pending];
    for (const f of Array.from(files)) {
      const ext = extOf(f.name);
      if (!ALLOWED_EXTS.has(ext)) {
        next.push({ id:`${f.name}-${Date.now()}`, name:f.name, size:f.size, error:'File type not supported' });
        continue;
      }
      if (f.size > MAX_SIZE) {
        next.push({ id:`${f.name}-${Date.now()}`, name:f.name, size:f.size, error:'File too large — max 5 MB' });
        continue;
      }
      if (activeCount + next.filter(x=>!x.error && !x.uploading).length >= MAX_ACTIVE) {
        next.push({ id:`${f.name}-${Date.now()}`, name:f.name, size:f.size, error:'Attachment limit reached (5 max)' });
        continue;
      }
      const pid = `${f.name}-${Date.now()}`;
      next.push({ id:pid, name:f.name, size:f.size, uploading:true });
      setPending([...next]);
      try {
        await uploadAttachment(ticketNumber, f);
        setPending(cur=>cur.filter(p=>p.id!==pid));
        onChanged();
        await refreshEvents();
      } catch (e:any) {
        const msg = e?.body?.error || e?.message || 'Upload failed';
        setPending(cur=>cur.map(p=>p.id===pid? {...p, uploading:false, error:msg}:p));
      }
    }
    setPending(next.filter(p=> !p.uploading || p.error));
    setPending(prev=>prev);
  }

  function messageOf(e: unknown): string {
    if (e instanceof Error) return e.message;
    const err = e as { body?: { error?: string }; message?: string };
    return err?.body?.error || err?.message || 'Download failed';
  }

  async function handleDownload(att: AttachmentMeta): Promise<boolean> {
    setDownloadingIds(prev => new Set([...prev, att.id]));
    setRowErrors(prev => { const c = { ...prev }; delete c[att.id]; return c; });
    try {
      const blob = await downloadAttachment(ticketNumber, att.id);
      saveBlob(blob, att.fileName);
      void refreshEvents().catch(() => undefined);
      return true;
    } catch (e: unknown) {
      setRowErrors(prev => ({ ...prev, [att.id]: messageOf(e) }));
      return false;
    } finally {
      setDownloadingIds(prev => { const c = new Set(prev); c.delete(att.id); return c; });
    }
  }

  async function handleDownloadAll(list: AttachmentMeta[]): Promise<void> {
    if (list.length === 0 || downloadingIds.size > 0 || bulkBusy) return;
    setBulkBusy(true);
    setBulkStatus(null);
    let okCount = 0;
    const failed: string[] = [];
    for (let i = 0; i < list.length; i++) {
      const att = list[i];
      setBulkStatus(`Downloaded ${okCount} of ${list.length}…`);
      const ok = await handleDownload(att);
      if (ok) okCount += 1;
      else failed.push(att.fileName);
      if (i < list.length - 1) await delay(250);
    }
    setBulkStatus(
      failed.length === 0
        ? `Downloaded ${okCount} of ${list.length}`
        : `Downloaded ${okCount} of ${list.length}. Failed: ${failed.join(', ')}`
    );
    setBulkBusy(false);
    void refreshEvents().catch(() => undefined);
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = displayAttachments.filter(a => a.fileName.toLowerCase().includes(q));
    list = [...list].sort((a, b) => {
      if (sort === 'name') return a.fileName.localeCompare(b.fileName);
      if (sort === 'size') return b.sizeBytes - a.sizeBytes;
      if (sort === 'oldest') return a.uploadedAt.localeCompare(b.uploadedAt);
      return b.uploadedAt.localeCompare(a.uploadedAt);
    });
    return list;
  }, [displayAttachments, query, sort]);

  const activeVisible = useMemo(() => visible.filter(a => !a.removedAt), [visible]);
  const anyDownloading = downloadingIds.size > 0 || bulkBusy;

  const sortedEvents = useMemo(() => {
    const list = Array.isArray(events) ? [...events] : [];
    list.sort((a, b) => {
      const atA = a.at ?? a.createdAt ?? '';
      const atB = b.at ?? b.createdAt ?? '';
      const cmp = String(atB).localeCompare(String(atA));
      if (cmp !== 0) return cmp;
      return (b.id ?? 0) - (a.id ?? 0);
    });
    return list;
  }, [events]);

  const restorableIds = useMemo(() => {
    const s = new Set<number>();
    for (const a of displayAttachments) if (a.removedAt) s.add(a.id);
    return s;
  }, [displayAttachments]);

  const byFileId = useMemo(() => {
    const m = new Map<number, AttachmentMeta>();
    for (const a of displayAttachments) m.set(a.id, a);
    return m;
  }, [displayAttachments]);

  function badgeClass(type: string): string {
    const t = String(type).toUpperCase();
    if (t === 'REMOVE') return 'tok-aud-badge--remove';
    if (t === 'RESTORE') return 'tok-aud-badge--restore';
    return 'tok-aud-badge--muted';
  }

  function metaBits(ev: AttachmentEvent): string {
    const at = ev.at ?? ev.createdAt ?? '';
    const by = ev.by ?? ev.actorName ?? '';
    const bits = [audLabel(ev.id), `by ${by}`, fmtDate(String(at))];
    if (ev.reason) bits.push(`reason: ${ev.reason}`);
    if (typeof ev.ref === 'number' && ev.ref !== null) bits.push(`ref: ${audLabel(ev.ref)}`);
    return bits.join(' · ');
  }

  return (
    <>
    <section aria-label="Attachments" className="tok-att-panel">
      <div className="tok-att-head">
        <h2 className="tok-section-label tok-att-title">Attachments ({activeCount})</h2>
        <span className="tok-att-count" aria-label={`${activeCount} files`}>{activeCount} {activeCount === 1 ? 'file' : 'files'}</span>
        <span className="tok-att-spacer" />
        <button
          type="button"
          className="tok-att-btn tok-att-btn--ghost"
          aria-label="Download all attachments"
          disabled={activeCount === 0 || anyDownloading}
          onClick={() => void handleDownloadAll(activeVisible)}
        >
          {bulkBusy ? 'Downloading…' : 'Download all'}
        </button>
      </div>
      <div className={`tok-dropzone tok-att-dropzone ${limitReached?'disabled':''}`} onClick={() => { if (!limitReached) inputRef.current?.click(); }}>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          multiple
          disabled={limitReached}
          onChange={e=>{ if(e.target.files) handleFiles(e.target.files); e.target.value=''; }}
          data-testid="attachment-input"
          aria-label="Upload attachments"
        />
        <div className="tok-att-dz-t">Drag &amp; drop files here, or <span className="tok-browse">browse</span></div>
        <div className="tok-att-dz-h">JPG, PNG, WebP or PDF · max 5 MB each · 5 max</div>
        {limitReached && <p>Attachment limit reached (5 max)</p>}
      </div>
      <div className="tok-att-toolbar">
        <div className="tok-att-search">
          <input
            type="search"
            placeholder="Filter attachments…"
            aria-label="Filter attachments"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>
        <select aria-label="Sort attachments" value={sort} onChange={e => setSort(e.target.value as SortKey)}>
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="name">Name A–Z</option>
          <option value="size">Largest first</option>
        </select>
        <span className="tok-att-tally">{visible.length} shown · {activeCount} active</span>
      </div>
      {bulkStatus && <p className="tok-att-bulk" role="status" aria-live="polite">{bulkStatus}</p>}
      <div className="tok-chips tok-att-list">
        {visible.map(att=>{
          const removed = !!att.removedAt;
          const kind = tileKind(extOf(att.fileName));
          const busy = downloadingIds.has(att.id);
          if (removed) {
            return (
              <span key={att.id} className={`tok-chip attachment-chip tok-att-row removed grayed`} style={{textDecoration:'line-through', opacity:0.6}}>
                <span className={`tok-att-tile ${tileClass(kind)}`} aria-hidden="true">{kind}</span>
                <span>{att.fileName}</span>
                <span className="size">{fmtSize(att.sizeBytes)}</span>
                <span className="removed-badge">Removed</span>
              </span>
            );
          }
          const short = att.sha256 ? shaShort(att.sha256) : null;
          return (
            <span key={att.id} className={`tok-chip attachment-chip tok-att-row`}>
              <span className={`tok-att-tile ${tileClass(kind)}`} aria-hidden="true">{kind}</span>
              <span className="tok-att-body">
                <span className="tok-att-name">{att.fileName}</span>
                <span className="tok-att-meta">
                  <span>{fmtSize(att.sizeBytes)}</span>
                  <span className="tok-att-dot" aria-hidden="true">·</span>
                  <span>{fmtDate(att.uploadedAt)}</span>
                  {short && (
                    <>
                      <span className="tok-att-dot" aria-hidden="true">·</span>
                      <span className="tok-att-sha" title={att.sha256 ?? ''}>{short}</span>
                    </>
                  )}
                </span>
                {rowErrors[att.id] && <span className="tok-att-err" role="alert">{rowErrors[att.id]}</span>}
              </span>
              <span className="tok-att-actions">
                <button
                  type="button"
                  className="tok-att-btn tok-att-btn--ghost"
                  aria-label={`Download ${att.fileName}`}
                  disabled={busy}
                  onClick={() => void handleDownload(att)}
                >
                  {busy ? 'Downloading…' : 'Download'}
                </button>
                <button type="button" className="tok-att-btn tok-att-btn--danger" onClick={() => openRemove(att)}>Remove</button>
              </span>
            </span>
          );
        })}
        {visible.length === 0 && displayAttachments.length > 0 && (
          <span className="tok-att-empty">No attachments match. Clear the filter.</span>
        )}
        {pending.map(p=>(
          <span key={p.id} className={`tok-chip ${p.error?'invalid':''}`}>
            {p.error ? <span className="bang">!</span> : <span className="ok">✓</span>}
            <span className="name">{p.error? `${p.name} — ${p.error}`: p.name}</span>
            {!p.error && <span className="size">{fmtSize(p.size)}</span>}
            {p.uploading && <span>Uploading…</span>}
          </span>
        ))}
      </div>
    </section>

    <section aria-label="Audit trail" className="tok-att-panel tok-aud-panel">
      <div className="tok-att-head">
        <h2 className="tok-section-label tok-att-title">Audit trail</h2>
        <span className="tok-att-count" aria-label={`${sortedEvents.length} events`}>{sortedEvents.length} {sortedEvents.length === 1 ? 'event' : 'events'}</span>
        <span className="tok-att-spacer" />
        <button type="button" className="tok-att-btn tok-att-btn--ghost" onClick={handleExport}>
          Export JSON
        </button>
      </div>
      <div className="tok-aud-note">
        <span aria-hidden="true">🔒</span>
        <span>Append-only ledger — purges keep full file metadata (name, size, MIME, SHA-256, actor, timestamps, reason). Restores append, never erase. Retention RET-7.</span>
      </div>
      <div className="tok-aud-list">
        {sortedEvents.length === 0 && (
          <p className="tok-att-empty">No audit events yet.</p>
        )}
        {sortedEvents.map(ev => {
          const f = ev.file ?? { id: null, name: '', size: 0, mime: '', sha: null };
          const kind = tileKind(extOf(String(f.name ?? '')));
          const isRemove = String(ev.type).toUpperCase() === 'REMOVE';
          const canRestore = isRemove && typeof f.id === 'number' && restorableIds.has(f.id);
          const restoring = typeof f.id === 'number' && restoringId === f.id;
          const lookup = typeof f.id === 'number' ? byFileId.get(f.id) : undefined;
          const uploadedAt = lookup?.uploadedAt ?? '—';
          const metaLine = metaBits(ev) + (ev.note ? ` · “${ev.note}”` : '');
          return (
            <details key={ev.id} className="tok-aud" data-testid={`audit-row-${ev.id}`}>
              <summary className="tok-aud-summary">
                <span className={`tok-att-tile ${tileClass(kind)}`} aria-hidden="true">{kind}</span>
                <span className="tok-aud-body">
                  <span className="tok-aud-l1">
                    <span className={isRemove ? 'tok-aud-name tok-aud-name--struck' : 'tok-aud-name'}>{f.name}</span>
                    <span className={`tok-aud-badge ${badgeClass(String(ev.type))}`}>{String(ev.type).toUpperCase()}</span>
                  </span>
                  <span className="tok-aud-meta">{metaLine}</span>
                </span>
                {canRestore && (
                  <button
                    type="button"
                    className="tok-att-btn tok-att-btn--ghost"
                    disabled={restoring}
                    onClick={(e) => { e.preventDefault(); if (typeof f.id === 'number') void handleRestore(f.id); }}
                  >
                    {restoring ? 'Restoring…' : 'Restore'}
                  </button>
                )}
                <span className="tok-aud-chev" aria-hidden="true">›</span>
              </summary>
              <div className="tok-aud-detail">
                <dl>
                  <dt>Event ID</dt><dd className="tok-mono">{audLabel(ev.id)}</dd>
                  <dt>Type</dt><dd>{String(ev.type).toUpperCase()}</dd>
                  <dt>Actor</dt><dd>{ev.by ?? ev.actorName ?? ''}</dd>
                  <dt>Timestamp</dt><dd className="tok-mono">{fmtDate(String(ev.at ?? ev.createdAt ?? ''))}</dd>
                  <dt>File ID</dt><dd className="tok-mono">{attLabel(typeof f.id === 'number' ? f.id : null)}</dd>
                  <dt>File name</dt><dd>{f.name}</dd>
                  <dt>MIME</dt><dd className="tok-mono">{f.mime}</dd>
                  <dt>Size bytes</dt><dd className="tok-mono">{Number(f.size ?? 0).toLocaleString()} bytes</dd>
                  <dt>SHA-256</dt><dd className="tok-mono">{f.sha ?? '—'}</dd>
                  <dt>Uploaded by</dt><dd>—</dd>
                  <dt>Uploaded at</dt><dd className="tok-mono">{uploadedAt && uploadedAt !== '—' ? fmtDate(String(uploadedAt)) : '—'}</dd>
                  {ev.reason ? (<><dt>Reason</dt><dd>{ev.reason}</dd></>) : null}
                  {ev.note ? (<><dt>Ledger note</dt><dd>{ev.note}</dd></>) : null}
                  {typeof ev.ref === 'number' && ev.ref !== null ? (<><dt>References</dt><dd className="tok-mono">{audLabel(ev.ref)}</dd></>) : null}
                  {isRemove ? (<><dt>Retention note</dt><dd>RET-7 · metadata retained 7 years</dd></>) : null}
                </dl>
              </div>
            </details>
          );
        })}
      </div>
    </section>

    {removeTarget && (
      <div className="tok-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeRemove(); }} data-testid="remove-overlay">
        <div className="tok-modal" role="dialog" aria-modal="true" aria-labelledby="rmTitle">
          <h3 id="rmTitle" className="tok-modal-title">Remove attachment</h3>
          <p className="tok-modal-sub">The binary is purged from object storage. Its metadata is written to the audit ledger and retained per policy.</p>
          <div className="tok-modal-filebox">
            <span className={`tok-att-tile ${tileClass(tileKind(extOf(removeTarget.fileName)))}`} aria-hidden="true">{tileKind(extOf(removeTarget.fileName))}</span>
            <span className="tok-modal-filemeta">
              <span className="tok-modal-fn">{removeTarget.fileName}</span>
              <span className="tok-modal-fm tok-mono">
                {attLabel(removeTarget.id)} · {fmtSize(removeTarget.sizeBytes)}{removeTarget.sha256 ? ` · ${shaShort(removeTarget.sha256)}` : ''}
              </span>
            </span>
          </div>
          <div className="tok-modal-field">
            <label htmlFor="rmReason">Removal reason code</label>
            <select
              id="rmReason"
              ref={reasonRef}
              value={reasonCode}
              onChange={e => setReasonCode(e.target.value)}
              disabled={removing}
            >
              {REMOVE_REASON_CODES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="tok-modal-field">
            <label htmlFor="rmNote">Ledger note (optional)</label>
            <input
              id="rmNote"
              type="text"
              placeholder="e.g. re-uploaded corrected scan"
              value={ledgerNote}
              onChange={e => setLedgerNote(e.target.value)}
              disabled={removing}
              maxLength={200}
            />
          </div>
          <div className="tok-modal-warn" role="note">
            <span aria-hidden="true">🛡</span>
            <span>Download links die with the binary. The ledger entry — including checksum and actor identity — is permanent and exportable.</span>
          </div>
          {removeError && <p className="tok-att-err" role="alert">{removeError}</p>}
          <div className="tok-modal-actions">
            <button type="button" className="tok-att-btn tok-att-btn--ghost" onClick={closeRemove} disabled={removing}>
              Cancel
            </button>
            <button
              type="button"
              className="tok-att-btn tok-att-btn--danger-solid"
              onClick={() => void confirmRemove()}
              disabled={removing}
            >
              {removing ? 'Purging…' : 'Purge file'}
            </button>
          </div>
        </div>
      </div>
    )}

    {toast && (
      <div className="tok-toast-stack">
        <div className="tok-toast tok-toast-success" role="status" aria-live="polite">
          <span className="tok-toast-icon" aria-hidden="true">✓</span>
          <span className="tok-toast-text">{toast}</span>
          <button type="button" className="tok-toast-close" aria-label="Dismiss notification" onClick={() => setToast(null)}>×</button>
        </div>
      </div>
    )}
    </>
  );
}
