# Lab 3 — Visual QA Checklist

Status legend: ✅ pass · ⚠️ noted issue (tracked below) · Evidence: `artifacts/lab-03/screenshots/**`
(captured live against the seeded database with `npx tsx e2e/capture-lab03-evidence.ts`; measured
data in `artifacts/lab-03/screenshots/visual-probe.json`). Reviewer-facing copies of earlier
one-off captures remain in `docs/lab-03/evidence/`.

## 1. Zen Green consistency

| Item | Status | Evidence |
|---|---|---|
| Same green header band across requester / staff / admin shells (`tok-navbar`) | ✅ | shell-staff-desktop, staff-queue-desktop, user-management-desktop |
| Primary buttons share the Zen Green token (`tok-btn primary`, `tok-auth-submit`) | ✅ | login-desktop, user-management-create-desktop, staff-queue-desktop |
| Badge language consistent (priority pills, status pills, role chips) | ✅ | staff-queue-desktop, shell-staff-desktop |
| Table header band on staff queue and admin users matches My Tickets styling (`mt-*` shared classes) | ✅ | staff-queue-desktop, user-management-desktop |
| Auth screens (login, change password) use the same tokens | ✅ | login-desktop, password-change-desktop |

## 2. Role navigation correctness

| Item | Status | Evidence |
|---|---|---|
| Requester nav: My Tickets + New Ticket only | ✅ | requester detail flows in lab-02 regression suite |
| IT Staff nav: Ticket Queue (+ Profile menu) | ✅ | shell-staff-desktop |
| Administrator nav: User Management only | ✅ | user-management-desktop |
| Forced-change users get the minimal shell (no nav, Sign out only) | ✅ | password-change-desktop (via e2e/lab-03/authentication.spec.ts gate assertions) |
| Direct URL access by wrong role renders the client Forbidden card; server 403 remains the authority | ✅ | forbidden-requester-desktop |

## 3. Badge consistency

| Item | Status | Evidence |
|---|---|---|
| Status colors reuse one pill family across queue rows, detail header, and requester view | ✅ | staff-queue-desktop, staff-ticket-detail-desktop |
| Priority pills identical in both tables (Requested Priority vs IT Priority distinct labels) | ✅ | staff-ticket-detail-desktop |
| `P!` chip flags users who must change password, consistent with badge sizing | ✅ | user-management-desktop |

## 4. Editable vs read-only styling

| Item | Status | Evidence |
|---|---|---|
| Read-only detail fields use warm read-only surfaces (`tok-desc-warm`), not input borders | ✅ | staff-ticket-detail-desktop |
| Editable IT Priority / Status use selects that stay visually quiet until interaction | ✅ | staff-ticket-detail-desktop |
| Owner filter search input in the Filters popover is clearly an input, not a display block | ✅ | staff-queue-filters-desktop |

## 5. Validation placement

| Item | Status | Evidence |
|---|---|---|
| Login errors render once at the card level (`tok-auth-alert`), not per-field guesswork | ✅ | login-error-mobile, login-inactive-mobile |
| Change-password rules list marks each rule met/unmet next to the field | ✅ | password-change-desktop |
| Admin modal errors appear inline under fields; conflict/success surface as toasts | ✅ | user-management-create-desktop (flows asserted in user-administration.spec.ts) |

## 6. Focus states

| Item | Status | Evidence |
|---|---|---|
| Keyboard focus uses the `:focus-visible` green ring (box-shadow token `--tok-ring`) on inputs, buttons, nav, and menu items | ✅ | zen-green.css token audit; e2e style tests assert focus-visible rings |
| Programmatic (mouse) focus intentionally shows no ring; keyboard Tab always does | ✅ | visual-probe.json (measured; see note below) |
| Focus is trapped and returned correctly in modals (admin modals, account menu) | ✅ | component tests assert Escape/aria-modal behavior |

Note: the measured probe focuses elements synthetically, which does not trigger
`:focus-visible` (keyboard-only pseudo-class) — `focusVisible: false` in the JSON is the
expected result of that mechanism, not a missing ring. Keyboard ring behavior is covered by
the UI style tests.

## 7. Clipping / overlap / horizontal overflow

| Item | Status | Evidence |
|---|---|---|
| No horizontal overflow at 1440 / 834 / 375 on any of the 8 measured screens | ✅ | visual-probe.json — `hOverflow: false` on all 25 measurements |
| Staff queue table fits desktop viewport; internal wrapper scroll only, no page scroll | ✅ | staff-queue-desktop |
| User management fits desktop viewport without page scroll | ✅ | user-management-desktop |
| Mobile renders card lists instead of tables below 768px (no clipped columns) | ✅ | staff-queue-mobile, user-management-mobile |
| Modals collapse to a single column on mobile; segmented Active/Inactive control stretches full width | ✅ | user-management-create-desktop (mobile flow in component tests) |
| Toast stack is fixed bottom-right and does not overlap the pager | ✅ | flows asserted in UserManagement.test.tsx |

## 8. Mobile usability

| Item | Status | Evidence |
|---|---|---|
| Tap targets ≥ ~40px on auth, queue cards, and admin rows | ✅ | login-mobile, staff-queue-mobile, user-management-mobile |
| Filters popover usable at 375px (full-width rows, Apply/Clear reachable) | ✅ | staff-queue-filters-desktop + responsive component tests |
| Footer and sign-out toast do not obscure the login submit button | ✅ | logout-toast-mobile |

## Known visual issues

1. **Sort-caret affordance is subtle on narrow tablet widths** (834px) — carets render but sit
   close to the label. Functional (clickable th, `aria-sort` verified in component tests);
   cosmetic only. Accepted for Lab 3.
2. **Long user emails truncate in the admin table on tablet** with ellipsis (title tooltip
   shows the full address on hover). Accepted: no overflow, full value available via tooltip
   and the edit modal.
3. The visual probe's synthetic focus cannot trigger `:focus-visible` by design (see §6) —
   documented here so reviewers do not read `focusVisible: false` as a defect.
