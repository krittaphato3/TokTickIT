import { useState, useRef } from 'react';
import { deleteAttachment, uploadAttachment, type AttachmentMeta } from '../api';
import { useDevRequester } from '../devRequesterContext';

const ALLOWED_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'pdf']);
const MAX_SIZE = 5 * 1024 * 1024;
const MAX_ACTIVE = 5;

function extOf(name: string) { const p = name.split('.'); return p.length>1? p.pop()!.toLowerCase():''; }
function fmtSize(bytes:number){ if(bytes>=1048576) return `${(bytes/1048576).toFixed(1)} MB`; return `${Math.max(1, Math.round(bytes/1024))} KB`; }

interface Props {
  ticketNumber: string;
  attachments: AttachmentMeta[];
  onChanged: () => void;
}

export default function AttachmentSection({ ticketNumber, attachments, onChanged }: Props) {
  const { activeRequester } = useDevRequester();
  const [pending, setPending] = useState<Array<{id:string,name:string,size:number,error?:string,uploading?:boolean}>>([]);
  const [confirmId, setConfirmId] = useState<number|null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const [localRemoved, setLocalRemoved] = useState<Set<number>>(new Set());
  const displayAttachments = attachments.map(a=> localRemoved.has(a.id)? {...a, removedAt: new Date().toISOString()}: a);
  const activeCount = displayAttachments.filter(a=>!a.removedAt).length;
  const limitReached = activeCount >= MAX_ACTIVE;

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
        await uploadAttachment(ticketNumber, f, activeRequester!.id);
        setPending(cur=>cur.filter(p=>p.id!==pid));
        onChanged();
      } catch (e:any) {
        const msg = e?.body?.error || e?.message || 'Upload failed';
        setPending(cur=>cur.map(p=>p.id===pid? {...p, uploading:false, error:msg}:p));
      }
    }
    setPending(next.filter(p=> !p.uploading || p.error));
    // dedup: we already handled uploading ones via async
    setPending(prev=>prev);
  }

  // For test, expose limit flow: if active already 5, picker disabled
  return (
    <section aria-label="Attachments">
      <h2 className="tok-section-label">Attachments ({activeCount})</h2>
      <div className={`tok-dropzone ${limitReached?'disabled':''}`}>
        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,.pdf"
          multiple
          disabled={limitReached}
          onChange={e=>{ if(e.target.files) handleFiles(e.target.files); e.target.value=''; }}
          data-testid="attachment-input"
        />
        {limitReached && <p>Attachment limit reached (5 max)</p>}
      </div>
      <div className="tok-chips">
        {displayAttachments.map(att=>{
          const removed = !!att.removedAt;
          return (
            <span key={att.id} className={`tok-chip attachment-chip ${removed?'removed grayed':''}`} style={removed?{textDecoration:'line-through', opacity:0.6}:undefined}>
              {removed ? <span>{att.fileName}</span> : <a href={`${ticketNumber}/attachments/${att.id}/download`}>{att.fileName}</a>}
              <span className="size">{fmtSize(att.sizeBytes)}</span>
              {!removed && confirmId!==att.id && <button type="button" onClick={()=>setConfirmId(att.id)}>Remove</button>}
              {!removed && confirmId===att.id && (
                <span>
                  <span>Remove this attachment?</span>
                  <button type="button" onClick={async()=>{
                    await deleteAttachment(ticketNumber, att.id, activeRequester!.id);
                    setConfirmId(null);
                    setLocalRemoved(prev=> new Set([...prev, att.id]));
                    onChanged();
                  }}>Confirm</button>
                  <button type="button" onClick={()=>setConfirmId(null)}>Cancel</button>
                </span>
              )}
              {removed && <span className="removed-badge">Removed</span>}
            </span>
          );
        })}
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
  );
}
