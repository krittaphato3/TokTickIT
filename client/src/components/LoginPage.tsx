import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api';
import { roleHome, useAuth } from '../auth/AuthContext';
import { AuthAlert, ShowHideInput, TicketIcon } from './auth/AuthCard';
import type { AuthBanner } from './auth/AuthCard';

// Lab 3 login screen (ui-spec §3), restyled from
// docs/mockups/Authentication-Forgot-Mockup.html — white, minimal Zen Green.
// Safe-failure contract preserved: invalid credentials and inactive accounts
// share identical copy (BR-16); only validation and rate-limiting differ.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SAFE_FAILURE = 'Email or password is incorrect. Check your entries and try again.';
const SERVER_FAILURE = 'We could not sign you in. Check your connection and try again.';
const RATE_LIMITED = 'Too many attempts. Please wait a minute and try again.';

function nextTarget(): string | null {
  const hash = window.location.hash;
  const q = hash.split('?')[1];
  if (!q) return null;
  const params = new URLSearchParams(q);
  const next = params.get('next');
  if (!next) return null;
  try {
    const decoded = decodeURIComponent(next);
    if (!decoded.startsWith('#/')) return null;
    return decoded;
  } catch {
    return null;
  }
}

export default function LoginPage({ notice }: { notice?: string | null }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [banner, setBanner] = useState<AuthBanner | null>(null);
  const [busy, setBusy] = useState(false);

  function validateEmail(v: string): string | null {
    if (v.trim() === '') return 'Enter your email address.';
    if (!EMAIL_RE.test(v.trim())) return 'Enter a valid email address.';
    return null;
  }

  function validatePassword(v: string): string | null {
    if (v === '') return 'Enter your password.';
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    const ee = validateEmail(email);
    const pe = validatePassword(password);
    setEmailError(ee);
    setPasswordError(pe);
    if (ee) {
      document.getElementById('login-email')?.focus();
      return;
    }
    if (pe) {
      document.getElementById('login-password')?.focus();
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const user = await login(email.trim(), password);
      const next = nextTarget();
      if (user.mustChangePassword) {
        window.location.hash = '#/change-password?first=1';
        return;
      }
      if (next) {
        window.location.hash = next.replace(/^#/, '');
        return;
      }
      window.location.hash = roleHome(user.role).replace(/^#/, '');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 400) {
          const details = err.body.details ?? [];
          let focused = false;
          for (const d of details) {
            if (d.field === 'email') {
              setEmailError(d.message);
              if (!focused) {
                document.getElementById('login-email')?.focus();
                focused = true;
              }
            } else if (d.field === 'password') {
              setPasswordError(d.message);
              if (!focused) {
                document.getElementById('login-password')?.focus();
                focused = true;
              }
            }
          }
          if (details.length === 0) setBanner({ kind: 'error', text: SAFE_FAILURE });
          setPassword('');
          if (!focused) document.getElementById('login-password')?.focus();
        } else if (err.status === 401 || err.status === 403) {
          // 401 invalid credentials and 403 inactive share identical copy
          // (ui-spec §3.3) — never leak which one occurred.
          setBanner({ kind: 'error', text: SAFE_FAILURE });
          setPassword('');
          document.getElementById('login-password')?.focus();
        } else if (err.status === 429) {
          setBanner({ kind: 'error', text: RATE_LIMITED });
        } else {
          setBanner({ kind: 'error', text: SERVER_FAILURE });
        }
      } else {
        setBanner({ kind: 'error', text: SERVER_FAILURE });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="tok-auth-page">
      <div className="tok-auth-card">
        <div className="tok-auth-brand">
          <TicketIcon />
          <div>
            <h1 className="tok-auth-title" id="login-title">
              Sign in
            </h1>
            <p className="tok-auth-subtitle">Use your TokTickIT account to continue.</p>
          </div>
        </div>

        {notice ? (
          <div className="tok-auth-alert success" role="status">
            <span className="icon" aria-hidden="true">✓</span>
            <span>{notice}</span>
          </div>
        ) : null}

        <AuthAlert banner={banner} />

        <form id="login-form" onSubmit={handleSubmit} noValidate aria-labelledby="login-title">
          <div className="tok-auth-field">
            <label className="tok-label" htmlFor="login-email">
              Email address
            </label>
            <input
              id="login-email"
              className="tok-auth-input"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="name@toktickit.dev"
              value={email}
              disabled={busy}
              aria-invalid={emailError ? 'true' : undefined}
              aria-describedby={emailError ? 'login-email-error' : undefined}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              onBlur={() => setEmailError(validateEmail(email))}
            />
            {emailError ? (
              <p className="tok-err" id="login-email-error" role="alert" style={{ display: 'flex' }}>
                <span aria-hidden="true">⚠</span> {emailError}
              </p>
            ) : null}
          </div>

          <div className="tok-auth-field">
            <label className="tok-label" htmlFor="login-password">
              Password
            </label>
            <ShowHideInput
              id="login-password"
              label="Password"
              value={password}
              onChange={(v) => {
                setPassword(v);
                if (passwordError) setPasswordError(null);
              }}
              autoComplete="current-password"
              placeholder="Enter your password"
              invalid={Boolean(passwordError)}
              errorId="login-password-error"
              disabled={busy}
            />
            <div className="tok-auth-meta">
              {passwordError ? (
                <p className="tok-err" id="login-password-error" role="alert">
                  <span aria-hidden="true">⚠</span> {passwordError}
                </p>
              ) : null}
              <a
                className="tok-auth-link"
                href="#/forgot-password"
                onClick={(e) => {
                  e.preventDefault();
                  window.location.hash = `/forgot-password${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`;
                }}
              >
                Forgot password?
              </a>
            </div>
          </div>

          <button type="submit" className="tok-auth-submit" disabled={busy} aria-busy={busy}>
            {busy ? (
              <>
                <span className="tok-spinner" aria-hidden="true" /> Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </button>
          <div aria-live="polite" role="status" className="visually-hidden">
            {busy ? 'Signing in…' : ''}
          </div>

          <p className="tok-auth-footnote">
            Protected by role-based access control. Never share your password.
          </p>
        </form>
      </div>
    </main>
  );
}
