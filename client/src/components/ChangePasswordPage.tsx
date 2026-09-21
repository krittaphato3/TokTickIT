import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api';
import { roleHome, useAuth } from '../auth/AuthContext';
import { AuthAlert, ShowHideInput, TicketIcon } from './auth/AuthCard';
import type { AuthBanner } from './auth/AuthCard';

interface Rule {
  key: string;
  label: string;
  ok: boolean;
}

function ruleChecks(newPassword: string, confirm: string, currentKnown: string | null): Rule[] {
  return [
    { key: 'len', label: '8–72 characters', ok: newPassword.length >= 8 && newPassword.length <= 72 },
    { key: 'upper', label: 'One uppercase letter', ok: /[A-Z]/.test(newPassword) },
    { key: 'lower', label: 'One lowercase letter', ok: /[a-z]/.test(newPassword) },
    { key: 'digit', label: 'One number', ok: /[0-9]/.test(newPassword) },
    { key: 'special', label: 'One special character', ok: /[^A-Za-z0-9]/.test(newPassword) },
    {
      key: 'differs',
      label: 'Different from current password',
      ok: currentKnown === null ? newPassword.length > 0 : newPassword.length > 0 && newPassword !== currentKnown,
    },
    { key: 'match', label: 'Confirmation matches', ok: newPassword.length > 0 && newPassword === confirm },
  ];
}

function strengthScore(next: string): number {
  let score = 0;
  if (next.length >= 8) score += 1;
  if (/[A-Z]/.test(next)) score += 1;
  if (/[a-z]/.test(next)) score += 1;
  if (/[0-9]/.test(next)) score += 1;
  if (/[^A-Za-z0-9]/.test(next)) score += 1;
  return score;
}

const STRENGTH_LABELS = [
  'Use a strong, unique password.',
  'Too weak',
  'Weak',
  'Fair',
  'Strong',
  'Very strong',
];

