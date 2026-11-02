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
Settings; pages about/services/contact; 4 links (3 audience both, "National Scholarship Portal" users-only). Owner admin 7396406422 / Raju@14773 (upserted; password re-applied on each run).

## User files & receipts (attachments)
- User uploads PDF/JPG/JPEG/PNG (≤10 MB each, up to 20 per request) via "Attach files" or the camera dialog (continuous capture → "Save as one PDF" (server combines with Pillow) or "Save as images"). Each file = one attachment (loose files, no grouping).
- Status (computed server-side on every read): not_started → seen (admin opens detail: GET /attachments/{id}) → processing (automatically 60s after seen; live timer counts from processing_at) → generated (admin attaches any file in the thread = receipt; timer freezes, shows total).
- Remarks thread per attachment: both sides post text and/or a file. Admin file = receipt (is_receipt). User file = extra file.
- Live: frontend polls /attachments every 4s; a toast plus Web Audio chime plays when the other side creates an event (upload, remark, receipt), and on your own successful upload. Unread dot per attachment; admin sidebar shows the unread count.
- Files stored in Mongo GridFS bucket "uploads" (metadata.owner_user_id). GET /files/{id}[?download=true] is allowed only for the owner or an admin, otherwise 404.
- Collections: attachments {id, user_id, user_name, user_mobile, file{file_id, filename, content_type, size}, created_at, seen_at, generated_at, last_event_at, last_event_role, last_event_text, unread_admin, unread_user, message_count}; attachment_messages {id, attachment_id, sender_id, sender_name, sender_role, text, file?, is_receipt, created_at}
- API: GET/POST /attachments, POST /attachments/camera (files, mode=pdf|images), GET /attachments/{id}, POST /attachments/{id}/messages (multipart text, file?), GET /files/{file_id}
- Admin UI: "User files" tab (/admin?tab=files) with status filters and search. User UI: "My files & receipts" section on /portal.

## Daily report & WhatsApp alerts
- Admin tab "Daily report" (/admin?tab=reports): GET /api/admin/reports/daily?days=7|14|30 (1–90) → per IST day: received, seen, generated, avg_minutes (same start rule as the on-screen timer), plus current status counts and the overall average.
- WhatsApp receipt alert: every admin receipt calls lib/whatsapp.queue_receipt_alert → `whatsapp_alerts` row with a message and login link (from the request Origin, else APP_URL). MOCKED: no provider is connected (WHATSAPP_PROVIDER unset) → status "not_connected", nothing is sent. Log at GET /api/admin/whatsapp-alerts, shown on the report tab.
- User status filters: shared StatusFilter chips on /portal (testids portal-files-filter-*) and the admin User files tab (files-filter-*).
- Admin deletes files: DELETE /api/attachments/{id} and POST /api/attachments/bulk-delete {ids} (admin only; users get 403). Removes the attachment, its messages, every GridFS file (original + thread files) and its whatsapp_alerts, so the report counts drop too. UI: row checkboxes + "Select all shown" + "Delete selected" (confirm dialog) on the User files tab; a trash icon in the file detail sheet.

## Services (work types)
- Each service also has fee (₹, ≥0, 0 = Free) and required_documents (list, one per line in the admin dialog). The user's UploadBar shows the fee and the documents checklist next to the service picker (testids upload-service-info, upload-service-fee, upload-required-docs). Attachments snapshot service_fee.
- Service filter: the admin User files tab has a service dropdown (files-service-filter, filters by service_name so deleted/General names still appear); the Daily report has report-service-filter → GET /admin/reports/daily?service_id=…
- The admin Overview (default dashboard tab) shows a live "User files" section (latest 8, status chips, opens the detail sheet, "View all files").
- Admin "Services" tab (/admin?tab=services): CRUD services {id, name (unique, case-insensitive), description, is_active, created_at}; list shows user_count. API: GET/POST /api/admin/services, PUT/DELETE /api/admin/services/{id}. Deleting a service $pulls it from every user's service_ids; existing files keep their stored service_name.
- Users have service_ids (admin ticks them in the Create/Edit user dialog; the Users table has a Services column). Ids are checked against existing services.
- User picks a service (required) in UploadBar from GET /api/services/mine (assigned + active only). POST /attachments and /attachments/camera require form field service_id; the server checks it is assigned to the caller and active, otherwise 403 (or 422 if missing). Attachments store service_id + service_name (snapshot); older files show "General".

## API (all under /api)
auth: GET setup-status, POST setup, POST login, POST logout, GET/PUT me, POST me/password, GET me/links
public: GET site, GET pages/{slug}
admin (admin only): users CRUD + /users/{id}/reset-password, GET stats, pages CRUD, links CRUD, PUT settings
