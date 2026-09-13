import { useState } from 'react';
import type { FormEvent } from 'react';
import { ApiError } from '../api';
import { roleHome, useAuth } from '../auth/AuthContext';

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
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'error' | 'server' | 'rate'; text: string } | null>(null);
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
          setBanner({ kind: 'rate', text: RATE_LIMITED });
        } else {
          setBanner({ kind: 'server', text: SERVER_FAILURE });
        }
      } else {
        setBanner({ kind: 'server', text: SERVER_FAILURE });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="tok-main tok-auth-page" style={{ display: 'flex', justifyContent: 'center' }}>
      <a href="#login-form" className="visually-hidden-focusable">Skip to sign in</a>
      <div className="tok-card tok-auth-card" style={{ maxWidth: 440, width: '100%' }}>
        <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
          <div className="tok-brand-badge" aria-hidden="true" style={{ margin: '0 auto' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z" />
              <path d="M13 5v2" />
              <path d="M13 17v2" />
              <path d="M13 11v2" />
            </svg>
          </div>
          <h1 className="h4 mt-3 mb-1">Sign in to TokTickIT</h1>
          <p className="tok-hint" style={{ marginTop: 0 }}>Use your work email and password.</p>
        </div>

        {notice ? (
          <div className="tok-alert success" role="status" style={{ display: 'flex' }}>{notice}</div>
        ) : null}

        {banner ? (
          <div
            className="tok-alert error"
            role="alert"
            style={banner.kind !== 'error' ? { background: 'var(--tok-warning-soft, #FFF4E5)', color: 'var(--tok-warning, #B26A00)', borderColor: '#F0D9B5' } : undefined}
          >
            <span aria-hidden="true">{banner.kind === 'error' ? 'ⓘ' : '⚠'}</span>
            <span>{banner.text}</span>
          </div>
        ) : null}

        <form id="login-form" onSubmit={handleSubmit} noValidate>
          <div className={`tok-field${emailError ? ' invalid' : ''}`} style={{ marginBottom: '1rem' }}>
            <label className="tok-label" htmlFor="login-email">
              Email <span className="tok-req" aria-hidden="true">*</span>
            </label>
            <input
              id="login-email"
              className="tok-input"
              type="email"
              autoComplete="username"
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

          <div className={`tok-field${passwordError ? ' invalid' : ''}`} style={{ marginBottom: '1.25rem' }}>
            <label className="tok-label" htmlFor="login-password">
              Password <span className="tok-req" aria-hidden="true">*</span>
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                id="login-password"
                className="tok-input"
                style={{ flex: 1 }}
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                disabled={busy}
                aria-invalid={passwordError ? 'true' : undefined}
                aria-describedby={passwordError ? 'login-password-error' : undefined}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (passwordError) setPasswordError(null);
                }}
                onBlur={() => setPasswordError(validatePassword(password))}
              />
              <button
                type="button"
                className="tok-btn secondary"
                style={{ flexShrink: 0, minWidth: 44 }}
                aria-pressed={showPassword}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                disabled={busy}
                onClick={() => setShowPassword((s) => !s)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {passwordError ? (
              <p className="tok-err" id="login-password-error" role="alert" style={{ display: 'flex' }}>
                <span aria-hidden="true">⚠</span> {passwordError}
              </p>
            ) : null}
          </div>

          <button
            type="submit"
            className="tok-btn primary"
            style={{ width: '100%' }}
            disabled={busy}
            aria-busy={busy}
          >
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
          {banner?.kind === 'server' ? (
            <button
              type="button"
              className="tok-btn secondary"
              style={{ width: '100%', marginTop: '0.75rem' }}
              disabled={busy}
              onClick={() => handleSubmit({ preventDefault: () => undefined } as unknown as FormEvent)}
            >
              Try again
            </button>
          ) : null}
        </form>
      </div>
    </main>
  );
}
