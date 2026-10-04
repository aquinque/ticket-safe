/**
 * sendResaleCompletionEmails(transactionId) — provider-agnostic resale
 * emails: seller "your ticket sold" + buyer "your ticket is confirmed"
 * (premium PDF path when the ticket was a Studio transfer, legacy
 * lightweight path otherwise).
 *
 * Extracted out of revolut-webhook/index.ts (lines ~174-341), which had
 * this hardcoded inline — only callable from inside that one webhook.
 * This version takes just a transaction_id and re-fetches everything it
 * needs from the DB, exactly like replay-order-email does for Studio
 * orders. A future Stripe resale webhook (Stripe Connect migration) only
 * needs to call this with the transaction id once the payment is
 * confirmed and the transfer's event_tickets row has been written.
 *
 * NOT YET WIRED into revolut-webhook — by explicit instruction, that file
 * is untouched for now (no changes to any live payment code while the
 * Stripe migration is pending). revolut-webhook keeps its own inline copy
 * of this logic until a later pass switches it to call this function
 * instead, at which point the duplication goes away.
 *
 * Assumes the ticket-transfer mutation (marking the old event_tickets row
 * "transferred" and inserting the new nominative one) has ALREADY run —
 * this function only reads that outcome back, it never performs it. That
 * mutation is payment-finalization logic, not email logic, and stays
 * wherever each provider's webhook does its own DB finalization.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendTicketConfirmationEmail } from "./sendTicketConfirmationEmail.ts";
import { generateTicketsPDFServer, type ServerTicketData } from "./ticketPdfServer.ts";
import type { OrderSummaryData } from "./orderSummaryPdf.ts";
import { renderEmail, ctaButton, ticketSummary, escapeHtml as esc } from "./emailComponents.ts";
import { emailTokens } from "./emailTokens.ts";

function formatLongDate(iso: string | null | undefined): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); }
  catch { return ""; }
}
function formatTime(iso: string | null | undefined): string {
  if (!iso) return "";
  try { return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

async function sendEmail(key: string, to: string, subject: string, html: string, text: string) {
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: "Ticket Safe <noreply@ticket-safe.eu>", to: [to], subject, html, text }),
    });
  } catch (e) { console.warn("[sendResaleCompletionEmails] email failed:", e); }
}

export interface SendResaleCompletionEmailsInput {
  supabase: SupabaseClient;
  resendApiKey: string;
  transactionId: string;
  /** Optional: a human label for the Resend tag (e.g. "revolut", "stripe"). */
  provider?: string;
}

export interface SendResaleCompletionEmailsResult {
  ok: boolean;
  sellerSent: boolean;
  buyerSent: boolean;
  buyerPremium: boolean;
  error?: string;
}

