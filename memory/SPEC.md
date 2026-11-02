# Sevakendra — Live Website Management Dashboard

## What it does
- Public website (`/`, `/p/:slug`) whose pages, links, headline, contact info and announcement are managed live by admins.
- One-time first-admin setup at `/admin/setup` (name, 10-digit mobile, password). Closed (403) once any admin exists.
- Single login `/login` (mobile + password) → admins go to `/admin`, users to `/portal`.
- Admin console `/admin?tab=overview|users|pages|links|settings`: stats + recent sign-ins; create/edit/delete users, reset password, activate/deactivate, role user|admin; CRUD pages (show_in_nav, order); CRUD website links (audience public|users|both, visible); site settings.
- User portal `/portal`: welcome card (name, mobile), edit name, change password, searchable quick links (audience users|both, active).

## Auth
- httpOnly cookie `sk_session` (sessions collection, 7d TTL). User re-read every request; inactive/deleted users get 401. Deactivate/reset/delete revokes sessions.
- Admin cannot delete/deactivate/demote self.

## Data model (Mongo)
- users {id, name, mobile(unique, ^[6-9]\d{9}$), password_hash(bcrypt), role, is_active, created_at, last_login}
- sessions {token, user_id, expires_at}
- pages {id, title, slug(unique), excerpt, content, show_in_nav, order, updated_at}
- links {id, title, url, description, category, audience, is_active, order, created_at}
- settings {key:"site", site_name, tagline, hero_title, hero_subtitle, announcement, helpline, email, address}

## Seed (`python backend/seed.py`, idempotent)
Settings; pages about/services/contact; 4 links (3 audience both, "National Scholarship Portal" users-only). No accounts.

## API (all under /api)
auth: GET setup-status, POST setup, POST login, POST logout, GET/PUT me, POST me/password, GET me/links
public: GET site, GET pages/{slug}
admin (admin only): users CRUD + /users/{id}/reset-password, GET stats, pages CRUD, links CRUD, PUT settings
