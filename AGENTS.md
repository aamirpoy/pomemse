<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- Check-in/out goes only through the `clock_action` DB function, which enforces the office radius server-side; attendance has no client insert/update policies so location can't be bypassed.
- Employee accounts are created by admins via server functions (service role); the first admin is bootstrapped on /auth only while no admin exists.
- Roles live in `user_roles` and are checked with `has_role`; never store roles on profiles.
- Admin changes are recorded by DB triggers into `audit_log` (admin-read-only), so every edit path is logged without app code changes.
- Employee totals use `employeeTotalMs`; admin reports use `totalMs` with an explicit break mode, keeping report-only deductions out of employee views.
- Work outings: employee 'Going out for work' / 'Back in office' only via outing_action DB function; checkout auto-closes open outings. Why: keeps attendance writes server-controlled.
- Every punch (check-in/out, meeting out/back) is logged with device ID, IP (from request headers) and flags by log_punch inside clock_action/outing_action; geofence failures return {error} instead of raising so the attempt is kept. Why: silent, server-side fraud detection.
- New updates use the named catalog in src/lib/feature-versions.ts and independent public.feature_access overrides plus public.feature_rollouts defaults; has_feature_access is enforced inside punch functions. Never auto-enable a newly added version. Why: admins test each update with chosen staff or everyone without bundling unrelated access.
- Anti-buddy-punch: V4 `device_approval` gates clock_action/outing_action on an admin-approved row in `trusted_devices` (unknown devices auto-register as pending and are blocked); V5 `biometric_check` requires a WebAuthn platform passkey verified by src/lib/biometric.functions.ts, which writes a 2-minute `biometric_passes` row that clock_action consumes. Why: device approval stops login sharing; the passkey ties the punch to the person, not just the phone.
- The vite.config.ts plugin prepends reflect-metadata to tsyringe (pulled in by @simplewebauthn/server); keep it. Why: without it the published Worker crashes on startup and every page returns 500.
- Device setup uses authenticated register_my_device; trusted_devices has global device_id uniqueness and immutable account/device bindings, removable only through admin RLS. clock_action and outing_action share the private punch_device_error gate. Browser IDs are per-browser storage, not hardware identity. Why: prevents one registered browser from punching for multiple accounts, including concurrent registration.
- Every outside-office rejection returns JSON with distance_m and persists a flagged event regardless of V1 access; new_device excludes registered devices and outside_office requires a measured radius violation. Why: exceptions roll back security events and device failures must not masquerade as location failures.
- admin_reset_passkeys verifies admin/owner access, clears challenges and passes, and records a sanitized audit entry atomically. Why: revoked passkeys must not leave reusable verification passes.
- LanguageProvider is V6-gated with English fallback; undo uses admin_revert_change (admin + V7, stamps reverted_at). Why: language and logged undo remain independent.
- Location is requested on every action for everyone; getPosition rejects pre-request fixes (1s clock tolerance), invalid/future timestamps and fixes older than 15s. Both punch functions enforce a 30s timestamp window and valid accuracy up to 150m, independent of feature access. Why: opening a page must not supply a reusable old fix; browser GPS cannot guarantee exactness or defeat a forged client.
- Attendance success requires the requested action plus saved record ID/time, then an authorized read-back; handlers use an immediate ref lock and never replay writes. Why: empty responses, concurrent taps and failed reads must not display green success.
- Admin cleanup uses admin_cleanup_records with bounded explicit IDs, preview and confirmation; open records and recent audit history are excluded, and deletion writes a summary audit entry. Why: reclaim old operational data without automatic deletion or client-controlled permissions.
- Shared-network alerts persist matched account IDs at event time; matching is informational and never blocks office Wi-Fi use. Why: names remain resolvable without making IP identity claims.
- Connection errors use shared request-errors/app-toast feedback; retry reads only, never automatically replay clock_action or outing_action. Failed attendance reads block punches until refreshed. Why: a lost response may already have saved a punch, so repeating a toggle can reverse it.
- Admin notes live in admin-only attendance_admin_notes; a trigger moves and clears the attendance.admin_note compatibility input. Why: old and new employee clients cannot read private notes.
