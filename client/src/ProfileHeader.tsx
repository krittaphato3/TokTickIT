import { useEffect, useRef, useState } from 'react';
import { useDevRequester } from './devRequesterContext';

// Profile dropdown (mockup "AccountSelection_Demo": top-right Profile button).
// Reads the active requester from context; "Change requester" clears it and
// lets the route guard return the user to the selection screen. This slot
// lives on the right of the existing requester selector; the header itself
// is shared and unchanged.
export default function ProfileHeader({
  onClear,
}: {
  onClear?: () => void;
}) {
  const { activeRequester, clearRequester } = useDevRequester();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Close the dropdown on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent | TouchEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('touchstart', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('touchstart', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const display = activeRequester
    ? `${activeRequester.name} (${activeRequester.email})`
    : 'No requester selected yet';

  function handleChangeRequester() {
    clearRequester();
    setOpen(false);
    onClear?.();
  }

  return (
    <div className="tok-profile" ref={menuRef}>
      <button
        type="button"
        className="tok-profile-btn"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
        </svg>
        <span>Profile</span>
        <span className="tok-profile-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open && (
        <div className="tok-profile-menu" role="menu">
          <div className="tok-profile-head">Current requester · testing only</div>
          <div className="tok-profile-account">{display}</div>
          <button
            type="button"
            className="tok-profile-item"
            onClick={handleChangeRequester}
          >
            Change requester
          </button>
        </div>
      )}
    </div>
  );
}