-- =====================================================================
-- Sevakendra on Supabase — schema, Row Level Security, secure functions
-- Paste this whole file into Supabase Dashboard → SQL Editor → Run.
-- Safe to run more than once (idempotent). It never drops your data.
-- =====================================================================
create extension if not exists pgcrypto;

-- ---------- Tables ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  mobile text not null unique,
  email text not null,
  role text not null default 'user' check (role in ('admin','user')),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  last_login timestamptz,
  service_ids text[] not null default '{}',
  wallet_balance numeric(12,2) not null default 0
);
create table if not exists public.site_settings (key text primary key, doc jsonb not null default '{}');
create table if not exists public.pages (id text primary key, doc jsonb not null);
create table if not exists public.links (id text primary key, doc jsonb not null);
create table if not exists public.services (id text primary key, doc jsonb not null);
create table if not exists public.attachments (
  id text primary key, user_id uuid not null references public.profiles(id) on delete cascade,
  doc jsonb not null, created_at timestamptz not null default now());
create table if not exists public.attachment_messages (
  id text primary key, attachment_id text not null references public.attachments(id) on delete cascade,
  owner_id uuid not null, doc jsonb not null, created_at timestamptz not null default now());
create table if not exists public.wallet_transactions (
  id text primary key, user_id uuid not null, doc jsonb not null, created_at timestamptz not null default now());
create table if not exists public.wallet_requests (
  id text primary key, user_id uuid not null, doc jsonb not null, created_at timestamptz not null default now());
create table if not exists public.whatsapp_alerts (
  id text primary key, user_id uuid not null, doc jsonb not null, created_at timestamptz not null default now());
create index if not exists att_user on public.attachments(user_id);
create index if not exists msg_att on public.attachment_messages(attachment_id);
create index if not exists txn_user on public.wallet_transactions(user_id, created_at);
create index if not exists req_user on public.wallet_requests(user_id);

-- ---------- Helpers ----------
create or replace function public.is_admin() returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin' and is_active)
$$;
create or replace function public.me() returns profiles language plpgsql stable security definer set search_path = public as $$
declare p profiles;
begin
  select * into p from profiles where id = auth.uid();
  if p.id is null or not p.is_active then raise exception 'Account unavailable' using errcode = '28000'; end if;
  return p;
end $$;
create or replace function public.ts() returns text language sql stable as $$ select to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') $$;
create or replace function public.server_now() returns text language sql stable as $$ select public.ts() $$;