export default function ChangePasswordPage({ first }: { first: boolean }) {
  const { user, changePassword } = useAuth();
  const liveVoluntary = !first || user?.mustChangePassword === false;
  // Lock the forced/voluntary mode for the lifetime of this mount: the
  // change-password success response flips user.mustChangePassword to false,
  // which must not morph a forced form into the voluntary variant mid-flow.
  const forcedAtMountRef = useRef<boolean | null>(null);
  if (forcedAtMountRef.current === null) {
    forcedAtMountRef.current = first && user?.mustChangePassword !== false;
  }
  const [justCompleted, setJustCompleted] = useState(false);
  const voluntary = forcedAtMountRef.current ? false : liveVoluntary;
  const navTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (navTimerRef.current !== null) window.clearTimeout(navTimerRef.current);
    },
    [],
  );

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [banner, setBanner] = useState<AuthBanner | null>(null);
  const [busy, setBusy] = useState(false);

  const rules = useMemo(
    () => ruleChecks(next, confirm, voluntary ? current : null),
    [next, confirm, current, voluntary],
  );

  const score = strengthScore(next);

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
      if (!voluntary) setJustCompleted(true);
      const home = roleHome(updated.role).replace(/^#/, '');
      navTimerRef.current = window.setTimeout(() => {
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

  if (justCompleted) {
    return (
      <main className="tok-auth-page">
        <div className="tok-auth-card tok-auth-card--success">
          <div className="tok-auth-brand">
            <span className="cp-lock-badge" aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                <circle cx="12" cy="15" r="1.4" fill="currentColor" />
              </svg>
            </span>
            <div>
              <h1 className="tok-auth-title" id="cp-title">
                Choose a new password
              </h1>
              <p className="tok-auth-subtitle">Pick a strong, unique password for your account.</p>
            </div>
          </div>
          <AuthAlert banner={banner} />
          <div className="cp-success-loader" aria-hidden="true">
            <span className="cp-success-spinner" />
          </div>
          <span className="cp-sr-only" role="status">
            Continuing to your workspace
          </span>
        </div>
      </main>
    );
  }

  return (
    <main className="tok-auth-page">
      <div className="tok-auth-card">
        {voluntary ? (
          <a
            className="tok-auth-back"
            href="#back"
            onClick={(e) => {
              e.preventDefault();
              window.history.back();
            }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path d="M12.5 15 7.5 10l5-5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </a>
        ) : null}

        <div className="tok-auth-brand">
          <TicketIcon />
          <div>
            <h1 className="tok-auth-title" id="cp-title">
              {first ? 'Choose a new password' : 'Change password'}
            </h1>
            <p className="tok-auth-subtitle">
              {first
                ? 'Pick a strong, unique password for your account.'
                : 'Verify your current password, then choose a new one.'}
            </p>
          </div>
        </div>

        {first ? (
          <div className="tok-auth-alert info" role="status">
            <span className="icon" aria-hidden="true">🔒</span>
            <span>Your administrator set an initial password. Choose a new password to continue.</span>
          </div>
        ) : null}

        <AuthAlert banner={banner} />

        <form onSubmit={handleSubmit} noValidate aria-labelledby="cp-title">
          {voluntary ? (
            <div className={`tok-auth-field${fieldErrors.currentPassword ? ' invalid' : ''}`}>
              <label className="tok-label" htmlFor="cp-current">
                Current Password <span className="tok-req" aria-hidden="true">*</span>
              </label>
              <ShowHideInput
                id="cp-current"
                label="Current password"
                value={current}
                onChange={(v) => {
                  setCurrent(v);
                  setErr('currentPassword', null);
                }}
                autoComplete="current-password"
                placeholder="Enter your current password"
                invalid={Boolean(fieldErrors.currentPassword)}
                errorId="cp-current-error"
                disabled={busy}
                maxLength={72}
              />
              {fieldErrors.currentPassword ? (
                <p className="tok-err" id="cp-current-error" role="alert" style={{ display: 'flex' }}>
                  <span aria-hidden="true">⚠</span> {fieldErrors.currentPassword}
                </p>
              ) : null}
            </div>
          ) : null}

          <div className={`tok-auth-field${fieldErrors.newPassword ? ' invalid' : ''}`}>
            <label className="tok-label" htmlFor="cp-new">
              New Password <span className="tok-req" aria-hidden="true">*</span>
            </label>
            <ShowHideInput
              id="cp-new"
              label="New password"
              value={next}
              onChange={(v) => {
                setNext(v);
                setErr('newPassword', null);
              }}
              autoComplete="new-password"
              placeholder="Create a new password"
              invalid={Boolean(fieldErrors.newPassword)}
              errorId="cp-new-error"
              describedBy="cp-rules"
              disabled={busy}
              maxLength={72}
            />
            <div className="tok-auth-strength" data-score={score} aria-hidden="true">
              <span></span>
              <span></span>
              <span></span>
              <span></span>
              <span></span>
            </div>
            <p className="tok-auth-strength-label" aria-live="polite">
              {next ? STRENGTH_LABELS[Math.max(score, 1)] : STRENGTH_LABELS[0]}
            </p>
            {fieldErrors.newPassword ? (
              <p className="tok-err" id="cp-new-error" role="alert" style={{ display: 'flex' }}>
                <span aria-hidden="true">⚠</span> {fieldErrors.newPassword}
              </p>
            ) : null}
          </div>

          <div className={`tok-auth-field${fieldErrors.confirmPassword ? ' invalid' : ''}`}>
            <label className="tok-label" htmlFor="cp-confirm">
              Confirm New Password <span className="tok-req" aria-hidden="true">*</span>
            </label>
            <ShowHideInput
              id="cp-confirm"
              label="Confirmation"
              value={confirm}
              onChange={(v) => {
                setConfirm(v);
                setErr('confirmPassword', null);
              }}
              autoComplete="new-password"
              placeholder="Re-enter new password"
              invalid={Boolean(fieldErrors.confirmPassword)}
              errorId="cp-confirm-error"
              disabled={busy}
              maxLength={72}
            />
            {fieldErrors.confirmPassword ? (
              <p className="tok-err" id="cp-confirm-error" role="alert" style={{ display: 'flex' }}>
                <span aria-hidden="true">⚠</span> {fieldErrors.confirmPassword}
              </p>
            ) : null}
          </div>

          <ul className="tok-auth-rules" id="cp-rules" aria-live="polite">
            {rules.map((r) => (
              <li key={r.key} className={r.ok ? 'is-met' : ''}>
                <span className="dot" aria-hidden="true">✓</span>
                <span>
                  {r.label}
                  <span className="visually-hidden">{r.ok ? ' (met)' : ' (not met)'}</span>
                </span>
              </li>
            ))}
          </ul>

          <button type="submit" className="tok-auth-submit" style={{ marginTop: 20 }} disabled={busy} aria-busy={busy}>
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
