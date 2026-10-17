-- Billing documents: what the first release left open.
--
--   1. billing_settings.vat_regime_confirmed_at — invoices are numbered without gaps and
--      can't be edited, so none is issued until whoever answers for TicketSafe's VAT
--      regime has confirmed it. NULL means "not confirmed yet": the edge function
--      refuses to issue an invoice (statements are not affected). To open invoicing,
--      set the regime and confirm it in one statement, e.g. for the franchise en base:
--        update public.billing_settings set vat_exempt = true, vat_regime_confirmed_at = now() where id;
--      or, when TicketSafe charges VAT:
--        update public.billing_settings set vat_exempt = false, vat_number = 'FR…', vat_rate_bps = 2000,
--               vat_regime_confirmed_at = now() where id;
--   2. billing_settings.vat_on_debits — the "option pour le paiement de la TVA d'après les
--      débits" mention, which an invoice has to carry when the company has made that option.
--   3. The late-payment clause. The first version said interest "au taux légal", which is
--      below the floor: art. L441-10 C. com. sets the rate at no less than three times the
--      legal interest rate, due the day after the due date. The stored clause is replaced
--      when it still is the first version's default (the edge function also falls back on
--      the standard clause whenever the stored one doesn't state a compliant rate).
--   4. Unit prices excl. tax can have more than two decimals once VAT is charged (a fee of
--      0,70 € is 0,5833 € excl. tax), so the line item column holds a fraction of a cent.
--   5. One line number per invoice, once: a retried request can't store the same lines twice.

alter table public.billing_settings
  add column if not exists vat_regime_confirmed_at timestamptz,
  add column if not exists vat_on_debits boolean not null default false;

comment on column public.billing_settings.vat_regime_confirmed_at is
  'When the VAT regime above (vat_exempt, vat_number, vat_rate_bps) was confirmed as correct. NULL = not confirmed: no invoice can be issued.';
comment on column public.billing_settings.vat_on_debits is
  'TRUE when the company has opted to pay VAT on debits; the invoice then says so (mandatory mention).';

alter table public.billing_settings
  alter column late_payment_penalty_mention set default
    'En cas de retard de paiement, des pénalités de retard sont exigibles dès le lendemain de la date d''échéance, sans qu''un rappel soit nécessaire, au taux de trois fois le taux d''intérêt légal en vigueur (art. L441-10 du Code de commerce). Tout retard de paiement entraîne également, de plein droit, une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce), sans préjudice d''une indemnisation complémentaire si les frais réels de recouvrement sont supérieurs à ce montant.';

update public.billing_settings
   set late_payment_penalty_mention =
         'En cas de retard de paiement, des pénalités de retard sont exigibles dès le lendemain de la date d''échéance, sans qu''un rappel soit nécessaire, au taux de trois fois le taux d''intérêt légal en vigueur (art. L441-10 du Code de commerce). Tout retard de paiement entraîne également, de plein droit, une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 du Code de commerce), sans préjudice d''une indemnisation complémentaire si les frais réels de recouvrement sont supérieurs à ce montant.',
       updated_at = now()
 where late_payment_penalty_mention =
         'Tout retard de paiement entraîne, de plein droit, l''application d''un intérêt de retard au taux légal en vigueur ainsi qu''une indemnité forfaitaire de 40 € pour frais de recouvrement (art. L441-10 et D441-5 C. com.), sans préjudice d''une indemnisation complémentaire si les frais réels de recouvrement sont supérieurs à ce montant.';

-- No invoice line has been written yet, so changing the type rewrites nothing.
alter table public.billing_document_lines
  alter column unit_price_cents type numeric(14, 4);

comment on column public.billing_document_lines.unit_price_cents is
  'Unit price excl. tax, in cents. A fraction of a cent when VAT is charged (0,70 € incl. tax = 58.3333).';

create unique index if not exists billing_document_lines_document_line_uidx
  on public.billing_document_lines (document_id, line_no);
