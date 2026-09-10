# CPE 334 Lab 3 — UI Specification (Skeleton)

- **Status:** Draft v0.1 (TODO skeleton)
- **Parent:** [`specification.md`](./specification.md)

---

## 1. Application Shell — TODO

Intent: show authenticated user + role badge, role-based nav (Requester / IT Staff / Administrator), logout action.

## 2. Login — TODO

Intent: credential form, validation errors, safe failure message, redirect on success. No `Forgot your password?` link (password-reset email excluded).

## 3. Mandatory Password Change — TODO

Intent: first-login gate blocking all other routes until password changed; voluntary change entry point.

## 4. Requester Regression — TODO

Intent: Development Requester selector removed; ticket list/detail/attachments scoped to auth identity; public comments thread; problem-appears-resolved indication (not a status change).

## 5. IT Staff Ticket Queue — TODO

Intent: desktop 9-column table; mobile cards below 768px; search/filter/sort/pagination; "Showing X to Y of Z" footer; no horizontal scroll.

## 6. IT Staff Ticket Detail — TODO

Intent: owner assignment (zero-or-one), IT priority control, 8-status transition control, public vs internal threads with distinct styling. Tabs limited to Public Comments, Internal Notes, Attachments — no Service Actions tab, no Resolution Summary field. Category/Requester/Summary/Description read-only; only Owner, IT Priority, Status editable.

## 7. Administrator User Management — TODO

Intent: Name/Email/Role/Status/Edit table; search + role filter; create / edit / set-password modals; activate/deactivate (no deletion). No `send password reset email` checkbox — initial passwords via local-lab behavior only.

## 8. Responsive Rules — TODO

Intent: desktop ≥992px, tablet 768–991px, mobile <768px; no horizontal scroll; stacked cards on mobile.

## 9. Visual Feedback States — TODO

Intent: loading, saving, success, validation, empty, no-results, forbidden (403), not-found (404), conflict (409), safe failure (500) — consistent copy and retry behavior.
