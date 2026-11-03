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
Settings; pages about/services/contact; 4 links (3 audience both, "National Scholarship Portal" users-only). Owner admin 7396406422 (upserted; password set only on first insert, so an owner-changed password is never overwritten).

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

- Missing documents request: in the detail sheet the admin ticks items from the service's current required_documents (detail response field service_required_documents) plus custom items and an optional note → POST /api/attachments/{id}/missing {documents, note} (admin only; an empty list clears the request). This posts a thread message, sets attachment.missing_documents, keeps missing_resolved only for items still requested, and makes the user unread → live toast and chime. The user sees a checklist (testid missing-user-checklist) with an Upload button per item → POST messages with for_document=<doc> plus a file, which adds the doc to missing_resolved. for_document must be one of the requested items, user only, with a file, otherwise 400. File rows show a "N documents needed" or "Documents sent" badge.

## Wallet
- users.wallet_balance. Collections: wallet_transactions {id, user_id, type credit|debit, amount, reason, balance_after, created_by (admin name or "system"), created_at}; wallet_requests {id, user_id, amount?, txn_last5 (5 digits), status pending|approved|rejected, credited_amount, admin_note}. settings key "wallet" {upi_id, payee_name, qr_file_id}.
- User: the WalletButton chip (balance) sits in the portal header and in the public header when a user is logged in. The dialog shows a UPI QR built from the admin's UPI ID (amount pre-filled if typed) and/or the uploaded shop QR image (toggle). The user enters an optional amount plus the last 5 digits → POST /api/wallet/requests (409 on a duplicate txn, max 5 pending). GET /api/wallet/me is polled every 5s; a toast and chime play on a credit or rejection.
- Admin: Wallet tab (/admin?tab=wallet): pending payments (approve with an editable amount → credit; reject), payment settings (UPI ID + payee, QR image upload/remove), user balance cards with Add/Remove, an activity log. The Users table has a Wallet column button that opens the same Add/Remove dialog. Sidebar badge plus chime on a new pending payment. API under /api/admin/wallet/*. Debits are atomic and return 402 if the balance is too low.
- Submit flow: in the user's UploadBar, files and camera batches are staged ("Ready to submit") and the total fee is shown. Submit uploads them and the server ALWAYS charges fee × files from the wallet (camera PDF = 1 file); 402 "Insufficient wallet balance" if too low, and the button is disabled when the balance is short. The deduct_fees setting is no longer used.
- Timer: counts from created_at (submission) in every status until Generated, then freezes at generated_at − created_at. The daily-report avg_minutes uses the same rule.

## API (all under /api)
auth: GET setup-status, POST setup, POST login, POST logout, GET/PUT me, POST me/password, GET me/links
public: GET site, GET pages/{slug}
admin (admin only): users CRUD + /users/{id}/reset-password, GET stats, pages CRUD, links CRUD, PUT settings

## Refunds, rejection, low balance, fee report (latest)
- Each attachment stores `fee_charged` (the per-file fee taken at Submit) and `fee_refunded`. Older files have no `fee_charged`, so they are never refunded.
- Admin **Reject** (POST /api/attachments/{id}/reject, optional reason): status becomes `rejected` and the timer freezes at `rejected_at`. A chat message goes to the user and the fee is refunded once. A receipt can't be sent for a rejected file, and a file that already has a receipt can't be rejected (409).
- Admin **Delete**, single or bulk: refunds the fee automatically when the file has no receipt yet (`generated_at` is not set). DeleteResult.refunded returns the total refunded.
- Wallet transactions now carry `category` (fee/refund/topup/adjust) and `service_id`.
- Low balance banner (user portal): `/api/wallet/me` returns `usual_fee` and `usual_service_name`. The usual service is the user's most-used assigned service, or the priciest assigned one if they haven't submitted yet. The banner shows when balance < usual_fee, and its button opens the wallet dialog.
- Daily report: each day row has rejected, fees_collected, refunds and net_fees. The report also has totals for the range, and the service filter applies to fees too.
- Monthly income (GET /api/admin/reports/monthly-income?months=1-24, admin only): for each IST month, fees, refunds and net per service, sorted by net. Older fee rows without a service_id are matched to a service by name; deleted services use the name saved on their files. Shown under the daily report, with month chips and a top-earner badge.
- Reject quick reasons: one-tap chips in the Reject dialog (Blurry photo, Wrong document, Document incomplete, Details don't match, Document expired, Wrong service selected). Tapping a chip adds or removes that text in the editable reason.
- Resubmit (POST /api/attachments/{id}/resubmit, user only, one PDF/JPG/PNG file): only works on the user's own rejected file and only once (409 after that). It creates a new file with the same service and `resubmit_of` set; the original gets `resubmitted_as`. The service fee is charged again (it was refunded on reject); if the wallet is too low the server returns 402 and the claim is undone so the user can retry. Resubmitted files carry a "Resubmitted" tag.
- Custom reject reasons: GET/PUT /api/admin/reject-reasons (admin only, max 30, stored in settings key "reject_reasons", defaults to 6 built-in reasons). Edited in Site settings → Quick reject reasons; the Reject dialog shows this list as chips.
- Monthly income PDF: GET /api/admin/reports/monthly-income.pdf?month=YYYY-MM (admin only, last 24 months). Built with reportlab and shows amounts as "Rs." because the base fonts have no ₹ symbol. Download button sits in the Monthly income section.

## Razorpay online top-up (replaces the QR + last-5-digits form for users)
- POST /api/create-order {amount: paise ≥100} (users only): creates a Razorpay order through the SDK and stores it in `razorpay_orders` (status created). Returns order_id, amount, currency and key_id (public key only). Missing keys → 503, Razorpay auth failure → 401, other gateway errors → 500.
- POST /api/verify-payment {razorpay_order_id, razorpay_payment_id, razorpay_signature}: missing fields → 400. It checks HMAC-SHA256(order_id|payment_id, KEY_SECRET) with compare_digest (mismatch → 400, nothing credited) and that the order belongs to the caller. It then claims the order (created→paid) exactly once and credits the wallet (category topup). A replay returns credited 0.
- GET /api/admin/payments/status → configured + test/live mode, shown as a card in the admin Wallet tab.
- Frontend: lib/razorpay.ts loads checkout.js on demand and opens the modal. A failed payment shows a toast and keeps the modal open for a retry; closing the modal shows "cancelled". The wallet dialog has quick-pick amounts (₹100/200/500/1000), an any-amount box and a "Pay ₹X online" button.
- Older QR claims still show in the admin Wallet tab only while some are pending. The QR/UPI settings card was removed from view, but the owner's UPI data is left untouched in the DB.
- Keys: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in backend/.env (secure secrets). No frontend env var is used; the key_id comes from the create-order response.
