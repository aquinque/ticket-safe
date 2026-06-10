/**
 * export-payout-batch v3 — batches the pending payouts and returns either:
 *   - format "sheet" (default): a clean, human-readable transfer sheet (.txt)
 *     listing each beneficiary / IBAN / amount / reference, for MANUAL entry
 *     in your bank. This is what you read while typing the transfers by hand
 *     (until Revolut automation is enabled).
 *   - format "xml": a pain.001.001.03 SEPA file (.xml) for banks that support
 *     bulk SEPA upload.
 * In both cases the payouts are moved into one batch (status 'processing').
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(b: unknown, s = 200, extra: Record<string, string> = {}) {
  return new Response(JSON.stringify(b), { status: s, headers: { ...cors, ...extra, "Content-Type": "application/json" } });
}

function xmlEscape(s: string): string {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function sanitize(s: string, maxLen = 70): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9 /\-?:().,'+]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLen);
}

function groupIban(iban: string): string {
  return String(iban ?? "").replace(/\s+/g, "").toUpperCase().replace(/(.{4})/g, "$1 ").trim();
}

function yyyymmdd(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function isoZ(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "Z");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const debtorName = Deno.env.get("SEPA_DEBTOR_NAME") ?? "Ticket Safe";
    const debtorIban = (Deno.env.get("SEPA_DEBTOR_IBAN") ?? "").replace(/\s+/g, "").toUpperCase();
    const debtorBic = (Deno.env.get("SEPA_DEBTOR_BIC") ?? "").replace(/\s+/g, "").toUpperCase();
    if (!supabaseUrl || !supabaseKey) return json({ error: "Server misconfigured", stage: "env" }, 500);

    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header", stage: "auth" }, 401);
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authErr || !user) return json({ error: authErr?.message ?? "Unauthorized", stage: "auth" }, 401);
    const { data: role } = await supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
    if (!role) return json({ error: "Admin only", stage: "role" }, 403);

    const body = await req.json().catch(() => ({})) as { include_studio?: boolean; include_resale?: boolean; format?: string };
    const includeStudio = body.include_studio !== false;
    const includeResale = body.include_resale !== false;
    const format = body.format === "xml" ? "xml" : "sheet";

    // The clean sheet works without bank secrets (you type the transfers
    // yourself). The XML upload needs the debtor account configured.
    if (format === "xml" && (!debtorIban || !debtorBic)) {
      return json({
        error: "SEPA debtor account not configured. Set SEPA_DEBTOR_IBAN and SEPA_DEBTOR_BIC in Supabase secrets (only needed for the XML upload — the transfer sheet works without them).",
        stage: "env", has_name: !!debtorName, has_iban: !!debtorIban, has_bic: !!debtorBic,
      }, 500);
    }

    const [studioRes, resaleRes] = await Promise.all([
      includeStudio
        ? supabase
            .from("organizer_payouts")
            .select("id, amount_cents, iban_used, iban_holder_used, organizer:organizer_profiles(name, contact_email)")
            .eq("status", "requested")
            .is("batch_id", null)
        : Promise.resolve({ data: [], error: null }),
      includeResale
        ? supabase
            .from("seller_payouts")
            .select("id, amount_cents, iban_used, iban_holder_used, seller:profiles(full_name, email)")
            .eq("status", "requested")
            .is("batch_id", null)
        : Promise.resolve({ data: [], error: null }),
    ]);
    if (studioRes.error) return json({ error: studioRes.error.message, stage: "select_studio" }, 500);
    if (resaleRes.error) return json({ error: resaleRes.error.message, stage: "select_resale" }, 500);

    type RowOut = { id: string; ref: string; amount_cents: number; iban: string; holder: string; kind: "studio" | "resale" };
    const rows: RowOut[] = [];
    for (const p of (studioRes.data ?? []) as Array<{ id: string; amount_cents: number; iban_used: string; iban_holder_used: string; }>) {
      rows.push({ id: p.id, kind: "studio", ref: `TS-PO-${p.id.slice(0, 8).toUpperCase()}`, amount_cents: p.amount_cents, iban: p.iban_used, holder: p.iban_holder_used });
    }
    for (const p of (resaleRes.data ?? []) as Array<{ id: string; amount_cents: number; iban_used: string; iban_holder_used: string; }>) {
      rows.push({ id: p.id, kind: "resale", ref: `TS-RS-${p.id.slice(0, 8).toUpperCase()}`, amount_cents: p.amount_cents, iban: p.iban_used, holder: p.iban_holder_used });
    }
    if (rows.length === 0) return json({ error: "Nothing to export — no pending payouts.", stage: "empty" }, 404);

    const now = new Date();
    const batchId = `TS-${yyyymmdd(now)}-${Math.floor(now.getTime() / 1000).toString(36).toUpperCase().slice(-6)}`;
    const totalCents = rows.reduce((a, r) => a + r.amount_cents, 0);
    const totalEur = (totalCents / 100).toFixed(2);

    let { error: batchErr } = await supabase.from("payout_batches").insert({
      id: batchId, created_by: user.id, status: "processing",
      total_cents: totalCents, num_payouts: rows.length,
    });
    if (batchErr) {
      console.error("[export-payout-batch v3] batch insert with created_by failed:", batchErr);
      const retry = await supabase.from("payout_batches").insert({
        id: batchId, status: "processing", total_cents: totalCents, num_payouts: rows.length,
      });
      if (retry.error) {
        return json({ error: retry.error.message, stage: "insert_batch", code: retry.error.code, details: retry.error.details, hint: retry.error.hint, first_error: batchErr.message }, 500);
      }
      batchErr = null;
    }

    const studioIds = rows.filter((r) => r.kind === "studio").map((r) => r.id);
    const resaleIds = rows.filter((r) => r.kind === "resale").map((r) => r.id);
    if (studioIds.length > 0) {
      const upd = await supabase.from("organizer_payouts")
        .update({ status: "processing", batch_id: batchId, processed_at: new Date().toISOString() })
        .in("id", studioIds);
      if (upd.error) return json({ error: upd.error.message, stage: "update_studio", code: upd.error.code }, 500);
    }
    if (resaleIds.length > 0) {
      const upd = await supabase.from("seller_payouts")
        .update({ status: "processing", batch_id: batchId, processed_at: new Date().toISOString() })
        .in("id", resaleIds);
      if (upd.error) return json({ error: upd.error.message, stage: "update_resale", code: upd.error.code }, 500);
    }

    // ── Clean human-readable transfer sheet (default) ──────────────────────
    if (format === "sheet") {
      const dateLabel = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
      const lines: string[] = [];
      lines.push("TICKET SAFE — SEPA TRANSFER SHEET");
      lines.push("=================================");
      lines.push("");
      lines.push(`Batch        : ${batchId}`);
      lines.push(`Date         : ${dateLabel}`);
      lines.push(`Transfers    : ${rows.length}`);
      lines.push(`Total to wire: EUR ${totalEur}`);
      lines.push("");
      lines.push("Make each transfer below from your bank as a standard SEPA");
      lines.push("credit transfer. Put the Reference in the label/communication.");
      lines.push("");
      rows.forEach((r, i) => {
        const amount = (r.amount_cents / 100).toFixed(2);
        const who = r.kind === "studio" ? "Organizer" : "Seller";
        lines.push("------------------------------------------------------------");
        lines.push(`#${i + 1}   EUR ${amount}   (${who})`);
        lines.push(`  Beneficiary : ${r.holder}`);
        lines.push(`  IBAN        : ${groupIban(r.iban)}`);
        lines.push(`  Reference   : ${r.ref}`);
      });
      lines.push("------------------------------------------------------------");
      lines.push("");
      lines.push(`TOTAL : EUR ${totalEur}  across ${rows.length} transfer${rows.length > 1 ? "s" : ""}`);
      lines.push("");
      lines.push(`When done, mark batch ${batchId} as "sent" in the admin panel.`);
      lines.push("");
      const sheet = lines.join("\r\n");
      return new Response(sheet, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Content-Disposition": `attachment; filename="${batchId}.txt"`,
          "X-Batch-Id": batchId,
          "X-Num-Payouts": String(rows.length),
          "X-Total-Cents": String(totalCents),
          ...cors,
        },
      });
    }

    // ── pain.001.001.03 SEPA XML (bank bulk upload) ────────────────────────
    const requestedExecDate = yyyymmdd(new Date(now.getTime() + 24 * 60 * 60 * 1000));
    const createdAt = isoZ(now);
    const txInf = rows.map((r) => {
      const amount = (r.amount_cents / 100).toFixed(2);
      const name = sanitize(r.holder);
      const purpose = `Ticket Safe payout ${r.ref}`;
      return `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${xmlEscape(r.ref)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="EUR">${amount}</InstdAmt>
        </Amt>
        <Cdtr>
          <Nm>${xmlEscape(name)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${xmlEscape(r.iban)}</IBAN>
          </Id>
        </CdtrAcct>
        <RmtInf>
          <Ustrd>${xmlEscape(sanitize(purpose, 140))}</Ustrd>
        </RmtInf>
      </CdtTrfTxInf>`;
    }).join("\n");

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${xmlEscape(batchId)}</MsgId>
      <CreDtTm>${createdAt}</CreDtTm>
      <NbOfTxs>${rows.length}</NbOfTxs>
      <CtrlSum>${totalEur}</CtrlSum>
      <InitgPty>
        <Nm>${xmlEscape(sanitize(debtorName))}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xmlEscape(batchId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${rows.length}</NbOfTxs>
      <CtrlSum>${totalEur}</CtrlSum>
      <PmtTpInf>
        <SvcLvl>
          <Cd>SEPA</Cd>
        </SvcLvl>
      </PmtTpInf>
      <ReqdExctnDt>${requestedExecDate}</ReqdExctnDt>
      <Dbtr>
        <Nm>${xmlEscape(sanitize(debtorName))}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${xmlEscape(debtorIban)}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BIC>${xmlEscape(debtorBic)}</BIC>
        </FinInstnId>
      </DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>
${txInf}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;

    return new Response(xml, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Content-Disposition": `attachment; filename="${batchId}.xml"`,
        "X-Batch-Id": batchId,
        "X-Num-Payouts": String(rows.length),
        "X-Total-Cents": String(totalCents),
        ...cors,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[export-payout-batch v3] unhandled error:", msg);
    return json({ error: msg, stage: "catch" }, 500);
  }
});