-- ---------- RLS ----------
do $$ declare t text; begin
  foreach t in array array['profiles','site_settings','pages','links','services','attachments','attachment_messages',
                           'wallet_transactions','wallet_requests','whatsapp_alerts'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists admin_all on public.%I', t);
    execute format('create policy admin_all on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())', t);
  end loop;
end $$;
-- Users only ever see their own rows. All user writes go through the functions below.
drop policy if exists own_read on public.profiles;
create policy own_read on public.profiles for select to authenticated using (id = auth.uid());
do $$ declare t text; begin
  foreach t in array array['attachments','wallet_transactions','wallet_requests','whatsapp_alerts'] loop
    execute format('drop policy if exists own_read on public.%I', t);
    execute format('create policy own_read on public.%I for select to authenticated using (user_id = auth.uid())', t);
  end loop;
end $$;
drop policy if exists own_read on public.attachment_messages;
create policy own_read on public.attachment_messages for select to authenticated using (owner_id = auth.uid());
-- Public website content.
drop policy if exists public_read on public.pages;
create policy public_read on public.pages for select to anon, authenticated using (coalesce((doc->>'is_published')::boolean, true));
drop policy if exists public_read on public.links;
create policy public_read on public.links for select to anon, authenticated using (coalesce((doc->>'is_active')::boolean, true));
drop policy if exists public_read on public.services;
create policy public_read on public.services for select to authenticated using (true);
drop policy if exists public_read on public.site_settings;
create policy public_read on public.site_settings for select to anon, authenticated
  using (key = 'site' or (key = 'wallet' and auth.uid() is not null));

-- ---------- Storage (private bucket, owner folder = user id) ----------
insert into storage.buckets (id, name, public, file_size_limit)
values ('uploads', 'uploads', false, 10485760) on conflict (id) do nothing;
drop policy if exists sk_read on storage.objects;
create policy sk_read on storage.objects for select to authenticated
  using (bucket_id = 'uploads' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists sk_insert on storage.objects;
create policy sk_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and (public.is_admin() or (storage.foldername(name))[1] = auth.uid()::text));
drop policy if exists sk_delete on storage.objects;
create policy sk_delete on storage.objects for delete to authenticated using (bucket_id = 'uploads' and public.is_admin());

-- ---------- Login by mobile number ----------
create or replace function public.login_email(p_mobile text) returns text language sql stable security definer set search_path = public as $$
  select email from profiles where mobile = p_mobile
$$;
create or replace function public.touch_login() returns void language sql security definer set search_path = public as $$
  update profiles set last_login = now() where id = auth.uid()
$$;
create or replace function public.update_my_name(p_name text) returns void language plpgsql security definer set search_path = public as $$
begin
  if length(trim(p_name)) < 2 then raise exception 'Name is too short'; end if;
  update profiles set name = trim(p_name) where id = (public.me()).id;
end $$;

-- ---------- Wallet core (atomic; balance can never go below zero) ----------
create or replace function public.wallet_apply(p_user uuid, p_kind text, p_amount numeric, p_reason text, p_by text,
  p_category text, p_att text default null, p_service text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare bal numeric; t jsonb; p profiles;
begin
  if p_amount <= 0 then raise exception 'Amount must be more than 0'; end if;
  if p_kind = 'debit' then
    update profiles set wallet_balance = wallet_balance - p_amount where id = p_user and wallet_balance >= p_amount returning * into p;
    if p.id is null then raise exception 'Not enough wallet balance' using errcode = 'P0402'; end if;
  else
    update profiles set wallet_balance = wallet_balance + p_amount where id = p_user returning * into p;
  end if;
  bal := p.wallet_balance;
  t := jsonb_build_object('id', gen_random_uuid()::text, 'user_id', p_user, 'user_name', p.name, 'user_mobile', p.mobile,
       'type', p_kind, 'amount', p_amount, 'balance_after', bal, 'reason', p_reason, 'created_by', p_by,
       'attachment_id', p_att, 'category', p_category, 'service_id', p_service, 'created_at', public.ts());
  insert into wallet_transactions(id, user_id, doc) values (t->>'id', p_user, t);
  return t;
end $$;
revoke execute on function public.wallet_apply from public, anon, authenticated;

create or replace function public.wallet_request(p_amount numeric, p_last5 text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public.me(); r jsonb;
begin
  if p_last5 !~ '^\d{5}$' then raise exception 'Enter exactly the last 5 digits'; end if;
  if (select count(*) from wallet_requests where user_id = p.id and doc->>'status' = 'pending') >= 5 then
    raise exception 'You already have 5 payments waiting'; end if;
  r := jsonb_build_object('id', gen_random_uuid()::text, 'user_id', p.id, 'user_name', p.name, 'user_mobile', p.mobile,
       'amount', p_amount, 'txn_last5', p_last5, 'status', 'pending', 'credited_amount', null, 'admin_note', '',
       'created_at', public.ts(), 'resolved_at', null);
  insert into wallet_requests(id, user_id, doc) values (r->>'id', p.id, r);
  return r;
end $$;

create or replace function public.admin_wallet_resolve(p_req text, p_approve boolean, p_amount numeric, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a profiles := public.me(); r wallet_requests;
begin
  if a.role <> 'admin' then raise exception 'Admin only'; end if;
  update wallet_requests set doc = doc || jsonb_build_object('status', case when p_approve then 'approved' else 'rejected' end,
      'credited_amount', case when p_approve then p_amount end, 'admin_note', coalesce(p_note, ''), 'resolved_at', public.ts())
    where id = p_req and doc->>'status' = 'pending' returning * into r;
  if r.id is null then raise exception 'Already handled'; end if;
  if p_approve then
    perform public.wallet_apply(r.user_id, 'credit', p_amount, 'Payment verified (Txn …' || (r.doc->>'txn_last5') || ')', a.name, 'topup');
  end if;
  return r.doc;
end $$;

create or replace function public.admin_wallet_adjust(p_user uuid, p_amount numeric, p_direction text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare a profiles := public.me();
begin
  if a.role <> 'admin' then raise exception 'Admin only'; end if;
  return public.wallet_apply(p_user, case when p_direction = 'remove' then 'debit' else 'credit' end, p_amount,
                             coalesce(nullif(trim(p_reason), ''), 'Manual adjustment'), a.name, 'adjust');
end $$;

-- ---------- Files ----------
create or replace function public._new_attachment(p profiles, s jsonb, f jsonb, fee numeric, extra jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = public as $$
declare d jsonb; now_s text := public.ts();
begin
  d := jsonb_build_object('id', coalesce(extra->>'id', gen_random_uuid()::text), 'user_id', p.id, 'user_name', p.name,
       'user_mobile', p.mobile, 'file', f, 'service_id', s->>'id', 'service_name', coalesce(s->>'name', 'General'),
       'service_fee', (s->>'fee')::numeric, 'created_at', now_s, 'seen_at', null, 'generated_at', null, 'unread_admin', true,
       'unread_user', false, 'last_event_at', now_s, 'last_event_role', 'user',
       'last_event_text', p.name || ' uploaded ' || (f->>'filename'), 'message_count', 0, 'fee_charged', fee, 'fee_refunded', false,
       'missing_documents', '[]'::jsonb, 'missing_resolved', '[]'::jsonb, 'paused_at', null, 'paused_seconds', 0) || (extra - 'id');
  insert into attachments(id, user_id, doc) values (d->>'id', p.id, d);
  return d;
end $$;
revoke execute on function public._new_attachment from public, anon, authenticated;

-- p_files: [{file_id, filename, content_type, size}] — file_id is the storage path "<uid>/<uuid>-name"
create or replace function public.user_submit(p_service_id text, p_files jsonb, p_fee_count int default null) returns setof jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public.me(); s jsonb; f jsonb; fee numeric; n int := jsonb_array_length(p_files);
begin
  if p.role <> 'user' then raise exception 'Only users submit files'; end if;
  if n = 0 or n > 20 then raise exception 'Attach 1 to 20 files'; end if;
  select doc into s from services where id = p_service_id and coalesce((doc->>'is_active')::boolean, true);
  if s is null or not (p_service_id = any(p.service_ids)) then raise exception 'Pick one of your services' using errcode = '42501'; end if;
  for f in select * from jsonb_array_elements(p_files) loop
    if split_part(f->>'file_id', '/', 1) <> p.id::text then raise exception 'Invalid file'; end if;
  end loop;
  fee := round(coalesce((s->>'fee')::numeric, 0), 2);
  if fee > 0 then
    perform public.wallet_apply(p.id, 'debit', fee * coalesce(p_fee_count, n), 'Fee: ' || (s->>'name') || ' × ' || coalesce(p_fee_count, n), 'system', 'fee', null, s->>'id');
  end if;
  for f in select * from jsonb_array_elements(p_files) loop
    return next public._new_attachment(p, s, f, case when fee > 0 then fee else 0 end);
  end loop;
end $$;

create or replace function public.user_resubmit(p_att text, p_file jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public.me(); a attachments; new_id text := gen_random_uuid()::text; fee numeric; s jsonb; d jsonb;
begin
  update attachments set doc = doc || jsonb_build_object('resubmitted_as', new_id)
    where id = p_att and user_id = p.id and doc->>'rejected_at' is not null and doc->>'resubmitted_as' is null returning * into a;
  if a.id is null then raise exception 'This file cannot be resubmitted'; end if;
  if split_part(p_file->>'file_id', '/', 1) <> p.id::text then raise exception 'Invalid file'; end if;
  fee := round(coalesce((a.doc->>'service_fee')::numeric, 0), 2);
  s := jsonb_build_object('id', a.doc->>'service_id', 'name', a.doc->>'service_name', 'fee', fee);
  if fee > 0 then
    perform public.wallet_apply(p.id, 'debit', fee, 'Fee: ' || (s->>'name') || ' × 1 (resubmit)', 'system', 'fee', new_id, s->>'id');
  end if;
  d := public._new_attachment(p, s, p_file, fee, jsonb_build_object('id', new_id, 'resubmit_of', p_att,
        'last_event_text', p.name || ' resubmitted a corrected copy: ' || (p_file->>'filename')));
  insert into attachment_messages(id, attachment_id, owner_id, doc) values (gen_random_uuid()::text, p_att, p.id,
    jsonb_build_object('id', gen_random_uuid()::text, 'attachment_id', p_att, 'sender_id', p.id, 'sender_name', p.name, 'sender_role', 'user',
      'text', 'Corrected copy sent as a new file: ' || (p_file->>'filename'), 'file', null, 'is_receipt', false, 'created_at', public.ts()));
  update attachments set doc = doc || jsonb_build_object('last_event_at', public.ts(), 'last_event_role', 'user',
      'last_event_text', 'Corrected copy sent', 'unread_admin', true, 'message_count', coalesce((doc->>'message_count')::int, 0) + 1)
    where id = p_att;
  return d;
end $$;

-- Pause bookkeeping: returns doc patch that pauses/resumes the timer.
create or replace function public._pause(d jsonb, waiting boolean) returns jsonb language plpgsql stable as $$
begin
  if waiting and d->>'paused_at' is null then return jsonb_build_object('paused_at', public.ts()); end if;
  if not waiting and d->>'paused_at' is not null then
    return jsonb_build_object('paused_at', null, 'paused_seconds', coalesce((d->>'paused_seconds')::numeric, 0)
      + extract(epoch from now() - (d->>'paused_at')::timestamptz));
  end if;
  return '{}'::jsonb;
end $$;

create or replace function public.open_attachment(p_att text) returns void
language plpgsql security definer set search_path = public as $$
declare p profiles := public.me();
begin
  if p.role = 'admin' then
    update attachments set doc = doc || jsonb_build_object('unread_admin', false,
      'seen_at', coalesce(doc->'seen_at', 'null'::jsonb)) || case when doc->>'seen_at' is null then jsonb_build_object('seen_at', public.ts()) else '{}' end
    where id = p_att;
  else
    update attachments set doc = doc || '{"unread_user": false}' where id = p_att and user_id = p.id;
  end if;
end $$;

create or replace function public.post_message(p_att text, p_text text, p_file jsonb, p_for_document text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public.me(); a attachments; m jsonb; ch jsonb; is_rcpt boolean; resolved jsonb; now_s text := public.ts();
begin
  select * into a from attachments where id = p_att and (p.role = 'admin' or user_id = p.id);
  if a.id is null then raise exception 'File not found'; end if;
  if coalesce(trim(p_text), '') = '' and p_file is null then raise exception 'Write a remark or attach a file'; end if;
  if p_file is not null and split_part(p_file->>'file_id', '/', 1) <> a.user_id::text then raise exception 'Invalid file'; end if;
  if p.role = 'admin' and p_file is not null and a.doc->>'rejected_at' is not null then
    raise exception 'This file was rejected — a receipt can''t be sent for it'; end if;
  is_rcpt := p.role = 'admin' and p_file is not null;
  m := jsonb_build_object('id', gen_random_uuid()::text, 'attachment_id', p_att, 'sender_id', p.id, 'sender_name', p.name,
       'sender_role', p.role, 'text', coalesce(trim(p_text), ''), 'file', p_file, 'is_receipt', is_rcpt, 'created_at', now_s,
       'for_document', p_for_document);
  insert into attachment_messages(id, attachment_id, owner_id, doc) values (m->>'id', p_att, a.user_id, m);
  ch := jsonb_build_object('last_event_at', now_s, 'last_event_role', p.role, 'message_count', coalesce((a.doc->>'message_count')::int, 0) + 1,
        'last_event_text', p.name || case when is_rcpt then ' sent a receipt' when p_file is not null then ' sent a file' else ': ' || left(coalesce(p_text, ''), 80) end);
  if p.role = 'admin' then
    ch := ch || '{"unread_user": true}'::jsonb;
    if a.doc->>'seen_at' is null then ch := ch || jsonb_build_object('seen_at', now_s); end if;
    if is_rcpt then
      ch := ch || jsonb_build_object('receipt_ocr', 'pending', 'receipt_message_id', m->>'id');
      if a.doc->>'generated_at' is null then ch := ch || jsonb_build_object('generated_at', now_s) || public._pause(a.doc, false); end if;
      insert into whatsapp_alerts(id, user_id, doc) values (gen_random_uuid()::text, a.user_id, jsonb_build_object('id', gen_random_uuid()::text,
        'user_id', a.user_id, 'user_name', a.doc->>'user_name', 'user_mobile', a.doc->>'user_mobile', 'attachment_id', p_att,
        'status', 'not_connected', 'message', 'Your receipt is ready. Log in to Sevakendra to download it.', 'created_at', now_s));
    end if;
  else
    ch := ch || '{"unread_admin": true}'::jsonb;
    if p_for_document is not null then
      select coalesce(jsonb_agg(distinct x), '[]') into resolved from (select jsonb_array_elements_text(coalesce(a.doc->'missing_resolved', '[]')) x
        union select p_for_document) q;
      ch := ch || jsonb_build_object('missing_resolved', resolved) || public._pause(a.doc,
        a.doc->>'generated_at' is null and exists (select 1 from jsonb_array_elements_text(coalesce(a.doc->'missing_documents', '[]')) d
          where not resolved ? d));
    end if;
  end if;
  update attachments set doc = doc || ch where id = p_att;
  return m;
end $$;

-- Receipt reading result (browser OCR) — admin only, latest receipt wins.
create or replace function public.admin_set_receipt_ocr(p_att text, p_msg text, p_number text, p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  update attachments set doc = doc || jsonb_build_object('receipt_number', p_number, 'receipt_name', p_name,
    'receipt_ocr', case when p_number is null and p_name is null then 'not_found' else 'done' end)
  where id = p_att and doc->>'receipt_message_id' = p_msg;
end $$;

create or replace function public.admin_request_missing(p_att text, p_docs jsonb, p_note text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public.me(); a attachments; ch jsonb; kept jsonb; now_s text := public.ts(); txt text;
begin
  if p.role <> 'admin' then raise exception 'Admin only'; end if;
  select * into a from attachments where id = p_att;
  if a.id is null then raise exception 'File not found'; end if;
  select coalesce(jsonb_agg(x), '[]') into kept from jsonb_array_elements_text(coalesce(a.doc->'missing_resolved', '[]')) x where p_docs ? x;
  txt := case when jsonb_array_length(p_docs) = 0 then 'Missing-document request cleared.'
         else 'Please send these missing documents:' || (select string_agg(E'\n• ' || x, '') from jsonb_array_elements_text(p_docs) x)
              || coalesce(E'\n' || nullif(trim(p_note), ''), '') end;
  insert into attachment_messages(id, attachment_id, owner_id, doc) values (gen_random_uuid()::text, p_att, a.user_id,
    jsonb_build_object('id', gen_random_uuid()::text, 'attachment_id', p_att, 'sender_id', p.id, 'sender_name', p.name,
      'sender_role', 'admin', 'text', txt, 'file', null, 'is_receipt', false, 'created_at', now_s));
  ch := jsonb_build_object('missing_documents', p_docs, 'missing_note', coalesce(p_note, ''), 'missing_resolved', kept,
        'missing_requested_at', now_s, 'missing_reminded_at', null, 'last_event_at', now_s, 'last_event_role', 'admin',
        'last_event_text', case when jsonb_array_length(p_docs) = 0 then 'Request cleared' else 'Missing documents requested' end,
        'unread_user', true, 'message_count', coalesce((a.doc->>'message_count')::int, 0) + 1);
  if a.doc->>'seen_at' is null then ch := ch || jsonb_build_object('seen_at', now_s); end if;
  ch := ch || public._pause(a.doc, a.doc->>'generated_at' is null and a.doc->>'rejected_at' is null
        and exists (select 1 from jsonb_array_elements_text(p_docs) d where not kept ? d));
  update attachments set doc = doc || ch where id = p_att returning * into a;
  return a.doc;
end $$;

create or replace function public._refund(a attachments, p_reason text, p_by text) returns numeric
language plpgsql security definer set search_path = public as $$
declare fee numeric := coalesce((a.doc->>'fee_charged')::numeric, 0); n int;
begin
  if fee <= 0 or coalesce((a.doc->>'fee_refunded')::boolean, false) or a.doc->>'generated_at' is not null then return 0; end if;
  update attachments set doc = doc || '{"fee_refunded": true}' where id = a.id and not coalesce((doc->>'fee_refunded')::boolean, false);
  get diagnostics n = row_count;
  if n = 0 then return 0; end if;
  perform public.wallet_apply(a.user_id, 'credit', fee, 'Refund: ' || coalesce(a.doc->>'service_name', 'file') || ' — ' || p_reason,
                              p_by, 'refund', a.id, a.doc->>'service_id');
  return fee;
end $$;
revoke execute on function public._refund from public, anon, authenticated;

create or replace function public.admin_reject_file(p_att text, p_reason text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public.me(); a attachments; refunded numeric; txt text; now_s text := public.ts();
begin
  if p.role <> 'admin' then raise exception 'Admin only'; end if;
  update attachments set doc = doc || jsonb_build_object('rejected_at', now_s, 'reject_reason', trim(coalesce(p_reason, '')))
    where id = p_att and doc->>'rejected_at' is null and doc->>'generated_at' is null returning * into a;
  if a.id is null then raise exception 'File already finished or rejected'; end if;
  refunded := public._refund(a, 'file rejected', p.name);
  txt := 'This file was rejected.' || coalesce(E'\nReason: ' || nullif(trim(p_reason), ''), '')
         || case when refunded > 0 then E'\n₹' || refunded || ' has been returned to your wallet.' else '' end;
  insert into attachment_messages(id, attachment_id, owner_id, doc) values (gen_random_uuid()::text, p_att, a.user_id,
    jsonb_build_object('id', gen_random_uuid()::text, 'attachment_id', p_att, 'sender_id', p.id, 'sender_name', p.name,
      'sender_role', 'admin', 'text', txt, 'file', null, 'is_receipt', false, 'created_at', now_s));
  update attachments set doc = doc || jsonb_build_object('last_event_at', now_s, 'last_event_role', 'admin', 'unread_user', true,
      'last_event_text', 'File rejected' || case when refunded > 0 then ' · ₹' || refunded || ' refunded' else '' end,
      'message_count', coalesce((doc->>'message_count')::int, 0) + 1, 'fee_refunded', refunded > 0 or coalesce((doc->>'fee_refunded')::boolean, false))
      || case when doc->>'seen_at' is null then jsonb_build_object('seen_at', now_s) else '{}' end || public._pause(doc, false)
    where id = p_att returning * into a;
  return a.doc;
end $$;

-- Returns {deleted, refunded, paths[]}; the admin's browser then removes the storage files.
create or replace function public.admin_delete_files(p_ids text[]) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p profiles := public.me(); a attachments; total numeric := 0; n int := 0; paths text[] := '{}';
begin
  if p.role <> 'admin' then raise exception 'Admin only'; end if;
  for a in select * from attachments where id = any(p_ids) loop
    total := total + public._refund(a, 'file deleted', p.name);
    paths := paths || (a.doc->'file'->>'file_id') || coalesce((select array_agg(m.doc->'file'->>'file_id') from attachment_messages m
             where m.attachment_id = a.id and m.doc->'file' is not null and m.doc->'file' <> 'null'::jsonb), '{}');
    delete from whatsapp_alerts where doc->>'attachment_id' = a.id;
    delete from attachments where id = a.id;
    n := n + 1;
  end loop;
  return jsonb_build_object('deleted', n, 'refunded', total, 'paths', to_jsonb(paths));
end $$;

-- ---------- Admin: user accounts (no service-role key needed in the browser) ----------
create or replace function public.admin_create_user(p_name text, p_mobile text, p_password text, p_role text, p_services text[])
returns profiles language plpgsql security definer set search_path = public, auth, extensions as $$
declare uid uuid := gen_random_uuid(); em text := p_mobile || '@sevakendra.app'; pr profiles;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_mobile !~ '^[6-9]\d{9}$' then raise exception 'Enter a valid 10-digit mobile number'; end if;
  if length(p_password) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  if exists (select 1 from profiles where mobile = p_mobile) then raise exception 'Mobile number already registered'; end if;
  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data,
    raw_user_meta_data, created_at, updated_at, confirmation_token, email_change, email_change_token_new, recovery_token)
  values ('00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated', em, crypt(p_password, gen_salt('bf')),
    now(), '{"provider":"email","providers":["email"]}', jsonb_build_object('name', p_name), now(), now(), '', '', '', '');
  insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (gen_random_uuid(), uid, uid::text, jsonb_build_object('sub', uid::text, 'email', em), 'email', now(), now(), now());
  insert into profiles (id, name, mobile, email, role, service_ids) values (uid, trim(p_name), p_mobile, em, p_role, coalesce(p_services, '{}'))
    returning * into pr;
  return pr;
end $$;

create or replace function public.admin_update_user(p_user uuid, p_patch jsonb) returns profiles
language plpgsql security definer set search_path = public, auth as $$
declare pr profiles;
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_user = auth.uid() and (p_patch->>'role' = 'user' or p_patch->>'is_active' = 'false') then
    raise exception 'You cannot demote or deactivate yourself'; end if;
  if p_patch ? 'mobile' and exists (select 1 from profiles where mobile = p_patch->>'mobile' and id <> p_user) then
    raise exception 'Mobile number already registered'; end if;
  update profiles set name = coalesce(p_patch->>'name', name), mobile = coalesce(p_patch->>'mobile', mobile),
    role = coalesce(p_patch->>'role', role), is_active = coalesce((p_patch->>'is_active')::boolean, is_active),
    service_ids = coalesce((select array_agg(x) from jsonb_array_elements_text(p_patch->'service_ids') x), case when p_patch ? 'service_ids' then '{}' end, service_ids)
  where id = p_user returning * into pr;
  if p_patch ? 'mobile' and pr.email like '%@sevakendra.app' then
    update auth.users set email = pr.mobile || '@sevakendra.app' where id = p_user;
    update profiles set email = pr.mobile || '@sevakendra.app' where id = p_user returning * into pr;
  end if;
  if (p_patch->>'is_active') = 'false' then delete from auth.sessions where user_id = p_user; end if;
  return pr;
end $$;

create or replace function public.admin_reset_password(p_user uuid, p_password text) returns void
language plpgsql security definer set search_path = public, auth, extensions as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if length(p_password) < 6 then raise exception 'Password must be at least 6 characters'; end if;
  update auth.users set encrypted_password = crypt(p_password, gen_salt('bf')), updated_at = now() where id = p_user;
  delete from auth.sessions where user_id = p_user;
end $$;

create or replace function public.admin_delete_user(p_user uuid) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then raise exception 'Admin only'; end if;
  if p_user = auth.uid() then raise exception 'You cannot delete yourself'; end if;
  delete from auth.users where id = p_user;  -- cascades to profiles and their files' rows
end $$;

-- First-admin setup page: only while no admin exists.
create or replace function public.needs_setup() returns boolean language sql stable security definer set search_path = public as $$
  select not exists (select 1 from profiles where role = 'admin')
$$;

-- ---------- Daily missing-document reminder (pg_cron, hourly) ----------
create or replace function public.send_missing_doc_reminders() returns int
language plpgsql security definer set search_path = public as $$
declare a attachments; pending text[]; n int := 0; now_s text := public.ts();
begin
  for a in select * from attachments where jsonb_array_length(coalesce(doc->'missing_documents', '[]')) > 0
      and doc->>'generated_at' is null and doc->>'rejected_at' is null
      and (doc->>'missing_requested_at')::timestamptz <= now() - interval '1 day'
      and (doc->>'missing_reminded_at' is null or (doc->>'missing_reminded_at')::timestamptz <= now() - interval '1 day') loop
    select array_agg(x) into pending from jsonb_array_elements_text(a.doc->'missing_documents') x
      where not coalesce(a.doc->'missing_resolved', '[]') ? x;
    continue when pending is null;
    insert into attachment_messages(id, attachment_id, owner_id, doc) values (gen_random_uuid()::text, a.id, a.user_id,
      jsonb_build_object('id', gen_random_uuid()::text, 'attachment_id', a.id, 'sender_id', 'system', 'sender_name', 'Sevakendra',
        'sender_role', 'admin', 'text', E'Reminder: we''re still waiting for these documents to continue your application:\n• '
        || array_to_string(pending, E'\n• '), 'file', null, 'is_receipt', false, 'created_at', now_s));
    update attachments set doc = doc || jsonb_build_object('missing_reminded_at', now_s, 'last_event_at', now_s, 'last_event_role', 'admin',
      'unread_user', true, 'last_event_text', 'Reminder: ' || array_length(pending, 1) || ' document(s) still needed',
      'message_count', coalesce((doc->>'message_count')::int, 0) + 1) where id = a.id;
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.send_missing_doc_reminders from public, anon, authenticated;
create extension if not exists pg_cron;
select cron.schedule('missing-docs-remind', '0 * * * *', 'select public.send_missing_doc_reminders()');

grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
