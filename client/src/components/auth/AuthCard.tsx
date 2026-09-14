// Shared building blocks for the Lab 3 auth screens (login / forgot /
// change password), adapted from docs/mockups/Authentication-Forgot-Mockup.html
// and restyled to Zen Green (white, minimal, fully responsive).
import { useState } from 'react';
import type { ReactNode } from 'react';

export function BrandMark({ children }: { children: ReactNode }) {
  return (
    <span className="tok-auth-badge" aria-hidden="true">
      {children}
    </span>
  );
}

export interface AuthBanner {
  kind: 'error' | 'success' | 'info';
  text: string;
}

const ALERT_ICON: Record<AuthBanner['kind'], string> = {
  error: 'ⓘ',
  success: '✓',
  info: '🔒',
};

export function AuthAlert({ banner }: { banner: AuthBanner | null }) {
  if (!banner) return null;
  return (
    <div className={`tok-auth-alert ${banner.kind}`} role={banner.kind === 'success' ? 'status' : 'alert'} aria-live="assertive">
      <span className="icon" aria-hidden="true">
        {ALERT_ICON[banner.kind]}
      </span>
      <span>{banner.text}</span>
    </div>
  );
}

// Ticket icon from the mockup (brand mark).
export function TicketIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
      <path
        d="M3.5 8.2c0-1.2 1-2.2 2.2-2.2h12.6c1.2 0 2.2 1 2.2 2.2v1.4a2.4 2.4 0 0 0 0 4.8v1.4c0 1.2-1 2.2-2.2 2.2H5.7c-1.2 0-2.2-1-2.2-2.2v-1.4a2.4 2.4 0 0 0 0-4.8V8.2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M12 7v10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeDasharray="2.2 2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function ShowHideInput({
  id,
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  invalid,
  errorId,
  describedBy,
  disabled,
  maxLength,
  autoFocus,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  placeholder?: string;
  invalid?: boolean;
  errorId?: string;
  describedBy?: string;
  disabled?: boolean;
  maxLength?: number;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className={`tok-auth-wrap${invalid ? ' invalid' : ''}`}>
      <input
        id={id}
        className="tok-auth-input"
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        autoFocus={autoFocus}
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={[errorId, describedBy].filter(Boolean).join(' ') || undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        className="tok-auth-toggle"
        aria-pressed={show}
        aria-label={show ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        disabled={disabled}
        onClick={() => setShow((s) => !s)}
      >
        {show ? 'Hide' : 'Show'}
      </button>
    </div>
  );
}
