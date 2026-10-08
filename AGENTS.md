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
