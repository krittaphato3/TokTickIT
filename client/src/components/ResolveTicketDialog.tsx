import { useEffect, useRef } from 'react';

// Lab 4 (L4-3) — the Resolve dialog (ui-spec §5).
//
// Accessible modal: labelled by its heading, focus moves to the summary field
// when it opens, Escape closes it (unless a write is in flight) and Tab is
// trapped inside. It renders one row per `reasons[]` entry a 422
// RESOLUTION_GATE response returned — each row is announced, never colour-only —
// and it stays open with whatever the user typed when a write is refused
// (AC-10/AC-12).
//
// The dialog never decides whether resolving is allowed: the server's gate and
// the matrix remain the authority. It only collects the summary and shows the
// answer.

// ui-spec §5 copy. These stay local to the component (not exported) so the file
// exports exactly one component and Fast refresh keeps working.
const GATE_NOTE =
  'Resolution requires at least one recorded action, no outstanding follow-up, and a summary.';

const GATE_REASON_TEXT: Record<string, string> = {
  NO_ACTIONS: 'Record at least one action before resolving this ticket.',
  OPEN_FOLLOW_UP: 'An action still has follow-up required.',
  MISSING_SUMMARY: 'Add a resolution summary.',
};

const MAX_RESOLUTION_SUMMARY_LENGTH = 2000;

interface Props {
  ticketNumber: string;
  requesterName: string;
  summary: string;
  reasons: string[];
  error: string;
  busy: boolean;
  // A 409 puts the conflict copy AND its Reload action inside the dialog: while
  // this modal is open the banner behind it is not reachable, so the recovery
  // path has to live where the user is looking.
  conflict: boolean;
  onSummaryChange: (value: string) => void;
  onSubmit: () => void;
  onReload: () => void;
  onClose: () => void;
}

export default function ResolveTicketDialog({
  ticketNumber,
  requesterName,
  summary,
  reasons,
  error,
  busy,
  conflict,
  onSummaryChange,
  onSubmit,
  onReload,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const summaryRef = useRef<HTMLTextAreaElement | null>(null);

  // Focus the field the user came here to fill in.
  useEffect(() => {
    summaryRef.current?.focus();
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      if (!busy) {
        e.stopPropagation();
        onClose();
      }
      return;
    }
    if (e.key !== 'Tab') return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'textarea, button:not([disabled])',
    );
    if (!focusable || focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="td-modal-backdrop"
      role="presentation"
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        ref={dialogRef}
        className="td-modal std-resolve-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="std-resolve-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <h2 id="std-resolve-title">Resolve ticket</h2>
        <p className="td-caption std-resolve-recap">
          {ticketNumber} · {requesterName}
        </p>
        <p className="td-hint">{GATE_NOTE}</p>

        <label htmlFor="std-resolve-summary">Resolution summary</label>
        <textarea
          id="std-resolve-summary"
          ref={summaryRef}
          className="td-composer-input std-resolve-summary"
          value={summary}
          disabled={busy}
          maxLength={MAX_RESOLUTION_SUMMARY_LENGTH}
          aria-invalid={error ? true : undefined}
          onChange={(e) => onSummaryChange(e.target.value)}
        />
        <p className="td-caption">
          {MAX_RESOLUTION_SUMMARY_LENGTH - summary.trim().length} characters left
        </p>

        {error ? (
          <p className="td-post-error" role="alert">
            {error}
          </p>
        ) : null}

        {reasons.length > 0 ? (
          <ul className="std-gate-reasons">
            {reasons.map((reason) => (
              <li key={reason} role="alert" className="std-gate-reason">
                <span aria-hidden="true">⚠</span> {GATE_REASON_TEXT[reason] ?? reason}
              </li>
            ))}
          </ul>
        ) : null}

        <div className="td-modal-actions">
          <button
            type="button"
            className="tok-btn primary"
            disabled={busy}
            aria-busy={busy}
            onClick={onSubmit}
          >
            {busy ? 'Resolving…' : 'Resolve ticket'}
          </button>
          {conflict ? (
            <button type="button" className="tok-btn secondary" disabled={busy} onClick={onReload}>
              Reload
            </button>
          ) : null}
          <button type="button" className="tok-btn secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
