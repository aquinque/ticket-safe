-- Billing documents: organizer sales statements ("relevé de ventes") and
-- TicketSafe service-fee invoices ("facture"), generated server-side only
-- (see supabase/functions/generate-billing-document). This migration adds:
--
--   1. Organizer billing identity (SIREN/RNA, address) — needed to print a
--      "Client" block on an invoice; currently organizer_profiles has no
--      address at all.
--   2. billing_settings — ONE central row holding TicketSafe's own legal
--      identity (SIREN, capital, VAT regime, address). Seeded with the
--      real RCS Paris registration; VAT fields default to franchise-en-base
--      (art. 293 B CGI) since the company was only just incorporated —
--      ⚠️ VAT REGIME IS A DEFAULT, NOT A CONFIRMED FACT — verify with an
--      accountant before relying on it, flip vat_exempt + fill vat_number
--      here if TicketSafe later becomes VAT-liable. Nothing else in the
--      codebase needs to change if this flips — every PDF reads it live.
--   3. A gapless, concurrency-safe document-number allocator. Deliberately
--      NOT a plain `CREATE SEQUENCE`: a bare Postgres sequence is NOT
--      transactional — if the surrounding transaction rolls back after
--      calling nextval(), that number is gone forever, which is a real gap
--      under the légal "sans trou" requirement (L441-9 C. com.). Using a
--      locked counter TABLE instead ties the increment to the same
--      transaction as the document insert: a rollback undoes the
--      increment too, so a number is only ever "spent" on a real commit.
--   4. billing_documents / billing_document_lines — one row per generated
--      PDF. Numbered legal documents (service_invoice/credit_note) are
--      created exactly once and are immutable from creation (DB trigger
--      blocks mutating financial fields, blocks hard deletes entirely —
--      corrections must be a credit note, never an edit). Sales statements
--      may legitimately be regenerated while still 'provisoire' (event not
--      yet fully paid out), then freeze the same way once 'definitif'.
--   5. A private Storage bucket for the generated PDFs. No client-facing
--      storage policies at all — the only way to read a file is a
--      short-lived signed URL minted by the edge function (service role),
--      which is the same pattern already used for ticket-files/
--      external-tickets in this project.

-- ───────────────────────────────────────────────────────────────────────
-- 1. Organizer billing identity (nullable — most existing organizers have
--    none of this yet; the invoice "Client" block just omits a missing
--    field rather than failing).
-- ───────────────────────────────────────────────────────────────────────
alter table public.organizer_profiles
  add column if not exists siren text
    check (siren is null or siren ~ '^[0-9]{9}$'),
  add column if not exists rna_number text,
  add column if not exists billing_address_line1 text,
  add column if not exists billing_postal_code text,
  add column if not exists billing_city text,
  add column if not exists billing_country text default 'France';

comment on column public.organizer_profiles.siren is
  'French SIREN (9 digits), if the organizer is a registered company/association. Optional — many student unions only have an RNA number.';
comment on column public.organizer_profiles.rna_number is
  'French "Répertoire National des Associations" number (loi 1901 associations), used on invoices when no SIREN exists.';

-- ───────────────────────────────────────────────────────────────────────
-- 2. billing_settings — singleton table (id must be TRUE, so only one row
--    can ever exist). Service-role only; edit via SQL for now, no admin UI
--    yet (flagged in the delivery report).
-- ───────────────────────────────────────────────────────────────────────
create table public.billing_settings (
  id boolean primary key default true check (id),
  legal_name text not null default 'Ticket Safe',
  legal_form text not null default 'Société par actions simplifiée (SAS)',
  share_capital_cents integer not null default 100000, -- 1 000,00 €
  siren text not null default '105533632',
  rcs_city text not null default 'Paris',
  rcs_full_label text not null default '105 533 632 R.C.S. Paris',
  euid text default 'FR7501.105533632',
  address_line1 text not null default '2 rue Wilhem',
  postal_code text not null default '75016',
  city text not null default 'Paris',
  country text not null default 'France',
  support_email text not null default 'ticketsafe.friendly@gmail.com',
  -- ⚠️ À VALIDER — see header comment. Defaults to franchise en base.
  vat_exempt boolean not null default true,
  vat_number text,
  vat_exempt_mention text not null default
    'TVA non applicable, article 293 B du Code général des impôts.',
  vat_rate_bps integer not null default 2000, -- used only if vat_exempt = false
  late_payment_penalty_mention text not null default
    'Tout retard de paiement entraîne, de plein droit, l''application d''un intérêt de retard au taux légal en vigueur ainsi qu''une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 C. com.), sans préjudice d''une indemnisation complémentaire si les frais réels de recouvrement sont supérieurs à ce montant.',
  updated_at timestamptz not null default now()
);

