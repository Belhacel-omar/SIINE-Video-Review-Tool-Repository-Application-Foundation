# Backend Task 01 Engineering Notes

PostgreSQL + Drizzle ORM. Delete behavior: deleting a Course cascades Videos and their Reviews; deleting a Video cascades Reviews; Users are restricted while referenced by Courses/Reviews; Sessions cascade with User deletion. This avoids orphan content while preventing accidental creator/reviewer deletion.

Passwords use bcrypt with cost 12 for Vercel portability. Policy: 12-256 characters, at least one letter and one digit. No public signup. Admin provisioning is explicit and idempotent: it reads ADMIN_EMAIL/ADMIN_INITIAL_PASSWORD server-side, creates only when the normalized email does not exist, and never resets an existing password.

Sessions are opaque 256-bit random tokens. Only SHA-256 token digests are persisted; the raw token exists only in an HttpOnly SameSite=Lax cookie, Secure in production, seven-day lifetime. Password change invalidates all sessions.

No Production DB access or deployment is part of this task.
