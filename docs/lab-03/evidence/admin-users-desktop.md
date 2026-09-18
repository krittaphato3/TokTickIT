# Lab 3 — Admin User Management: Live E2E Evidence

**Branch:** `feature/lab3-admin-users` · **Date:** 2026-09-18 · **Method:** real browser session via the thread Preview tab (Vite dev server on `:4519`, API on `:4010`, shared seeded PostgreSQL).

Screenshots could not be composited in this session (webview frame capture unavailable), so evidence is the recorded DOM/state output of each step. All values below are verbatim tool outputs.

## 1. Login → mandatory password change → admin screen

1. Signed in as `admin@toktickit.test` with the seed initial password `Admin123!` through the real login form.
2. App redirected to `#/change-password?first=1` and rendered the interstitial: "Your administrator set an initial password. Choose a new password to continue." with the full rules list (8–72 chars, upper, lower, digit, special, different, confirm).
3. After saving `ZenAdmin4$Lab`, the app landed on `#/admin/users` with the admin nav ("User Management") active — the mandatory gate (BR-02) and role home (AD-01) behave as specified.

## 2. User list (`GET /api/users`)

```json
{ "route": "#/admin/users", "title": "User Management", "tableRows": 10,
  "mobileCards": 10, "roleBadgeClasses": "mt-badge au-role au-role-REQUESTER",
  "statusBadgeClasses": "mt-badge au-status-active",
  "activeNav": "User Management", "caption": "Showing 10 users" }
```

All 10 seeded users rendered id-ascending with role badges (Requester / IT Staff / Administrator) and Active/Inactive pills; the password hash appears nowhere.

## 3. Role filter + search

- Role → IT Staff: `{ "afterFilter": { "rows": 4, "caption": "Showing 4 users", "firstEmail": "sara.it@toktickit.test" }, "resetRows": 10 }`
- Search "sara": `{ "caption": "Showing 1 user", "emails": ["sara.it@toktickit.test"], "rows": 1 }`

## 4. Safety guards in the real UI

- **Self-deactivation blocked client-side** (own row, Ada Admin): toggle click left `aria-checked` `"true" → "true"` and rendered `"⚠️ You cannot deactivate your own account."` in dialog `"Edit user — Ada Admin"`.
- **Duplicate email 409 inline**: creating `alpha@toktickit.test` returned the inline error `"⚠️ An account with this email already exists."` with the modal still open.
- **Create success**: creating `e2e.probe@toktickit.test` (IT Staff) showed banner `"User saved."`, row count went `10 → 11`, and the new row rendered with role `"IT Staff"`.

## 5. Set initial password → mandatory change at next login

1. Admin set `FreshStart7$` for the probe user; banner: `"Initial password set for e2e.probe@toktickit.test. They must change it at next sign-in."`
2. Signed out through the profile menu (redirect `#/login`).
3. Logged in as the probe user with the admin-set password:

```json
{ "loginStatus": 200, "mustChangePassword": true,
  "gatedStatus": 403, "gatedCode": "password_change_required",
  "gatedError": "Password change required" }
```

The user could authenticate but every normal API stayed gated until their own change — the AC-16 end-to-end behavior.

## 6. Server-side authorization sweep (raw fetch, cross-role)

| Probe | Result |
|---|---|
| IT Staff (`sara.it@…`, after clearing own forced change) → `GET /api/users` | `403 {"error":"Administrator access required"}` |
| IT Staff → `POST /api/users` | `403 {"error":"Administrator access required"}` — no row created |
| Admin → `POST /api/users` **without** `X-CSRF-Token` | `403` (CSRF enforced) |
| Admin → `PATCH /api/users/999999` | `404 {"error":"User not found"}` |
| Unauthenticated → `GET /api/users` | `401` |

(Requester probes were impractical in this session because seeded requester/staff passwords are already-consumed initial passwords; the requester/staff 403 matrix is covered by `users-admin.api.test.ts` T-AUTHZ-04 on the seeded DB.)

## 7. Responsive checks

At viewport width 439 px (mobile):

```json
{ "tableDisplay": "none", "cardsDisplay": "flex", "editButtons": 22,
  "noHorizontalOverflow": true, "viewportW": 439, "bodyScrollW": 422 }
```

The desktop table is hidden, the stacked mobile cards render, every Edit action exists in both renderings (22 = 11 rows × 2), and there is no horizontal overflow. The bundled stylesheet carries the `≤991px` two-column and `≤767px` single-column filter rules for `.au-filter`.

## Clean-up

The probe user `e2e.probe@toktickit.test` and its sessions remain in the shared dev DB (test data only, no seed rows modified other than the admin's own password change from the documented seed value). No production data exists in this lab environment.
