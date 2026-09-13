import { useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api';
import { roleHome, useAuth } from '../auth/AuthContext';

interface Rule {
  key: string;
  label: string;
  ok: boolean;
}

function ruleChecks(newPassword: string, confirm: string, currentKnown: string | null): Rule[] {
  return [
    { key: 'len', label: '8–72 characters', ok: newPassword.length >= 8 && newPassword.length <= 72 },
    { key: 'upper', label: 'Contains an uppercase letter', ok: /[A-Z]/.test(newPassword) },
    { key: 'lower', label: 'Contains a lowercase letter', ok: /[a-z]/.test(newPassword) },
    { key: 'digit', label: 'Contains a number', ok: /[0-9]/.test(newPassword) },
    { key: 'special', label: 'Contains a special character', ok: /[^A-Za-z0-9]/.test(newPassword) },
    {
      key: 'differs',
      label: 'Differs from current password',
      ok: currentKnown === null ? newPassword.length > 0 : newPassword.length > 0 && newPassword !== currentKnown,
    },
    { key: 'match', label: 'Confirmation matches', ok: newPassword.length > 0 && newPassword === confirm },
  ];
}

export default function ChangePasswordPage({ first }: { first: boolean }) {
  const { user, changePassword } = useAuth();
  const voluntary = !first || user?.mustChangePassword === false;

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState({ current: false, next: false, confirm: false });
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<{ kind: 'error' | 'success'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const rules = useMemo(
    () => ruleChecks(next, confirm, voluntary ? current : null),
    [next, confirm, current, voluntary],
  );

  function setErr(field: string, message: string | null) {
    setFieldErrors((prev) => {
      const copy = { ...prev };
      if (message) copy[field] = message;
      else delete copy[field];
      return copy;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const errors: Record<string, string> = {};
    if (voluntary && current === '') errors.currentPassword = 'Enter your current password.';
    if (next === '') errors.newPassword = 'Enter a new password.';
    else {
      if (next.length < 8) errors.newPassword = 'Use at least 8 characters.';
      else if (next.length > 72) errors.newPassword = 'Use at most 72 characters.';
    }
    if (confirm === '') errors.confirmPassword = 'Confirm your new password.';
    else if (confirm !== next) errors.confirmPassword = 'Passwords do not match.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstField = errors.currentPassword
        ? 'cp-current'
        : errors.newPassword
          ? 'cp-new'
          : 'cp-confirm';
      document.getElementById(firstField)?.focus();
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const input = voluntary
        ? { currentPassword: current, newPassword: next, confirmPassword: confirm }
        : { newPassword: next, confirmPassword: confirm };
      const updated = await changePassword(input);
      setBanner({ kind: 'success', text: 'Password saved. Continuing to your workspace…' });
      const home = roleHome(updated.role).replace(/^#/, '');
      window.setTimeout(() => {
        window.location.hash = home;
      }, 800);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          const mapped: Record<string, string> = {};
          for (const d of err.body.details ?? []) {
            mapped[d.field] = d.message;
          }
          setFieldErrors(mapped);
          const target = mapped.currentPassword ? 'cp-current' : mapped.newPassword ? 'cp-new' : mapped.confirmPassword ? 'cp-confirm' : null;
          if (target) document.getElementById(target)?.focus();
        } else if (err.status === 401) {
          setErr('currentPassword', 'Current password is incorrect.');
          document.getElementById('cp-current')?.focus();
        } else if (err.status === 403 && err.code === 'password_change_required') {
          setBanner({ kind: 'error', text: 'Password change is required before continuing.' });
        } else {
          setBanner({ kind: 'error', text: 'We could not save your password. Try again.' });
        }
      } else {
        setBanner({ kind: 'error', text: 'We could not save your password. Try again.' });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="tok-main tok-auth-page" style={{ display: 'flex', justifyContent: 'center' }}>
      <div className="tok-card" style={{ maxWidth: 520, width: '100%' }}>
        <h1 className="h4 mb-2">{first ? 'Choose a new password' : 'Change password'}</h1>
        {first ? (
          <div className="tok-alert success" role="status" style={{ display: 'flex' }}>
            <span aria-hidden="true">🔒</span>
            <span>Your administrator set an initial password. Choose a new password to continue.</span>
          </div>
        ) : null}
        {banner ? (
          <div
            className={`tok-alert ${banner.kind === 'success' ? 'success' : 'error'}`}
            role={banner.kind === 'success' ? 'status' : 'alert'}
          >
            <span aria-hidden="true">{banner.kind === 'success' ? '✓' : '⚠'}</span>
            <span>{banner.text}</span>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} noValidate>
          {voluntary ? (
            <div className={`tok-field${fieldErrors.currentPassword ? ' invalid' : ''}`} style={{ marginBottom: '1rem' }}>
              <label className="tok-label" htmlFor="cp-current">
                Current Password <span className="tok-req" aria-hidden="true">*</span>
              </label>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  id="cp-current"
                  className="tok-input"
                  style={{ flex: 1 }}
                  type={show.current ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={current}
                  disabled={busy}
                  aria-invalid={fieldErrors.currentPassword ? 'true' : undefined}
                  aria-describedby={fieldErrors.currentPassword ? 'cp-current-error' : undefined}
                  onChange={(e) => {
                    setCurrent(e.target.value);
                    setErr('currentPassword', null);
                  }}
                />
                <button type="button" className="tok-btn secondary" style={{ flexShrink: 0, minWidth: 44 }} aria-pressed={show.current} aria-label={show.current ? 'Hide current password' : 'Show current password'} disabled={busy} onClick={() => setShow((s) => ({ ...s, current: !s.current }))}>
                  {show.current ? 'Hide' : 'Show'}
                </button>
              </div>
              {fieldErrors.currentPassword ? (
                <p className="tok-err" id="cp-current-error" role="alert" style={{ display: 'flex' }}>
                  <span aria-hidden="true">⚠</span> {fieldErrors.currentPassword}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className={`tok-field${fieldErrors.newPassword ? ' invalid' : ''}`} style={{ marginBottom: '1rem' }}>
            <label className="tok-label" htmlFor="cp-new">
              New Password <span className="tok-req" aria-hidden="true">*</span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="cp-new"
                className="tok-input"
                style={{ flex: 1 }}
                type={show.next ? 'text' : 'password'}
                autoComplete="new-password"
                value={next}
                disabled={busy}
                aria-invalid={fieldErrors.newPassword ? 'true' : undefined}
                aria-describedby={fieldErrors.newPassword ? 'cp-new-error cp-rules' : 'cp-rules'}
                onChange={(e) => {
                  setNext(e.target.value);
                  setErr('newPassword', null);
                }}
              />
              <button type="button" className="tok-btn secondary" style={{ flexShrink: 0, minWidth: 44 }} aria-pressed={show.next} aria-label={show.next ? 'Hide new password' : 'Show new password'} disabled={busy} onClick={() => setShow((s) => ({ ...s, next: !s.next }))}>
                {show.next ? 'Hide' : 'Show'}
              </button>
            </div>
            {fieldErrors.newPassword ? (
              <p className="tok-err" id="cp-new-error" role="alert" style={{ display: 'flex' }}>
                <span aria-hidden="true">⚠</span> {fieldErrors.newPassword}
              </p>
            ) : null}
          </div>

          <div className={`tok-field${fieldErrors.confirmPassword ? ' invalid' : ''}`} style={{ marginBottom: '1rem' }}>
            <label className="tok-label" htmlFor="cp-confirm">
              Confirm New Password <span className="tok-req" aria-hidden="true">*</span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="cp-confirm"
                className="tok-input"
                style={{ flex: 1 }}
                type={show.confirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirm}
                disabled={busy}
                aria-invalid={fieldErrors.confirmPassword ? 'true' : undefined}
                aria-describedby={fieldErrors.confirmPassword ? 'cp-confirm-error' : undefined}
                onChange={(e) => {
                  setConfirm(e.target.value);
                  setErr('confirmPassword', null);
                }}
              />
              <button type="button" className="tok-btn secondary" style={{ flexShrink: 0, minWidth: 44 }} aria-pressed={show.confirm} aria-label={show.confirm ? 'Hide confirmation' : 'Show confirmation'} disabled={busy} onClick={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}>
                {show.confirm ? 'Hide' : 'Show'}
              </button>
            </div>
            {fieldErrors.confirmPassword ? (
              <p className="tok-err" id="cp-confirm-error" role="alert" style={{ display: 'flex' }}>
                <span aria-hidden="true">⚠</span> {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </div>

          <div className="tok-card" id="cp-rules" aria-live="polite" style={{ padding: '0.875rem 1rem', marginBottom: '1rem', background: 'var(--tok-primary-soft, #EAF6EF)' }}>
            <p className="tok-label" style={{ marginBottom: '0.5rem' }}>Password must have:</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0, fontSize: '0.875rem' }}>
              {rules.map((r) => (
                <li key={r.key} style={{ color: r.ok ? 'var(--tok-success, #1E7A46)' : 'var(--tok-text-muted, #5C6B64)' }}>
                  <span aria-hidden="true">{r.ok ? '✓ ' : '✕ '}</span>
                  {r.label}
                  <span className="visually-hidden">{r.ok ? ' (met)' : ' (not met)'}</span>
                </li>
              ))}
            </ul>
          </div>

          <button type="submit" className="tok-btn primary" style={{ width: '100%' }} disabled={busy} aria-busy={busy}>
            {busy ? (
              <>
                <span className="tok-spinner" aria-hidden="true" /> Saving…
              </>
            ) : first ? (
              'Save and continue'
            ) : (
              'Save new password'
            )}
          </button>
          <div aria-live="polite" role="status" className="visually-hidden">{busy ? 'Saving…' : ''}</div>
        </form>
      </div>
    </main>
  );
}
