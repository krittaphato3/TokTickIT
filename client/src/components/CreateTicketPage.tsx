import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ApiError,
  createTicket,
  getCategories,
  getRelatedSystems,
  type Category,
  type Priority,
  type RelatedSystem,
} from '../api';
import { useDevRequester } from '../devRequesterContext';
import AttachmentPicker from './AttachmentPicker';
import {
  FIELD_ORDER,
  validateCreateTicketInput,
  type FieldIssue,
} from '../ticketValidation';

type LoadState = 'loading' | 'ready' | 'error';

// Issue #14 — Create Ticket screen, pixel-matched to the approved mockup
// (docs/mockups/create-ticket.html). Behavior per api-spec/specification.
export default function CreateTicketPage({
  onCreated,
}: {
  onCreated?: (ticketNumber: string) => void;
}) {
  const { activeRequester } = useDevRequester();

  const [categories, setCategories] = useState<Category[]>([]);
  const [systems, setSystems] = useState<RelatedSystem[]>([]);
  const [loadState, setLoadState] = useState<LoadState>('loading');

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [relatedSystemId, setRelatedSystemId] = useState('');
  const [priority, setPriority] = useState<Priority>('MEDIUM');

  const [issues, setIssues] = useState<FieldIssue[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [createdNumber, setCreatedNumber] = useState<string | null>(null);

  async function loadLookups() {
    setLoadState('loading');
    try {
      const [cats, sys] = await Promise.all([
        getCategories(),
        getRelatedSystems(),
      ]);
      setCategories(cats);
      setSystems(sys);
      setLoadState('ready');
    } catch {
      setLoadState('error');
    }
  }

  useEffect(() => {
    void loadLookups();
  }, []);

  const invalidFields = useMemo(
    () => new Set(issues.map((i) => i.field)),
    [issues],
  );

  function issueFor(field: FieldIssue['field']) {
    return issues.find((i) => i.field === field)?.message;
  }

  function focusFirstInvalid(nextIssues: FieldIssue[]) {
    const refId = {
      title: 'title',
      description: 'description',
      categoryId: 'category',
      relatedSystemId: 'relatedSystem',
      priority: 'priority',
    }[FIELD_ORDER.find((f) => nextIssues.some((i) => i.field === f)) ?? 'title'];
    document.getElementById(refId)?.focus();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return; // BR-12 — double-clicks are ignored.

    setSubmitError(null);
    const candidate = {
      title,
      description: description || undefined,
      categoryId: Number(categoryId),
      priority,
      relatedSystemId: Number(relatedSystemId),
    };
    const nextIssues = validateCreateTicketInput(candidate);
    setIssues(nextIssues);
    if (nextIssues.length > 0) {
      focusFirstInvalid(nextIssues);
      return; // No API call when client validation fails.
    }

    setSubmitting(true);
    try {
      const ticket = await createTicket(
        { ...candidate, title: title.trim() },
        activeRequester?.id ?? 0,
      );
      setCreatedNumber(ticket.ticketNumber);
      onCreated?.(ticket.ticketNumber);
    } catch (err) {
      if (err instanceof ApiError && err.body.details) {
        const mapped = err.body.details
          .filter((d) =>
            FIELD_ORDER.includes(d.field as FieldIssue['field']),
          )
          .map((d) => ({
            field: d.field as FieldIssue['field'],
            message: d.message,
          }));
        // Only surface convergence errors as inline field messages; rely on
        // the banner for the rest.
        const fieldIssues = mapped.filter((d) =>
          ['title', 'categoryId', 'relatedSystemId'].includes(d.field),
        );
        setIssues(fieldIssues);
      }
      setSubmitError(err instanceof Error ? err.message : 'Unexpected error');
    } finally {
      setSubmitting(false);
    }
  }

  function resetForm() {
    setTitle('');
    setDescription('');
    setCategoryId('');
    setRelatedSystemId('');
    setPriority('MEDIUM');
    setIssues([]);
    setSubmitError(null);
  }

  if (loadState === 'loading') {
    return (
      <main className="tok-main tok-create-page" aria-busy="true">
        <nav className="tok-breadcrumb" aria-label="Breadcrumb">
          <a href="#/tickets">My Tickets</a>
          <span className="sep">/</span>
          <span className="current">New</span>
        </nav>
        <h1 className="tok-page-title">Create Ticket</h1>
        <div className="tok-card tok-create-card" aria-busy="true">
          <div className="tt-skeleton tt-skeleton-lg" />
          <div className="tt-skeleton" />
          <div className="tt-skeleton tt-skeleton-sm" />
        </div>
      </main>
    );
  }

  if (loadState === 'error') {
    return (
      <main className="tok-main tok-create-page">
        <nav className="tok-breadcrumb" aria-label="Breadcrumb">
          <a href="#/tickets">My Tickets</a>
          <span className="sep">/</span>
          <span className="current">New</span>
        </nav>
        <h1 className="tok-page-title">Create Ticket</h1>
        <div className="tok-alert error" role="alert">
          Could not load the form data.{' '}
          <button type="button" className="tok-browse" onClick={() => void loadLookups()}>
            Try again
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="tok-main tok-create-page">
      <nav className="tok-breadcrumb" aria-label="Breadcrumb">
        <a href="#/tickets">My Tickets</a>
        <span className="sep">/</span>
        <span className="current">New</span>
      </nav>
      <h1 className="tok-page-title">Create Ticket</h1>

      <form className="tok-card tok-create-card" onSubmit={handleSubmit} noValidate>
        {/* Hidden-by-default alert slot; surfaces on success/failure. */}
        {createdNumber && (
          <div className="tok-alert success" role="status" data-alert="success">
            <span aria-hidden="true">✓</span> Ticket created — official number{' '}
            <strong className="tok-ticket-number">{createdNumber}</strong>{' '}
            assigned.
          </div>
        )}
        {submitError && (
          <div className="tok-alert error" role="alert" data-alert="error">
            <span aria-hidden="true">!</span>{' '}
            {submitError}
            <button
              type="button"
              className="tok-browse"
              onClick={() => {
                const form = document.getElementById('createForm');
                form?.dispatchEvent(new Event('submit', { cancelable: true }));
              }}
            >
              Try again
            </button>
          </div>
        )}

        {/* REQUESTER CONTEXT */}
        <section aria-label="Requester context">
          <h2 className="tok-section-label">Requester context</h2>
          <div className="tok-grid-2">
            <div className="tok-field">
              <label className="tok-label" htmlFor="requester">
                Requester
              </label>
              <input
                className="tok-input tok-readonly"
                id="requester"
                readOnly
                tabIndex={-1}
                value={activeRequester?.name ?? ''}
              />
              <p className="tok-hint">
                Testing only — not real authentication
              </p>
            </div>
            <div className="tok-field">
              <label className="tok-label" htmlFor="priority">
                Requested Priority
              </label>
              <select
                className="tok-select"
                id="priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
          </div>
        </section>

        <hr className="tok-divider" />

        {/* CLASSIFICATION */}
        <section aria-label="Classification">
          <h2 className="tok-section-label">Classification</h2>
          <div className="tok-grid-2">
            <div
              className={`tok-field${invalidFields.has('categoryId') ? ' invalid' : ''}`}
            >
              <label className="tok-label" htmlFor="category">
                Category <span className="tok-req" aria-hidden="true">*</span>
              </label>
              <select
                className="tok-select"
                id="category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                aria-required="true"
                aria-invalid={invalidFields.has('categoryId') ? true : undefined}
                aria-describedby={
                  invalidFields.has('categoryId')
                    ? 'error-categoryId'
                    : undefined
                }
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {issueFor('categoryId') && (
                <p className="tok-err" id="error-categoryId">
                  <span aria-hidden="true">!</span> {issueFor('categoryId')}
                </p>
              )}
            </div>
            <div
              className={`tok-field${invalidFields.has('relatedSystemId') ? ' invalid' : ''}`}
            >
              <label className="tok-label" htmlFor="relatedSystem">
                Related System{' '}
                <span className="tok-req" aria-hidden="true">*</span>
              </label>
              <select
                className="tok-select"
                id="relatedSystem"
                value={relatedSystemId}
                onChange={(e) => setRelatedSystemId(e.target.value)}
                aria-required="true"
                aria-invalid={
                  invalidFields.has('relatedSystemId') ? true : undefined
                }
                aria-describedby={
                  invalidFields.has('relatedSystemId')
                    ? 'error-relatedSystemId'
                    : undefined
                }
              >
                <option value="">Select a related system…</option>
                {systems.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              {issueFor('relatedSystemId') && (
                <p className="tok-err" id="error-relatedSystemId">
                  <span aria-hidden="true">!</span> {issueFor('relatedSystemId')}
                </p>
              )}
            </div>
          </div>
        </section>

        <hr className="tok-divider" />

        {/* DETAILS */}
        <section aria-label="Details">
          <h2 className="tok-section-label">Details</h2>
          <div
            className={`tok-field${invalidFields.has('title') ? ' invalid' : ''}`}
            style={{ marginBottom: '1.25rem' }}
          >
            <label className="tok-label" htmlFor="title">
              Title <span className="tok-req" aria-hidden="true">*</span>
            </label>
            <input
              className="tok-input"
              id="title"
              placeholder="One line that sums the problem"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-required="true"
              aria-invalid={invalidFields.has('title') ? true : undefined}
              aria-describedby={
                invalidFields.has('title') ? 'error-title' : undefined
              }
            />
            {issueFor('title') && (
              <p className="tok-err" id="error-title">
                <span aria-hidden="true">!</span> {issueFor('title')}
              </p>
            )}
          </div>
          <div
            className={`tok-field${invalidFields.has('description') ? ' invalid' : ''}`}
          >
            <label className="tok-label" htmlFor="description">
              Description
            </label>
            <textarea
              className="tok-textarea"
              id="description"
              placeholder="What happened, when, and what you already tried…"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              aria-describedby={
                invalidFields.has('description')
                  ? 'error-description'
                  : 'description-hint'
              }
            />
            <p className="tok-hint" id="description-hint">
              Optional, up to 4,000 characters
            </p>
            {issueFor('description') && (
              <p className="tok-err" id="error-description">
                <span aria-hidden="true">!</span> {issueFor('description')}
              </p>
            )}
          </div>
        </section>

        <hr className="tok-divider" />

        {/* ATTACHMENTS */}
        <section aria-label="Attachments">
          <h2 className="tok-section-label">
            Attachments{' '}
            <span className="tok-section-note">
              · optional · up to 5 files · 5 MB each
            </span>
          </h2>
          <AttachmentPicker disabled={submitting} />
        </section>

        <div className="tok-actions">
          <button type="button" className="tok-btn secondary" onClick={resetForm}>
            Cancel
          </button>
          <button
            type="submit"
            className="tok-btn primary"
            disabled={submitting}
            aria-busy={submitting}
          >
            {submitting ? (
              <>
                <span className="tok-spinner" aria-hidden="true" /> Submitting…
              </>
            ) : (
              'Submit Ticket'
            )}
          </button>
        </div>
      </form>
    </main>
  );
}