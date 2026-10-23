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
- Employee-page translation uses src/lib/i18n.tsx (LanguageProvider, gated by V6 access; unknown strings fall back to English). Change log undo goes only through admin_revert_change (admin + V7 access, marks audit_log.reverted_at). Why: keeps language and undo independently testable and undo server-controlled and logged.
- Location freshness is enforced twice: getPosition() re-reads GPS and rejects fixes older than LOCATION_FRESH_MS (15s), and clock_action/outing_action re-check the fix's _captured_at (max 60s) and accuracy (max 150m) server-side for security-enabled users, logging stale_location/low_accuracy flags. Why: a cached phone location must never pass a punch, even if the browser is manipulated.