export async function sendResaleCompletionEmails(
  input: SendResaleCompletionEmailsInput,
): Promise<SendResaleCompletionEmailsResult> {
  const { supabase, resendApiKey, transactionId, provider = "unknown" } = input;

  const { data: tx } = await supabase
    .from("transactions")
    .select("id, buyer_id, seller_id, ticket_id, status, amount, fee_amount")
    .eq("id", transactionId)
    .maybeSingle();
  if (!tx) return { ok: false, sellerSent: false, buyerSent: false, buyerPremium: false, error: "transaction_not_found" };
  if (tx.status !== "completed") return { ok: false, sellerSent: false, buyerSent: false, buyerPremium: false, error: "transaction_not_completed" };

  let sellerSent = false;
  let buyerSent = false;
  let buyerPremium = false;

  try {
    const { data: listing } = await supabase
      .from("tickets")
      .select("file_url, selling_price, studio_ticket_id, event:events(title, date, location)")
      .eq("id", tx.ticket_id)
      .maybeSingle();
    const ev = (listing as { event?: { title?: string; date?: string; location?: string } } | null)?.event ?? null;
    const eventTitle = ev?.title ?? "your event";
    const eventWhen = ev?.date ? new Date(ev.date).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }) : "";
    const fileUrl = (listing as { file_url?: string | null } | null)?.file_url ?? null;
    const studioTicketId = (listing as { studio_ticket_id?: string | null } | null)?.studio_ticket_id ?? null;
    const netSeller = Number(tx.amount ?? 0) - Number(tx.fee_amount ?? 0);

    const [{ data: buyerAuth }, { data: sellerAuth }, { data: sellerProfile }, { data: buyerProfile }] = await Promise.all([
      supabase.auth.admin.getUserById(tx.buyer_id),
      supabase.auth.admin.getUserById(tx.seller_id),
      supabase.from("profiles").select("full_name").eq("id", tx.seller_id).maybeSingle(),
      supabase.from("profiles").select("full_name").eq("id", tx.buyer_id).maybeSingle(),
    ]);
    const buyerEmail = buyerAuth?.user?.email ?? null;
    const sellerEmail = sellerAuth?.user?.email ?? null;
    const buyerName = ((buyerProfile as { full_name?: string } | null)?.full_name ?? buyerEmail?.split("@")[0] ?? "there").split(" ")[0];
    const sellerName = ((sellerProfile as { full_name?: string } | null)?.full_name ?? sellerEmail?.split("@")[0] ?? "there").split(" ")[0];

    // ===== Seller "your ticket sold" =====
    if (resendApiKey && sellerEmail) {
      const bodyHtml = `
        <p style="margin:0 0 4px">Hi ${esc(sellerName)},</p>
        <p style="margin:0 0 4px">Good news — your ticket for <strong>${esc(eventTitle)}</strong>${eventWhen ? ` (${esc(eventWhen)})` : ""} has just been bought on Ticket Safe.</p>
        ${ticketSummary([["Added to your balance", `€${netSeller.toFixed(2)}`, emailTokens.accent]])}
        <p style="margin:0 0 24px;font-size:13px;color:${emailTokens.textMuted}">This amount is available in your balance, ready to withdraw to your IBAN (a 5% Ticket Safe fee applies at withdrawal).</p>
        ${ctaButton("Open my balance", `${emailTokens.siteUrl}/settings/listings`)}
      `;
      const text = `Your ticket for ${eventTitle} has just been bought on Ticket Safe.\n\nAdded to your balance: €${netSeller.toFixed(2)}\n\nAvailable to withdraw to your IBAN (5% fee at withdrawal).\n${emailTokens.siteUrl}/settings/listings`;
      const { html } = renderEmail({
        eyebrow: "Resale",
        title: "Your ticket sold",
        bodyHtml,
        preheader: `€${netSeller.toFixed(2)} added to your Ticket Safe balance.`,
        text,
      });
      await sendEmail(resendApiKey, sellerEmail, `Your ticket for ${eventTitle} sold — €${netSeller.toFixed(2)} added`, html, text);
      sellerSent = true;
    }

    if (!resendApiKey || !buyerEmail) {
      return { ok: true, sellerSent, buyerSent: false, buyerPremium: false };
    }

    // ===== Buyer: read back whether a Studio transfer already happened =====
    // (The transfer mutation itself — marking the old ticket "transferred"
    // and inserting the new nominative row — is payment-finalization logic
    // that runs in the webhook, before this function is called. We only
    // read the result back here.)
    let resaleXfer: {
      newTicketId: string;
      newQrToken: string;
      eventId: string;
      tierId: string;
      buyerFirstName: string;
      buyerLastName: string;
      buyerEmailHolder: string | null;
    } | null = null;

    if (studioTicketId) {
      const { data: oldTicket } = await supabase
        .from("event_tickets")
        .select("id, order_id, event_id, tier_id, status")
        .eq("id", studioTicketId)
        .maybeSingle();
      if (oldTicket && oldTicket.status === "transferred") {
        const { data: newTicket } = await supabase
          .from("event_tickets")
          .select("id, qr_token, event_id, tier_id, holder_first_name, holder_last_name, holder_email")
          .eq("order_id", oldTicket.order_id)
          .eq("buyer_id", tx.buyer_id)
          .eq("status", "valid")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (newTicket) {
          resaleXfer = {
            newTicketId: newTicket.id,
            newQrToken: newTicket.qr_token,
            eventId: newTicket.event_id,
            tierId: newTicket.tier_id,
            buyerFirstName: newTicket.holder_first_name ?? buyerName,
            buyerLastName: newTicket.holder_last_name ?? "",
            buyerEmailHolder: newTicket.holder_email ?? null,
          };
        }
      }
    }

    let premiumOk = false;
    if (resaleXfer) {
      const xfer = resaleXfer;
      try {
        const { data: eventFull } = await supabase
          .from("events")
          .select("id, title, date, location, organizer_id, banner_url")
          .eq("id", xfer.eventId)
          .maybeSingle();
        const [{ data: tier }, { data: organizer }] = await Promise.all([
          supabase.from("event_tiers").select("name, price_cents").eq("id", xfer.tierId).maybeSingle(),
          eventFull?.organizer_id
            ? supabase.from("organizer_profiles").select("name").eq("id", eventFull.organizer_id).maybeSingle()
            : Promise.resolve({ data: null as { name?: string } | null }),
        ]);

        const buyerFirst = xfer.buyerFirstName || buyerName;
        const buyerLast = xfer.buyerLastName || "";
        const ticketTypeName = (tier as { name?: string } | null)?.name ?? "Resale";
        const pricePaidEuro = `${Number(tx.amount ?? 0).toFixed(2)}€`;

        const eventTitleRich = (eventFull as { title?: string } | null)?.title ?? eventTitle;
        const eventDateRich = (eventFull as { date?: string } | null)?.date ?? null;
        const eventLocationRich = (eventFull as { location?: string } | null)?.location ?? "";
        const eventImageUrlRich = (eventFull as { banner_url?: string | null } | null)?.banner_url ?? null;
        const organizerNameRich = (organizer as { name?: string } | null)?.name ?? "Ticket Safe";
        const resaleOrderNumber = `TS-RESALE-${tx.id.slice(0, 8).toUpperCase()}`;

        const ticketData: ServerTicketData = {
          eventName: eventTitleRich,
          eventDate: eventDateRich ?? new Date().toISOString(),
          eventTime: eventDateRich ? formatTime(eventDateRich) : undefined,
          eventLocation: eventLocationRich,
          eventImageUrl: eventImageUrlRich,
          organizerName: organizerNameRich,
          buyerFirstName: buyerFirst,
          buyerLastName: buyerLast,
          buyerEmail: xfer.buyerEmailHolder ?? buyerEmail,
          ticketType: ticketTypeName,
          pricePaid: pricePaidEuro,
          ticketId: xfer.newTicketId,
          orderNumber: resaleOrderNumber,
          qrToken: xfer.newQrToken,
          status: "Valid",
          ticketIndex: 1,
          ticketTotal: 1,
        };

        const ticketBytes = await generateTicketsPDFServer([ticketData]);

        const orderData: OrderSummaryData = {
          orderNumber: resaleOrderNumber,
          purchaseDate: new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" }),
          buyerFirstName: buyerFirst,
          buyerLastName: buyerLast,
          buyerEmail: buyerEmail,
          eventName: eventTitleRich,
          eventDate: eventDateRich ? formatLongDate(eventDateRich) : "",
          eventTime: eventDateRich ? formatTime(eventDateRich) : "",
          eventLocation: eventLocationRich,
          ticketType: ticketTypeName,
          quantity: 1,
          unitPrice: pricePaidEuro,
          totalPaid: pricePaidEuro,
          ticketPriceCents: Math.round((Number(tx.amount ?? 0) - Number(tx.fee_amount ?? 0)) * 100),
          serviceFeeCents: Math.round(Number(tx.fee_amount ?? 0) * 100),
          paymentMethod: provider === "revolut" ? "Card (Revolut)" : provider === "stripe" ? "Card (Stripe)" : "Card",
          paymentStatus: "Paid",
          transactionId: `${provider}:${tx.id}`,
          organizerName: organizerNameRich,
          ticketId: xfer.newTicketId,
        };

        const sendRes = await sendTicketConfirmationEmail({
          resendApiKey,
          to: buyerEmail,
          order: orderData,
          ticketPdfBytes: ticketBytes,
          tags: [
            { name: "type", value: "resale_buyer_confirmation" },
            { name: "provider", value: provider },
          ],
        });
        if (!sendRes.ok) {
          console.error("[sendResaleCompletionEmails] resale premium email failed:", sendRes.error);
        } else {
          console.log("[sendResaleCompletionEmails] resale premium email sent", { transaction_id: tx.id, resend_id: sendRes.resendId });
          premiumOk = true;
        }
      } catch (err) {
        console.error("[sendResaleCompletionEmails] resale premium email pipeline error:", err);
      }
    }

    if (!premiumOk) {
      const ticketUrl = `${emailTokens.siteUrl}/my-tickets`;
      const ticketBlock = resaleXfer
        ? `<p style="margin:0 0 4px">Your ticket is now in your name. Open <strong>My Tickets</strong> to show the QR at the door.</p>${ctaButton("View my tickets", ticketUrl)}`
        : fileUrl
          ? `<p style="margin:0 0 4px">Here is your ticket file from the seller:</p>${ctaButton("Download my ticket", fileUrl)}<p style="margin:16px 0 0;font-size:13px;color:${emailTokens.textMuted}">It's also in <strong>My Tickets</strong> on Ticket Safe.</p>`
          : `<p style="margin:0 0 4px">Your ticket is in <strong>My Tickets</strong> on Ticket Safe.</p>${ctaButton("View my tickets", ticketUrl)}`;
      const bodyHtml = `<p style="margin:0 0 4px">Hi ${esc(buyerName)},</p><p style="margin:0 0 4px">Your purchase of a ticket for <strong>${esc(eventTitle)}</strong>${eventWhen ? ` (${esc(eventWhen)})` : ""} is confirmed.</p>${ticketBlock}`;
      const text = `Your purchase of a ticket for ${eventTitle} is confirmed.\n${ticketUrl}`;
      const { html } = renderEmail({
        eyebrow: "Resale",
        title: "Your ticket is confirmed",
        bodyHtml,
        preheader: `Your ticket for ${eventTitle} is confirmed.`,
        text,
      });
      await sendEmail(resendApiKey, buyerEmail, `Your ticket for ${eventTitle} is confirmed`, html, text);
    }
    buyerSent = true;
    buyerPremium = premiumOk;
  } catch (err) {
    console.error("[sendResaleCompletionEmails] failed:", err);
    return { ok: false, sellerSent, buyerSent, buyerPremium, error: String(err) };
  }

  return { ok: true, sellerSent, buyerSent, buyerPremium };
}
