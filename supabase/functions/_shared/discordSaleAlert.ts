/**
 * Discord "Nouvelle vente" alert, one message per paid Studio order.
 *
 * Posts an embed to the channel webhook in DISCORD_SALES_WEBHOOK_URL (Supabase
 * secret; nothing happens when it is unset). Called from stripe-connect-webhook
 * once the order is paid and its tickets exist. Best-effort: a Discord outage
 * must never fail the Stripe webhook, so every error is logged and swallowed.
 */
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const eur = (cents: number) => `${(cents / 100).toFixed(2).replace(".", ",")} €`;

const parisStamp = (d: Date) =>
  new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d).replace(",", "");

export async function postDiscordSaleAlert(supabase: SupabaseClient, orderId: string, provider = "Stripe"): Promise<void> {
  const url = Deno.env.get("DISCORD_SALES_WEBHOOK_URL");
  if (!url) return;
  try {
    const { data: order } = await supabase
      .from("event_orders")
      .select("id, quantity, unit_price_cents, discount_cents, fee_cents, total_cents, buyer_email, attendees, paid_at, event_id, tier_id")
      .eq("id", orderId)
      .maybeSingle();
    if (!order) return;
    const o = order as {
      quantity: number; unit_price_cents: number; discount_cents: number | null; fee_cents: number | null; total_cents: number;
      buyer_email: string | null; attendees: unknown; paid_at: string | null; event_id: string; tier_id: string | null;
    };

    const [{ data: ev }, { data: tier }] = await Promise.all([
      supabase.from("events").select("title, organizer:organizer_profiles!events_organizer_id_fkey(name)").eq("id", o.event_id).maybeSingle(),
      o.tier_id ? supabase.from("event_tiers").select("name").eq("id", o.tier_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const title = (ev as { title?: string } | null)?.title ?? "Événement";
    const orgRaw = (ev as { organizer?: unknown } | null)?.organizer;
    const organizer = (Array.isArray(orgRaw) ? orgRaw[0] : orgRaw) as { name?: string } | null;
    const tierName = (tier as { name?: string } | null)?.name ?? "Billet";

    const attendees = Array.isArray(o.attendees) ? (o.attendees as { first_name?: string; last_name?: string; email?: string }[]) : [];
    const first = attendees[0];
    const buyerName = [first?.first_name, first?.last_name].filter(Boolean).join(" ").trim() || "Acheteur";
    const buyerEmail = o.buyer_email ?? first?.email ?? "";

    const lines = Array.from({ length: Math.max(1, o.quantity) }, () => `• ${tierName} — ${eur(o.unit_price_cents)}`).join("\n");
    const fee = o.fee_cents ?? 0;
    const discount = o.discount_cents ?? 0;
    const totalNote = [fee > 0 ? `dont ${eur(fee)} de frais` : null, discount > 0 ? `-${eur(discount)} promo` : null].filter(Boolean).join(", ");

    const embed = {
      title: `🎟️ Nouvelle vente — ${title}`,
      color: 0xe53935,
      fields: [
        { name: "🧑 Acheteur", value: `${buyerName}\n${buyerEmail}`.trim(), inline: true },
        { name: "💶 Total", value: totalNote ? `${eur(o.total_cents)}\n(${totalNote})` : eur(o.total_cents), inline: true },
        { name: "🎫 Billets", value: lines, inline: false },
      ],
      footer: { text: `${organizer?.name ?? "Ticket Safe"} · ${provider} · ${parisStamp(o.paid_at ? new Date(o.paid_at) : new Date())}` },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "Ticket Safe", embeds: [embed] }),
    });
    if (!res.ok) console.warn("[discordSaleAlert] Discord answered", res.status, await res.text().catch(() => ""));
  } catch (e) {
    console.warn("[discordSaleAlert] failed:", e instanceof Error ? e.message : e);
  }
}
