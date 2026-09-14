import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError, forgotPassword } from '../../api';
import { AuthAlert, ShowHideInput, TicketIcon } from './AuthCard';
import type { AuthBanner } from './AuthCard';

// Lab 3 forgot-password screen (ui-spec §3.4).
//
// Scope decision (documented in docs/lab-03/specification.md §10): the lab
// sheet EXCLUDES email-based password reset. The approved mockup's "Forgot
// password?" flow is therefore a credential-verified self-service reset: the
// user proves ownership of the account with the current (or administrator-
// issued initial) password, then sets a new one — all in one request. No
// email is sent, no reset token exists, and no account-existence information
// is leaked. Users who lost their password must contact an administrator,
// exactly as the safe login copy implies.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function initialEmail(): string {
  const q = window.location.hash.split('?')[1];
  if (!q) return '';
  const email = new URLSearchParams(q).get('email');
  return email ? decodeURIComponent(email) : '';
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState(initialEmail());
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<AuthBanner | null>(null);
  const [busy, setBusy] = useState(false);

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
    if (email.trim() === '') errors.email = 'Enter your email address.';
    else if (!EMAIL_RE.test(email.trim())) errors.email = 'Enter a valid email address.';
    if (current === '') errors.currentPassword = 'Enter your current or initial password.';
    if (next === '') errors.newPassword = 'Enter a new password.';
    else if (next.length < 8) errors.newPassword = 'Use at least 8 characters.';
    else if (next.length > 72) errors.newPassword = 'Use at most 72 characters.';
    if (confirm === '') errors.confirmPassword = 'Confirm your new password.';
    else if (confirm !== next) errors.confirmPassword = 'Passwords do not match.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      const firstField = errors.email
        ? 'fp-email'
        : errors.currentPassword
          ? 'fp-current'
          : errors.newPassword
            ? 'fp-new'
            : 'fp-confirm';
      document.getElementById(firstField)?.focus();
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const result = await forgotPassword({
        email: email.trim(),
        currentPassword: current,
        newPassword: next,
        confirmPassword: confirm,
      });
      if (result.changed) {
        setBanner({ kind: 'success', text: 'Password updated. You can now sign in with your new password.' });
        window.setTimeout(() => {
          window.location.hash = '/login';
        }, 1200);
      } else {
        // Safe no-leak response: never confirm whether the account exists.
        setBanner({
          kind: 'error',
          text: 'We could not update that password. Check the details and try again, or contact your IT administrator.',
        });
        document.getElementById('fp-current')?.focus();
      }
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400 && err.body.details && err.body.details.length > 0) {
          const mapped: Record<string, string> = {};
          for (const d of err.body.details) mapped[d.field] = d.message;
          setFieldErrors(mapped);
          const target = mapped.email
            ? 'fp-email'
            : mapped.currentPassword
              ? 'fp-current'
              : mapped.newPassword
                ? 'fp-new'
                : 'fp-confirm';
          document.getElementById(target)?.focus();
        } else if (err.status === 429) {
          setBanner({ kind: 'error', text: 'Too many attempts. Please wait a minute and try again.' });
        } else {
          // 401 wrong current password, 403 inactive, 404 unknown email and
          // anything unexpected all share one safe copy (BR-16).
          setBanner({
            kind: 'error',
            text: 'We could not update that password. Check the details and try again, or contact your IT administrator.',
          });
        }
      } else {
        setBanner({
          kind: 'error',
          text: 'We could not update that password. Check the details and try again, or contact your IT administrator.',
        });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="tok-auth-page">
      <div className="tok-auth-card">
        <a
          className="tok-auth-back"
          href="#/login"
          onClick={(e) => {
            e.preventDefault();
            window.location.hash = '/login';
          }}
        >
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <path d="M12.5 15 7.5 10l5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back to sign in
        </a>

        <div className="tok-auth-brand">
          <TicketIcon />
          <div>
            <h1 className="tok-auth-title" id="forgot-title">
              Reset your password
            </h1>
            <p className="tok-auth-subtitle">
              Verify your account with your current password, then choose a new one.
            </p>
          </div>
        </div>

        <div className="tok-auth-alert info" role="note">
          <span className="icon" aria-hidden="true">🔒</span>
          <span>
            TokTickIT does not send password-reset emails. If you no longer know your
            password, contact your IT administrator.
          </span>
        </div>

        <AuthAlert banner={banner} />

        <form onSubmit={handleSubmit} noValidate aria-labelledby="forgot-title">
          <div className="tok-auth-field">
            <label className="tok-label" htmlFor="fp-email">
              Email address
            </label>
            <input
              id="fp-email"
              className="tok-auth-input"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@toktickit.dev"
              value={email}
              disabled={busy}
              aria-invalid={fieldErrors.email ? 'true' : undefined}
              aria-describedby={fieldErrors.email ? 'fp-email-error' : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                setErr('email', null);
              }}
            />
            {fieldErrors.email ? (
              <p className="tok-err" id="fp-email-error" role="alert">
                <span aria-hidden="true">⚠</span> {fieldErrors.email}
              </p>
            ) : null}
          </div>

          <div className="tok-auth-field">
            <label className="tok-label" htmlFor="fp-current">
              Current or temporary password
            </label>
            <ShowHideInput
              id="fp-current"
              label="Current password"
              value={current}
              onChange={(v) => {
                setCurrent(v);
                setErr('currentPassword', null);
              }}
              autoComplete="current-password"
              placeholder="Enter current or initial password"
              invalid={Boolean(fieldErrors.currentPassword)}
              errorId="fp-current-error"
              describedBy="fp-current-hint"
              disabled={busy}
              maxLength={72}
            />
            <p className="tok-auth-hint" id="fp-current-hint">
              Use your existing password or the initial password assigned by an administrator.
            </p>
            {fieldErrors.currentPassword ? (
              <p className="tok-err" id="fp-current-error" role="alert">
                <span aria-hidden="true">⚠</span> {fieldErrors.currentPassword}
              </p>
            ) : null}
          </div>

          <div className="tok-auth-field">
            <label className="tok-label" htmlFor="fp-new">
              New Password <span className="tok-req" aria-hidden="true">*</span>
            </label>
            <ShowHideInput
              id="fp-new"
              label="New password"
              value={next}
              onChange={(v) => {
                setNext(v);
                setErr('newPassword', null);
              }}
              autoComplete="new-password"
              placeholder="Create a new password"
              invalid={Boolean(fieldErrors.newPassword)}
              errorId="fp-new-error"
              describedBy="fp-rules"
              disabled={busy}
              maxLength={72}
            />
            {fieldErrors.newPassword ? (
              <p className="tok-err" id="fp-new-error" role="alert">
                <span aria-hidden="true">⚠</span> {fieldErrors.newPassword}
              </p>
            ) : null}
          </div>

          <div className="tok-auth-field">
            <label className="tok-label" htmlFor="fp-confirm">
              Confirm New Password <span className="tok-req" aria-hidden="true">*</span>
            </label>
            <ShowHideInput
              id="fp-confirm"
              label="Confirmation"
              value={confirm}
              onChange={(v) => {
                setConfirm(v);
                setErr('confirmPassword', null);
              }}
              autoComplete="new-password"
              placeholder="Re-enter new password"
              invalid={Boolean(fieldErrors.confirmPassword)}
              errorId="fp-confirm-error"
              disabled={busy}
              maxLength={72}
            />
            {fieldErrors.confirmPassword ? (
              <p className="tok-err" id="fp-confirm-error" role="alert">
                <span aria-hidden="true">⚠</span> {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </div>

          <div className="tok-auth-rules-card" id="fp-rules" aria-live="polite">
            <p className="tok-auth-rules-card-title">Password must have:</p>
            <ul>
              <li className={next.length >= 8 ? 'is-met' : ''}>
                <span aria-hidden="true">{next.length >= 8 ? '✓' : '✕'}</span>8–72 characters
              </li>
              <li className={/[A-Z]/.test(next) ? 'is-met' : ''}>
                <span aria-hidden="true">{/[A-Z]/.test(next) ? '✓' : '✕'}</span>One uppercase letter
              </li>
              <li className={/[a-z]/.test(next) ? 'is-met' : ''}>
                <span aria-hidden="true">{/[a-z]/.test(next) ? '✓' : '✕'}</span>One lowercase letter
              </li>
              <li className={/[0-9]/.test(next) ? 'is-met' : ''}>
                <span aria-hidden="true">{/[0-9]/.test(next) ? '✓' : '✕'}</span>One number
              </li>
              <li className={/[^A-Za-z0-9]/.test(next) ? 'is-met' : ''}>
                <span aria-hidden="true">{/[^A-Za-z0-9]/.test(next) ? '✓' : '✕'}</span>One special character
              </li>
              <li className={next.length > 0 && next !== current ? 'is-met' : ''}>
                <span aria-hidden="true">{next.length > 0 && next !== current ? '✓' : '✕'}</span>Different from current password
              </li>
            </ul>
          </div>

          <button type="submit" className="tok-auth-submit" disabled={busy} aria-busy={busy}>
            {busy ? (
              <>
                <span className="tok-spinner" aria-hidden="true" /> Updating…
              </>
            ) : (
              'Update password'
            )}
          </button>
          <div aria-live="polite" role="status" className="visually-hidden">
            {busy ? 'Updating…' : ''}
          </div>

          <p className="tok-auth-footnote">
            You will return to sign in after your password is updated.
          </p>
        </form>
      </div>
    </main>
  );
}
