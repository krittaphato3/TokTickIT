import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  type ActionTaken,
  getTicketActions,
  createTicketAction,
  updateTicketAction,
  ApiError,
} from '../api';
import '../styles/actions-taken.css';

interface ActionsTakenProps {
  ticketNumber: string;
  ticketCreatedAt?: string;
  isStaff: boolean;
  onActionSaved?: () => Promise<unknown> | void;
}

interface ActionFormState {
  actionAt: string;
  description: string;
  result: string;
  followUpRequired: boolean;
  followUpNote: string;
  attachmentNotes: string;
}

function toLocalIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  const hh = pad(date.getHours());
  const mm = pad(date.getMinutes());
  return `${y}-${m}-${d}T${hh}:${mm}`;
}

function fmtDisplayDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export const ActionsTaken: React.FC<ActionsTakenProps> = ({
  ticketNumber,
  ticketCreatedAt,
  isStaff,
  onActionSaved,
}) => {
  const [actions, setActions] = useState<ActionTaken[]>([]);
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [loadError, setLoadError] = useState<string>('');

  // Create mode state
  const [isCreating, setIsCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<ActionFormState>({
    actionAt: toLocalIso(new Date()),
    description: '',
    result: '',
    followUpRequired: false,
    followUpNote: '',
    attachmentNotes: '',
  });
  const [createErrors, setCreateErrors] = useState<Record<string, string>>({});
  const [createBusy, setCreateBusy] = useState(false);
  const [createBanner, setCreateBanner] = useState<{ kind: 'error' | 'conflict'; text: string } | null>(null);
  const [clientRequestId, setClientRequestId] = useState<string>('');

  // Edit mode state (per row)
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState<ActionFormState>({
    actionAt: '',
    description: '',
    result: '',
    followUpRequired: false,
    followUpNote: '',
    attachmentNotes: '',
  });
  const [editVersion, setEditVersion] = useState<number>(1);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [editBusy, setEditBusy] = useState(false);
  const [editBanner, setEditBanner] = useState<{ kind: 'error' | 'conflict'; text: string } | null>(null);

  // Global section success notification
  const [successBanner, setSuccessBanner] = useState<string | null>(null);

  const descRef = useRef<HTMLTextAreaElement>(null);
  const editDescRef = useRef<HTMLTextAreaElement>(null);

  const loadActions = useCallback(async () => {
    try {
      setLoadState('loading');
      setLoadError('');
      const list = await getTicketActions(ticketNumber);
      setActions(list);
      setLoadState('ready');
    } catch (err) {
      setLoadState('error');
      setLoadError(err instanceof ApiError ? err.body.error ?? err.message : 'Could not load actions.');
    }
  }, [ticketNumber]);

  useEffect(() => {
    void loadActions();
  }, [loadActions]);

  const openCreate = () => {
    setIsCreating(true);
    setCreateDraft({
      actionAt: toLocalIso(new Date()),
      description: '',
      result: '',
      followUpRequired: false,
      followUpNote: '',
      attachmentNotes: '',
    });
    setCreateErrors({});
    setCreateBanner(null);
    setSuccessBanner(null);
    setClientRequestId(typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `req-${Date.now()}`);
  };

  const closeCreate = () => {
    setIsCreating(false);
    setCreateErrors({});
    setCreateBanner(null);
  };

  const validateForm = (draft: ActionFormState): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (!draft.description.trim()) {
      errs.description = 'Description is required.';
    } else if (draft.description.trim().length > 2000) {
      errs.description = 'Description cannot exceed 2000 characters.';
    }

    if (!draft.result.trim()) {
      errs.result = 'Result is required.';
    } else if (draft.result.trim().length > 2000) {
      errs.result = 'Result cannot exceed 2000 characters.';
    }

    if (draft.followUpRequired) {
      if (!draft.followUpNote.trim()) {
        errs.followUpNote = 'Follow-up note is required when follow-up is on.';
      } else if (draft.followUpNote.trim().length > 1000) {
        errs.followUpNote = 'Follow-up note cannot exceed 1000 characters.';
      }
    }

    if (draft.attachmentNotes && draft.attachmentNotes.trim().length > 500) {
      errs.attachmentNotes = 'Attachment notes cannot exceed 500 characters.';
    }

    if (draft.actionAt) {
      const actionDate = new Date(draft.actionAt).getTime();
      const fiveMinsFuture = Date.now() + 5 * 60 * 1000;
      if (actionDate > fiveMinsFuture) {
        errs.actionAt = 'Action date cannot be more than 5 minutes in the future.';
      }
      if (ticketCreatedAt) {
        const createdDate = new Date(ticketCreatedAt).getTime();
        if (actionDate < createdDate) {
          errs.actionAt = 'Action date cannot be earlier than ticket creation time.';
        }
      }
    }

    return errs;
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (createBusy) return;

    setCreateBanner(null);
    const validationErrs = validateForm(createDraft);
    if (Object.keys(validationErrs).length > 0) {
      setCreateErrors(validationErrs);
      if (validationErrs.description) descRef.current?.focus();
      return;
    }
    setCreateErrors({});
    setCreateBusy(true);

    try {
      const created = await createTicketAction(ticketNumber, {
        actionAt: createDraft.actionAt ? new Date(createDraft.actionAt).toISOString() : undefined,
        description: createDraft.description.trim(),
        result: createDraft.result.trim(),
        followUpRequired: createDraft.followUpRequired,
        followUpNote: createDraft.followUpRequired ? createDraft.followUpNote.trim() : null,
        attachmentNotes: createDraft.attachmentNotes.trim() || null,
        clientRequestId,
      });

      setActions((prev) => [created, ...prev.filter((a) => a.id !== created.id)]);
      setIsCreating(false);
      setSuccessBanner('Action recorded.');
      if (onActionSaved) {
        await onActionSaved();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setCreateBanner({ kind: 'conflict', text: 'This action conflict was reported. Please review and try again.' });
      } else if (err instanceof ApiError && err.status === 400) {
        const map: Record<string, string> = {};
        for (const d of err.body.details ?? []) map[d.field] = d.message;
        setCreateErrors(map);
        setCreateBanner({ kind: 'error', text: err.body.error ?? 'Validation failed.' });
      } else if (err instanceof ApiError) {
        setCreateBanner({ kind: 'error', text: err.body.error ?? err.message });
      } else {
        setCreateBanner({ kind: 'error', text: 'A network error occurred while saving the action.' });
      }
    } finally {
      setCreateBusy(false);
    }
  };

  const startEdit = (action: ActionTaken) => {
    setEditingId(action.id);
    setEditVersion(action.version);
    setEditDraft({
      actionAt: toLocalIso(new Date(action.actionAt)),
      description: action.description,
      result: action.result,
      followUpRequired: action.followUpRequired,
      followUpNote: action.followUpNote ?? '',
      attachmentNotes: action.attachmentNotes ?? '',
    });
    setEditErrors({});
    setEditBanner(null);
    setSuccessBanner(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditErrors({});
    setEditBanner(null);
  };

  const reloadConflict = async (actionId: number) => {
    try {
      const latestList = await getTicketActions(ticketNumber);
      setActions(latestList);
      const target = latestList.find((a) => a.id === actionId);
      if (target) {
        setEditVersion(target.version);
        setEditBanner(null);
      }
    } catch {
      // Keep state if reload fails
    }
  };

  const handleEditSubmit = async (e: React.FormEvent, actionId: number) => {
    e.preventDefault();
    if (editBusy) return;

    setEditBanner(null);
    const validationErrs = validateForm(editDraft);
    if (Object.keys(validationErrs).length > 0) {
      setEditErrors(validationErrs);
      if (validationErrs.description) editDescRef.current?.focus();
      return;
    }
    setEditErrors({});
    setEditBusy(true);

    try {
      const updated = await updateTicketAction(ticketNumber, actionId, {
        expectedVersion: editVersion,
        actionAt: editDraft.actionAt ? new Date(editDraft.actionAt).toISOString() : undefined,
        description: editDraft.description.trim(),
        result: editDraft.result.trim(),
        followUpRequired: editDraft.followUpRequired,
        followUpNote: editDraft.followUpRequired ? editDraft.followUpNote.trim() : null,
        attachmentNotes: editDraft.attachmentNotes.trim() || null,
      });

      setActions((prev) => prev.map((a) => (a.id === actionId ? updated : a)));
      setEditingId(null);
      setSuccessBanner('Action updated.');
      if (onActionSaved) {
        await onActionSaved();
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setEditBanner({
          kind: 'conflict',
          text: 'This action was changed by someone else. Your version is out of date — reload to continue.',
        });
        if (err.body.currentVersion) {
          setEditVersion(err.body.currentVersion);
        }
      } else if (err instanceof ApiError && err.status === 400) {
        const map: Record<string, string> = {};
        for (const d of err.body.details ?? []) map[d.field] = d.message;
        setEditErrors(map);
        setEditBanner({ kind: 'error', text: err.body.error ?? 'Validation failed.' });
      } else if (err instanceof ApiError) {
        setEditBanner({ kind: 'error', text: err.body.error ?? err.message });
      } else {
        setEditBanner({ kind: 'error', text: 'A network error occurred while updating the action.' });
      }
    } finally {
      setEditBusy(false);
    }
  };

  return (
    <section className="at-section" role="region" aria-labelledby="actions-taken-heading">
      <div className="at-header">
        <div className="at-title-wrap">
          <h2 id="actions-taken-heading" className="at-title">
            Actions Taken <span className="at-count-badge">{actions.length}</span>
          </h2>
          <span className="at-order-caption">Sorted by action date/time (newest first)</span>
        </div>
        {isStaff && !isCreating && (
          <button
            type="button"
            className="tok-btn primary"
            onClick={openCreate}
          >
            Record action
          </button>
        )}
      </div>

      {successBanner && (
        <div className="at-banner at-banner-success" role="status" aria-live="polite">
          <span>{successBanner}</span>
          <button type="button" className="tok-btn text" onClick={() => setSuccessBanner(null)}>✕</button>
        </div>
      )}

      {/* Staff Create Form */}
      {isStaff && isCreating && (
        <div className="at-form-panel">
          <div className="at-mode-banner">
            <span>➕ New action</span>
          </div>

          {createBanner && (
            <div className={`at-banner at-banner-${createBanner.kind}`} role="alert">
              <span>{createBanner.text}</span>
            </div>
          )}

          <form onSubmit={handleCreateSubmit} noValidate>
            <div className="at-form-grid">
              <div className="at-form-group">
                <label htmlFor="at-create-date">
                  Action date/time <span className="at-req-star" aria-hidden="true">*</span>
                </label>
                <input
                  id="at-create-date"
                  type="datetime-local"
                  className="at-form-control"
                  value={createDraft.actionAt}
                  disabled={createBusy}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, actionAt: e.target.value }))}
                  aria-invalid={Boolean(createErrors.actionAt)}
                  aria-describedby={createErrors.actionAt ? 'at-create-date-err' : undefined}
                />
                {createErrors.actionAt && (
                  <span id="at-create-date-err" className="at-field-error">{createErrors.actionAt}</span>
                )}
              </div>

              <div className="at-form-group">
                <label>Performed by</label>
                <div className="at-form-control" style={{ backgroundColor: 'var(--tok-field-readonly)' }}>
                  Current User (automatic)
                </div>
              </div>

              <div className="at-form-group at-form-full">
                <label htmlFor="at-create-desc">
                  Description <span className="at-req-star" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="at-create-desc"
                  ref={descRef}
                  className="at-form-control"
                  rows={3}
                  value={createDraft.description}
                  disabled={createBusy}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Detail the work carried out..."
                  aria-invalid={Boolean(createErrors.description)}
                  aria-describedby={createErrors.description ? 'at-create-desc-err' : undefined}
                />
                {createErrors.description && (
                  <span id="at-create-desc-err" className="at-field-error">{createErrors.description}</span>
                )}
              </div>

              <div className="at-form-group at-form-full">
                <label htmlFor="at-create-result">
                  Result <span className="at-req-star" aria-hidden="true">*</span>
                </label>
                <textarea
                  id="at-create-result"
                  className="at-form-control"
                  rows={3}
                  value={createDraft.result}
                  disabled={createBusy}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, result: e.target.value }))}
                  placeholder="Outcome of this action..."
                  aria-invalid={Boolean(createErrors.result)}
                  aria-describedby={createErrors.result ? 'at-create-result-err' : undefined}
                />
                {createErrors.result && (
                  <span id="at-create-result-err" className="at-field-error">{createErrors.result}</span>
                )}
              </div>

              <div className="at-form-group at-form-full">
                <div className="at-switch-group">
                  <input
                    id="at-create-followup"
                    type="checkbox"
                    checked={createDraft.followUpRequired}
                    disabled={createBusy}
                    onChange={(e) =>
                      setCreateDraft((d) => ({
                        ...d,
                        followUpRequired: e.target.checked,
                        followUpNote: e.target.checked ? d.followUpNote : '',
                      }))
                    }
                  />
                  <label htmlFor="at-create-followup" className="at-switch-label">
                    Follow-up required?
                  </label>
                </div>
              </div>

              {createDraft.followUpRequired && (
                <div className="at-form-group at-form-full">
                  <label htmlFor="at-create-followup-note">
                    Follow-up note <span className="at-req-star" aria-hidden="true">*</span>
                  </label>
                  <textarea
                    id="at-create-followup-note"
                    className="at-form-control"
                    rows={2}
                    value={createDraft.followUpNote}
                    disabled={createBusy}
                    onChange={(e) => setCreateDraft((d) => ({ ...d, followUpNote: e.target.value }))}
                    placeholder="What follow-up is needed..."
                    aria-invalid={Boolean(createErrors.followUpNote)}
                    aria-describedby={createErrors.followUpNote ? 'at-create-fn-err' : undefined}
                  />
                  {createErrors.followUpNote && (
                    <span id="at-create-fn-err" className="at-field-error">{createErrors.followUpNote}</span>
                  )}
                </div>
              )}

              <div className="at-form-group at-form-full">
                <label htmlFor="at-create-attachment-notes">Attachment notes</label>
                <input
                  id="at-create-attachment-notes"
                  type="text"
                  className="at-form-control"
                  value={createDraft.attachmentNotes}
                  disabled={createBusy}
                  onChange={(e) => setCreateDraft((d) => ({ ...d, attachmentNotes: e.target.value }))}
                  placeholder="Name the file or image to look for — for example screenshot-login-error.png"
                />
                <span className="at-field-hint">Name the file or image to look for — for example screenshot-login-error.png</span>
                {createErrors.attachmentNotes && (
                  <span className="at-field-error">{createErrors.attachmentNotes}</span>
                )}
              </div>
            </div>

            <div className="at-form-actions">
              <button
                type="submit"
                className="tok-btn primary"
                disabled={createBusy}
              >
                {createBusy ? 'Saving…' : 'Save action'}
              </button>
              <button
                type="button"
                className="tok-btn secondary"
                disabled={createBusy}
                onClick={closeCreate}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Main Content: Loading, Error, Empty, or List */}
      {loadState === 'loading' && (
        <div className="tt-skeleton" role="status" aria-label="Loading actions" style={{ minHeight: '80px' }} />
      )}

      {loadState === 'error' && (
        <div className="at-banner at-banner-error" role="alert">
          <span>{loadError}</span>
          <button type="button" className="tok-btn secondary" onClick={() => void loadActions()}>Try again</button>
        </div>
      )}

      {loadState === 'ready' && actions.length === 0 && (
        <div className="at-empty-state">
          <p>No actions recorded yet.</p>
          {!isStaff && <p className="at-empty-hint">IT staff will record the work here.</p>}
        </div>
      )}

      {loadState === 'ready' && actions.length > 0 && (
        <>
          {/* Desktop & Tablet Table */}
          <div className="at-table-wrap">
            <table className="at-table" aria-label="Actions Taken list">
              <thead>
                <tr>
                  <th scope="col">Action date/time</th>
                  <th scope="col">Description</th>
                  <th scope="col">Result</th>
                  <th scope="col">Performed by</th>
                  <th scope="col">Follow-up</th>
                  <th scope="col">Attachment notes</th>
                  {isStaff && <th scope="col">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {actions.map((act) => {
                  const isEditing = editingId === act.id;
                  if (isEditing) {
                    return (
                      <tr key={act.id} className="at-edit-row">
                        <td colSpan={isStaff ? 7 : 6}>
                          <div className="at-form-panel" style={{ margin: 0 }}>
                            <div className="at-mode-banner">
                              <span>✏️ Editing action</span>
                            </div>

                            {editBanner && (
                              <div className={`at-banner at-banner-${editBanner.kind}`} role="alert">
                                <span>{editBanner.text}</span>
                                {editBanner.kind === 'conflict' && (
                                  <button
                                    type="button"
                                    className="tok-btn secondary"
                                    onClick={() => void reloadConflict(act.id)}
                                  >
                                    Reload latest
                                  </button>
                                )}
                              </div>
                            )}

                            <form onSubmit={(e) => void handleEditSubmit(e, act.id)} noValidate>
                              <div className="at-form-grid">
                                <div className="at-form-group">
                                  <label htmlFor={`at-edit-date-${act.id}`}>Action date/time</label>
                                  <input
                                    id={`at-edit-date-${act.id}`}
                                    type="datetime-local"
                                    className="at-form-control"
                                    value={editDraft.actionAt}
                                    disabled={editBusy}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, actionAt: e.target.value }))}
                                  />
                                </div>
                                <div className="at-form-group">
                                  <label>Performed by</label>
                                  <div className="at-form-control" style={{ backgroundColor: 'var(--tok-field-readonly)' }}>
                                    {act.performedBy.name} (read-only)
                                  </div>
                                </div>
                                <div className="at-form-group at-form-full">
                                  <label htmlFor={`at-edit-desc-${act.id}`}>
                                    Description <span className="at-req-star" aria-hidden="true">*</span>
                                  </label>
                                  <textarea
                                    id={`at-edit-desc-${act.id}`}
                                    ref={editDescRef}
                                    className="at-form-control"
                                    rows={3}
                                    value={editDraft.description}
                                    disabled={editBusy}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                                    aria-invalid={Boolean(editErrors.description)}
                                    aria-describedby={editErrors.description ? `at-edit-desc-err-${act.id}` : undefined}
                                  />
                                  {editErrors.description && (
                                    <span id={`at-edit-desc-err-${act.id}`} className="at-field-error">
                                      {editErrors.description}
                                    </span>
                                  )}
                                </div>
                                <div className="at-form-group at-form-full">
                                  <label htmlFor={`at-edit-result-${act.id}`}>
                                    Result <span className="at-req-star" aria-hidden="true">*</span>
                                  </label>
                                  <textarea
                                    id={`at-edit-result-${act.id}`}
                                    className="at-form-control"
                                    rows={3}
                                    value={editDraft.result}
                                    disabled={editBusy}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, result: e.target.value }))}
                                    aria-invalid={Boolean(editErrors.result)}
                                    aria-describedby={editErrors.result ? `at-edit-res-err-${act.id}` : undefined}
                                  />
                                  {editErrors.result && (
                                    <span id={`at-edit-res-err-${act.id}`} className="at-field-error">
                                      {editErrors.result}
                                    </span>
                                  )}
                                </div>
                                <div className="at-form-group at-form-full">
                                  <div className="at-switch-group">
                                    <input
                                      id={`at-edit-followup-${act.id}`}
                                      type="checkbox"
                                      checked={editDraft.followUpRequired}
                                      disabled={editBusy}
                                      onChange={(e) =>
                                        setEditDraft((d) => ({
                                          ...d,
                                          followUpRequired: e.target.checked,
                                          followUpNote: e.target.checked ? d.followUpNote : '',
                                        }))
                                      }
                                    />
                                    <label htmlFor={`at-edit-followup-${act.id}`} className="at-switch-label">
                                      Follow-up required?
                                    </label>
                                  </div>
                                </div>
                                {editDraft.followUpRequired && (
                                  <div className="at-form-group at-form-full">
                                    <label htmlFor={`at-edit-fn-${act.id}`}>
                                      Follow-up note <span className="at-req-star" aria-hidden="true">*</span>
                                    </label>
                                    <textarea
                                      id={`at-edit-fn-${act.id}`}
                                      className="at-form-control"
                                      rows={2}
                                      value={editDraft.followUpNote}
                                      disabled={editBusy}
                                      onChange={(e) => setEditDraft((d) => ({ ...d, followUpNote: e.target.value }))}
                                      aria-invalid={Boolean(editErrors.followUpNote)}
                                      aria-describedby={editErrors.followUpNote ? `at-edit-fn-err-${act.id}` : undefined}
                                    />
                                    {editErrors.followUpNote && (
                                      <span id={`at-edit-fn-err-${act.id}`} className="at-field-error">
                                        {editErrors.followUpNote}
                                      </span>
                                    )}
                                  </div>
                                )}
                                <div className="at-form-group at-form-full">
                                  <label htmlFor={`at-edit-an-${act.id}`}>Attachment notes</label>
                                  <input
                                    id={`at-edit-an-${act.id}`}
                                    type="text"
                                    className="at-form-control"
                                    value={editDraft.attachmentNotes}
                                    disabled={editBusy}
                                    onChange={(e) => setEditDraft((d) => ({ ...d, attachmentNotes: e.target.value }))}
                                  />
                                </div>
                              </div>
                              <div className="at-form-actions">
                                <button type="submit" className="tok-btn primary" disabled={editBusy}>
                                  {editBusy ? 'Saving…' : 'Save changes'}
                                </button>
                                <button type="button" className="tok-btn secondary" disabled={editBusy} onClick={cancelEdit}>
                                  Cancel
                                </button>
                              </div>
                            </form>
                          </div>
                        </td>
                      </tr>
                    );
                  }

                  return (
                    <tr key={act.id}>
                      <td className="at-ro-cell" style={{ whiteSpace: 'nowrap' }}>
                        {fmtDisplayDate(act.actionAt)}
                      </td>
                      <td className="at-ro-warm">{act.description}</td>
                      <td className="at-ro-warm">{act.result}</td>
                      <td className="at-ro-cell">{act.performedBy.name}</td>
                      <td>
                        {act.followUpRequired ? (
                          <div>
                            <span className="at-badge-warning">⚠ Follow-up required</span>
                            {act.followUpNote && (
                              <div className="at-followup-note">{act.followUpNote}</div>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--tok-text-muted)' }}>—</span>
                        )}
                      </td>
                      <td>
                        {act.attachmentNotes ? (
                          <div className="at-attachment-notes">
                            <span aria-hidden="true">📎</span>
                            <span>{act.attachmentNotes}</span>
                          </div>
                        ) : (
                          <span style={{ color: 'var(--tok-text-muted)' }}>—</span>
                        )}
                      </td>
                      {isStaff && (
                        <td>
                          <button
                            type="button"
                            className="tok-btn secondary small"
                            onClick={() => startEdit(act)}
                          >
                            Edit
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="at-cards-wrap">
            {actions.map((act) => {
              const isEditing = editingId === act.id;
              if (isEditing) {
                return (
                  <div key={act.id} className="action-card">
                    <div className="at-mode-banner">
                      <span>✏️ Editing action</span>
                    </div>

                    {editBanner && (
                      <div className={`at-banner at-banner-${editBanner.kind}`} role="alert">
                        <span>{editBanner.text}</span>
                        {editBanner.kind === 'conflict' && (
                          <button
                            type="button"
                            className="tok-btn secondary"
                            onClick={() => void reloadConflict(act.id)}
                          >
                            Reload
                          </button>
                        )}
                      </div>
                    )}

                    <form onSubmit={(e) => void handleEditSubmit(e, act.id)} noValidate>
                      <div className="at-form-grid">
                        <div className="at-form-group at-form-full">
                          <label>Description *</label>
                          <textarea
                            className="at-form-control"
                            rows={3}
                            value={editDraft.description}
                            disabled={editBusy}
                            onChange={(e) => setEditDraft((d) => ({ ...d, description: e.target.value }))}
                          />
                          {editErrors.description && (
                            <span className="at-field-error">{editErrors.description}</span>
                          )}
                        </div>
                        <div className="at-form-group at-form-full">
                          <label>Result *</label>
                          <textarea
                            className="at-form-control"
                            rows={3}
                            value={editDraft.result}
                            disabled={editBusy}
                            onChange={(e) => setEditDraft((d) => ({ ...d, result: e.target.value }))}
                          />
                          {editErrors.result && (
                            <span className="at-field-error">{editErrors.result}</span>
                          )}
                        </div>
                        <div className="at-form-group at-form-full">
                          <div className="at-switch-group">
                            <input
                              type="checkbox"
                              checked={editDraft.followUpRequired}
                              disabled={editBusy}
                              onChange={(e) =>
                                setEditDraft((d) => ({
                                  ...d,
                                  followUpRequired: e.target.checked,
                                  followUpNote: e.target.checked ? d.followUpNote : '',
                                }))
                              }
                            />
                            <label className="at-switch-label">Follow-up required?</label>
                          </div>
                        </div>
                        {editDraft.followUpRequired && (
                          <div className="at-form-group at-form-full">
                            <label>Follow-up note *</label>
                            <textarea
                              className="at-form-control"
                              rows={2}
                              value={editDraft.followUpNote}
                              disabled={editBusy}
                              onChange={(e) => setEditDraft((d) => ({ ...d, followUpNote: e.target.value }))}
                            />
                            {editErrors.followUpNote && (
                              <span className="at-field-error">{editErrors.followUpNote}</span>
                            )}
                          </div>
                        )}
                        <div className="at-form-group at-form-full">
                          <label>Attachment notes</label>
                          <input
                            type="text"
                            className="at-form-control"
                            value={editDraft.attachmentNotes}
                            disabled={editBusy}
                            onChange={(e) => setEditDraft((d) => ({ ...d, attachmentNotes: e.target.value }))}
                          />
                        </div>
                      </div>
                      <div className="at-form-actions">
                        <button type="submit" className="tok-btn primary" disabled={editBusy}>
                          {editBusy ? 'Saving…' : 'Save'}
                        </button>
                        <button type="button" className="tok-btn secondary" disabled={editBusy} onClick={cancelEdit}>
                          Cancel
                        </button>
                      </div>
                    </form>
                  </div>
                );
              }

              return (
                <div key={act.id} className="action-card">
                  <div className="action-card-header">
                    <span className="action-card-date">{fmtDisplayDate(act.actionAt)}</span>
                    <span className="action-card-performer">{act.performedBy.name}</span>
                  </div>
                  <div className="action-card-body">
                    <div className="action-card-field">
                      <label>Description</label>
                      <div className="at-ro-warm">{act.description}</div>
                    </div>
                    <div className="action-card-field">
                      <label>Result</label>
                      <div className="at-ro-warm">{act.result}</div>
                    </div>
                    {act.followUpRequired && (
                      <div className="action-card-field">
                        <span className="at-badge-warning">⚠ Follow-up required</span>
                        {act.followUpNote && (
                          <div className="at-followup-note">{act.followUpNote}</div>
                        )}
                      </div>
                    )}
                    {act.attachmentNotes && (
                      <div className="action-card-field">
                        <label>Attachment notes</label>
                        <div className="at-attachment-notes">
                          <span aria-hidden="true">📎</span>
                          <span>{act.attachmentNotes}</span>
                        </div>
                      </div>
                    )}
                  </div>
                  {isStaff && (
                    <div className="action-card-actions">
                      <button
                        type="button"
                        className="tok-btn secondary"
                        onClick={() => startEdit(act)}
                      >
                        Edit
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </section>
  );
};

export default ActionsTaken;