insert into public.billing_settings (id) values (true);

alter table public.billing_settings enable row level security;
-- No policies at all for authenticated/anon: service_role (edge functions)
-- bypasses RLS and is the only intended reader/writer for now.

-- ───────────────────────────────────────────────────────────────────────
-- 3. Gapless document numbering — locked counter table + allocator fn.
-- ───────────────────────────────────────────────────────────────────────
create table public.billing_document_counters (
  doc_type text primary key check (doc_type in ('service_invoice', 'credit_note')),
  last_number bigint not null default 0
);
insert into public.billing_document_counters (doc_type, last_number) values
  ('service_invoice', 0),
  ('credit_note', 0);

alter table public.billing_document_counters enable row level security;
-- No policies — service_role only (reached exclusively through the
-- SECURITY DEFINER function below, never touched directly).

create or replace function public.next_billing_document_number(p_doc_type text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_seq bigint;
  v_prefix text;
  v_year text := to_char(now(), 'YYYY');
begin
  if p_doc_type not in ('service_invoice', 'credit_note') then
    raise exception 'next_billing_document_number: invalid doc_type %', p_doc_type;
  end if;

  -- UPDATE ... RETURNING on a single row takes a row lock for the rest of
  -- this transaction: a concurrent caller simply waits its turn (no two
  -- callers can ever read the same last_number), and if THIS transaction
  -- later rolls back, the increment rolls back with it — no gap.
  update public.billing_document_counters
    set last_number = last_number + 1
    where doc_type = p_doc_type
    returning last_number into v_seq;

  if v_seq is null then
    raise exception 'next_billing_document_number: missing counter row for %', p_doc_type;
  end if;

  v_prefix := case p_doc_type when 'service_invoice' then 'TS-F' else 'TS-A' end;
  return v_prefix || '-' || v_year || '-' || lpad(v_seq::text, 6, '0');
end;
$$;

revoke all on function public.next_billing_document_number(text) from public, authenticated, anon;
grant execute on function public.next_billing_document_number(text) to service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 4. billing_documents / billing_document_lines
-- ───────────────────────────────────────────────────────────────────────
create table public.billing_documents (
  id uuid primary key default gen_random_uuid(),
  doc_type text not null check (doc_type in ('sales_statement', 'service_invoice', 'credit_note')),
  -- RESTRICT (not CASCADE): a financial record must never disappear just
  -- because someone deletes the event/organizer row above it. There is no
  -- delete path for either table today, but this makes it impossible even
  -- if one is added later without this table being considered.
  organizer_id uuid not null references public.organizer_profiles(id) on delete restrict,
  event_id uuid references public.events(id) on delete restrict,
  related_invoice_id uuid references public.billing_documents(id) on delete restrict,
  document_number text unique, -- legal sequential number for invoice/credit_note; a simple human reference for sales_statement
  status text not null default 'provisoire' check (status in ('provisoire', 'definitif')),
  storage_path text not null default '',
  file_hash text not null default '', -- sha256 hex of the stored PDF, for integrity verification
  currency text not null default 'EUR',
  totals jsonb not null default '{}'::jsonb,
  period_start timestamptz,
  period_end timestamptz,
  service_date date, -- invoice: "date de la prestation"
  issued_at timestamptz not null default now(), -- immutable emission date once definitif
  created_by uuid references auth.users(id),
  deleted_at timestamptz, -- soft delete only — see trigger below, hard DELETE is blocked
  created_at timestamptz not null default now()
);

-- At most one *current* statement and one *current* invoice per event.
-- Credit notes are deliberately excluded (several corrections can exist).
create unique index billing_documents_one_current_per_event
  on public.billing_documents (event_id, doc_type)
  where doc_type in ('sales_statement', 'service_invoice') and deleted_at is null;

create index billing_documents_organizer_idx on public.billing_documents (organizer_id);
create index billing_documents_event_idx on public.billing_documents (event_id);

create table public.billing_document_lines (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.billing_documents(id) on delete restrict,
  line_no integer not null,
  description text not null,
  quantity numeric not null default 1,
  unit_price_cents integer not null,
  vat_rate_bps integer not null default 0,
  vat_cents integer not null default 0,
  total_ht_cents integer not null,
  total_ttc_cents integer not null,
  created_at timestamptz not null default now()
);
create index billing_document_lines_document_idx on public.billing_document_lines (document_id);

-- Immutability: once a row is 'definitif', its financial content can never
-- change again (only deleted_at, for soft delete, is still writable).
create or replace function public.prevent_billing_document_mutation()
returns trigger
language plpgsql
as $$
begin
  if OLD.status = 'definitif' then
    if NEW.document_number is distinct from OLD.document_number
      or NEW.storage_path is distinct from OLD.storage_path
      or NEW.file_hash is distinct from OLD.file_hash
      or NEW.totals is distinct from OLD.totals
      or NEW.currency is distinct from OLD.currency
      or NEW.period_start is distinct from OLD.period_start
      or NEW.period_end is distinct from OLD.period_end
      or NEW.service_date is distinct from OLD.service_date
      or NEW.issued_at is distinct from OLD.issued_at
      or NEW.doc_type is distinct from OLD.doc_type
      or NEW.organizer_id is distinct from OLD.organizer_id
      or NEW.event_id is distinct from OLD.event_id
      or NEW.status is distinct from OLD.status
    then
      raise exception 'billing_documents: document % is definitif and immutable — issue a credit note instead', OLD.id;
    end if;
  end if;
  return NEW;
end;
$$;

create trigger billing_documents_immutable
  before update on public.billing_documents
  for each row execute function public.prevent_billing_document_mutation();

-- Hard delete is never allowed on either table — 10-year retention,
-- soft-delete only (deleted_at).
create or replace function public.block_table_hard_delete()
returns trigger
language plpgsql
as $$
begin
  raise exception '%: hard delete is not allowed on this table (immutable financial record) — use soft delete', TG_TABLE_NAME;
end;
$$;

create trigger billing_documents_no_hard_delete
  before delete on public.billing_documents
  for each row execute function public.block_table_hard_delete();

create trigger billing_document_lines_no_hard_delete
  before delete on public.billing_document_lines
  for each row execute function public.block_table_hard_delete();

-- Lines are write-once: created alongside a 'definitif' invoice/credit
-- note and never touched again (sales_statement doesn't use this table).
create or replace function public.block_table_update()
returns trigger
language plpgsql
as $$
begin
  raise exception '%: this table is write-once — rows cannot be updated after insert', TG_TABLE_NAME;
end;
$$;

create trigger billing_document_lines_no_update
  before update on public.billing_document_lines
  for each row execute function public.block_table_update();

-- RLS: an organizer sees only their own (non-deleted) documents; admins see
-- everything. No INSERT/UPDATE/DELETE policy for authenticated/anon at
-- all — every write goes through the SECURITY DEFINER functions below,
-- called only by the edge function with the service-role key.
alter table public.billing_documents enable row level security;

create policy billing_documents_owner_select on public.billing_documents
  for select to authenticated
  using (
    deleted_at is null
    and (
      organizer_id in (select id from public.organizer_profiles where user_id = auth.uid())
      or exists (select 1 from public.user_roles where user_id = auth.uid() and role = 'admin')
    )
  );

alter table public.billing_document_lines enable row level security;
-- No policies — the frontend never needs line items directly, only the
-- rendered PDF via signed URL. Service-role (edge function) only.

-- ───────────────────────────────────────────────────────────────────────
-- 5. Two SECURITY DEFINER functions used by the edge function. Splitting
--    "reserve" (allocates the number + row, inside one transaction) from
--    "finalize" (attaches the rendered file once uploaded) lets a crash
--    between the two steps resume safely: the next attempt finds the
--    existing 'provisoire' row (same id, same already-spent number) and
--    finishes it, rather than reserving a second number.
-- ───────────────────────────────────────────────────────────────────────
create or replace function public.reserve_billing_document(
  p_doc_type text,
  p_organizer_id uuid,
  p_event_id uuid,
  p_related_invoice_id uuid,
  p_totals jsonb,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_service_date date,
  p_created_by uuid
)
returns public.billing_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.billing_documents;
  v_number text;
begin
  if p_doc_type not in ('sales_statement', 'service_invoice', 'credit_note') then
    raise exception 'reserve_billing_document: invalid doc_type %', p_doc_type;
  end if;

  -- sales_statement: reuse the existing non-deleted row for this event
  -- while it's still provisoire (regeneration). A definitif statement must
  -- never be touched again — the caller is expected to just re-serve its
  -- stored file instead of calling this function.
  if p_doc_type = 'sales_statement' then
    select * into v_row
      from public.billing_documents
      where event_id = p_event_id and doc_type = 'sales_statement' and deleted_at is null
      for update;

    if found then
      if v_row.status = 'definitif' then
        raise exception 'reserve_billing_document: statement for event % is already definitif', p_event_id;
      end if;
      update public.billing_documents
        set totals = p_totals, period_start = p_period_start, period_end = p_period_end
        where id = v_row.id
        returning * into v_row;
      return v_row;
    end if;

    insert into public.billing_documents (
      doc_type, organizer_id, event_id, totals, period_start, period_end, created_by, status
    ) values (
      'sales_statement', p_organizer_id, p_event_id, p_totals, p_period_start, p_period_end, p_created_by, 'provisoire'
    ) returning * into v_row;

    update public.billing_documents
      set document_number = 'REL-' || upper(substr(v_row.id::text, 1, 8))
      where id = v_row.id
      returning * into v_row;

    return v_row;
  end if;

  -- service_invoice / credit_note: a real legal number, allocated exactly
  -- once. If a row already exists for this event (invoice) it must be
  -- served as-is — never re-reserved.
  if p_doc_type = 'service_invoice' then
    select * into v_row
      from public.billing_documents
      where event_id = p_event_id and doc_type = 'service_invoice' and deleted_at is null;
    if found then
      return v_row; -- caller checks status: 'definitif' => just serve file; 'provisoire' => resume finalize with the SAME row/number
    end if;
  end if;

  v_number := public.next_billing_document_number(p_doc_type);

  insert into public.billing_documents (
    doc_type, organizer_id, event_id, related_invoice_id, document_number,
    totals, period_start, period_end, service_date, created_by, status
  ) values (
    p_doc_type, p_organizer_id, p_event_id, p_related_invoice_id, v_number,
    p_totals, p_period_start, p_period_end, p_service_date, p_created_by, 'provisoire'
  ) returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.reserve_billing_document(text, uuid, uuid, uuid, jsonb, timestamptz, timestamptz, date, uuid) from public, authenticated, anon;
grant execute on function public.reserve_billing_document(text, uuid, uuid, uuid, jsonb, timestamptz, timestamptz, date, uuid) to service_role;

create or replace function public.finalize_billing_document(
  p_document_id uuid,
  p_storage_path text,
  p_file_hash text,
  p_status text
)
returns public.billing_documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.billing_documents;
begin
  if p_status not in ('provisoire', 'definitif') then
    raise exception 'finalize_billing_document: invalid status %', p_status;
  end if;

  select * into v_row from public.billing_documents where id = p_document_id for update;
  if not found then
    raise exception 'finalize_billing_document: document % not found', p_document_id;
  end if;
  if v_row.status = 'definitif' then
    raise exception 'finalize_billing_document: document % is already definitif', p_document_id;
  end if;

  update public.billing_documents
    set storage_path = p_storage_path, file_hash = p_file_hash, status = p_status
    where id = p_document_id
    returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.finalize_billing_document(uuid, text, text, text) from public, authenticated, anon;
grant execute on function public.finalize_billing_document(uuid, text, text, text) to service_role;

-- ───────────────────────────────────────────────────────────────────────
-- 6. Private storage bucket. No object-level policies at all: the edge
--    function (service role) is the only writer, and the only reader path
--    is a short-lived signed URL it mints — never a direct bucket read.
-- ───────────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('billing-documents', 'billing-documents', false)
on conflict (id) do nothing;
