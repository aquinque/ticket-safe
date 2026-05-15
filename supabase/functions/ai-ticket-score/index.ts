/**
 * ai-ticket-score — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/ai-ticket-score
 * Body: { ticketId: string }
 *
 * Admin-only. Runs a multi-signal authenticity check on a pending
 * ticket and stores the result on tickets.ai_score / ai_assessment.
 *
 * Signals:
 *   1. duplicate_qr   — same qr_hash already verified on another ticket
 *   2. nominative     — nominative_holder_name matches the seller profile
 *   3. visual         — Claude vision: does the ticket image look like a
 *                       legitimate ticket for the linked event?
 *
 * The final score is a weighted blend. We DO NOT auto-approve here —
 * admins still confirm via admin-review-ticket. We just populate the
 * advisory fields shown in the review queue.
 *
 * Requires Supabase secret: ANTHROPIC_API_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

type SignedClient = ReturnType<typeof createClient>;

interface Signal {
  name: string;
  score: number;        // 0-100
  weight: number;
  detail: string;
}

async function signalDuplicateQr(
  supabase: SignedClient,
  ticket: { id: string; qr_hash: string | null }
): Promise<Signal> {
  if (!ticket.qr_hash) {
    return {
      name: "duplicate_qr",
      score: 60,
      weight: 0.25,
      detail: "No QR hash on file — neutral signal.",
    };
  }
  const { data } = await supabase
    .from("tickets")
    .select("id, verification_status")
    .eq("qr_hash", ticket.qr_hash)
    .neq("id", ticket.id);

  if (!data || data.length === 0) {
    return {
      name: "duplicate_qr",
      score: 100,
      weight: 0.25,
      detail: "QR hash is unique across the platform.",
    };
  }
  const conflictsVerified = data.some((r) => r.verification_status === "verified");
  return {
    name: "duplicate_qr",
    score: conflictsVerified ? 0 : 30,
    weight: 0.25,
    detail: conflictsVerified
      ? `Conflict: ${data.length} other ticket(s) share this QR, including a verified one.`
      : `${data.length} other ticket(s) share this QR hash but none are verified.`,
  };
}

async function signalNominative(
  supabase: SignedClient,
  ticket: { seller_id: string; nominative_holder_name?: string | null }
): Promise<Signal> {
  const holder = (ticket.nominative_holder_name ?? "").trim();
  if (!holder) {
    return {
      name: "nominative",
      score: 70,
      weight: 0.25,
      detail: "Ticket is not nominative — signal skipped.",
    };
  }
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", ticket.seller_id)
    .maybeSingle();

  const seller = (profile?.full_name ?? "").trim().toLowerCase();
  const target = holder.toLowerCase();

  if (!seller) {
    return {
      name: "nominative",
      score: 50,
      weight: 0.25,
      detail: "Seller profile has no full name — cannot verify match.",
    };
  }

  const sellerTokens = new Set(seller.split(/\s+/).filter(Boolean));
  const targetTokens = target.split(/\s+/).filter(Boolean);
  const overlap = targetTokens.filter((t) => sellerTokens.has(t)).length;
  const ratio = targetTokens.length === 0 ? 0 : overlap / targetTokens.length;

  if (ratio >= 0.5) {
    return {
      name: "nominative",
      score: 100,
      weight: 0.25,
      detail: `Holder name "${holder}" matches seller "${profile?.full_name}".`,
    };
  }
  return {
    name: "nominative",
    score: 15,
    weight: 0.25,
    detail: `Holder name "${holder}" does NOT match seller "${profile?.full_name}".`,
  };
}

async function signalVisual(
  apiKey: string,
  ticket: {
    ticket_file_url: string | null;
    event?: { title?: string; date?: string; location?: string } | null;
  }
): Promise<Signal> {
  if (!ticket.ticket_file_url) {
    return {
      name: "visual",
      score: 50,
      weight: 0.5,
      detail: "No ticket file uploaded — cannot perform visual check.",
    };
  }
  // Only attempt vision on image-like URLs; PDFs would need extraction.
  const isImage = /\.(png|jpe?g|webp|gif)(\?|$)/i.test(ticket.ticket_file_url);
  if (!isImage) {
    return {
      name: "visual",
      score: 55,
      weight: 0.5,
      detail: "Ticket file is not an image (likely PDF). Manual review needed.",
    };
  }

  const eventLine = ticket.event
    ? `Expected event: "${ticket.event.title ?? "?"}", date ${ticket.event.date ?? "?"}, location ${ticket.event.location ?? "?"}.`
    : "Event metadata unavailable.";

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 400,
      system: `You inspect images of event tickets to flag obvious fakes.
Return ONLY JSON: { "score": 0-100, "reason": short string (<=200 chars) }.
- 90-100: image clearly shows a coherent ticket matching the expected event.
- 60-89: looks like a real ticket but some details don't fully match.
- 30-59: low quality, blurry, partial, or mismatched.
- 0-29: looks fabricated, edited, or unrelated to the event.
Never invent details. If the image is unreadable, score around 50.`,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "image",
              source: { type: "url", url: ticket.ticket_file_url },
            },
            { type: "text", text: eventLine },
          ],
        },
      ],
    }),
  });

  if (!aiRes.ok) {
    return {
      name: "visual",
      score: 50,
      weight: 0.5,
      detail: `Visual analysis unavailable (HTTP ${aiRes.status}).`,
    };
  }
  const payload = await aiRes.json();
  const raw =
    payload?.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return {
      name: "visual",
      score: 50,
      weight: 0.5,
      detail: "Visual analysis returned no parseable result.",
    };
  }
  try {
    const parsed = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
    const s = Math.max(0, Math.min(100, Math.round(Number(parsed.score) || 0)));
    return {
      name: "visual",
      score: s,
      weight: 0.5,
      detail: String(parsed.reason ?? "").slice(0, 200),
    };
  } catch {
    return {
      name: "visual",
      score: 50,
      weight: 0.5,
      detail: "Visual analysis returned invalid JSON.",
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Authentication required" }, 401);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "AI not configured" }, 503);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  // Admin gate
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: "Invalid session" }, 401);
  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow?.role !== "admin") return json({ error: "Admin access required" }, 403);

  let body: { ticketId?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const ticketId = body.ticketId;
  if (!ticketId) return json({ error: "ticketId required" }, 400);

  const { data: ticket, error: tErr } = await supabase
    .from("tickets")
    .select(
      "id, seller_id, qr_hash, nominative_holder_name, ticket_file_url, event:events(title, date, location)"
    )
    .eq("id", ticketId)
    .maybeSingle();

  if (tErr || !ticket) return json({ error: "Ticket not found" }, 404);

  const signals = await Promise.all([
    signalDuplicateQr(supabase, ticket as { id: string; qr_hash: string | null }),
    signalNominative(supabase, ticket as { seller_id: string; nominative_holder_name?: string | null }),
    signalVisual(apiKey, ticket as {
      ticket_file_url: string | null;
      event?: { title?: string; date?: string; location?: string } | null;
    }),
  ]);

  const totalWeight = signals.reduce((s, x) => s + x.weight, 0);
  const score = Math.round(
    signals.reduce((s, x) => s + x.score * x.weight, 0) / totalWeight
  );

  const recommendation =
    score >= 80 ? "approve" : score < 60 ? "reject" : "review";

  const assessment = {
    score,
    recommendation,
    signals,
    model: "claude-sonnet-4-6",
    generated_at: new Date().toISOString(),
  };

  const { error: updErr } = await supabase
    .from("tickets")
    .update({
      ai_score: score,
      ai_assessment: assessment,
      ai_reviewed_at: new Date().toISOString(),
    })
    .eq("id", ticketId);

  if (updErr) {
    console.error("[ai-ticket-score] update failed:", updErr);
    return json({ error: "Could not store assessment" }, 500);
  }

  return json({ ticketId, score, recommendation, assessment });
});
