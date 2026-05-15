/**
 * ai-assistant — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/ai-assistant
 * Body: { messages: { role: "user" | "assistant"; content: string }[] }
 *
 * Public-facing helper chatbot. Answers user questions about TicketSafe:
 * how buying/selling works, refund policy, ticket verification, account
 * setup, etc. Anchored on a static system prompt + a live snapshot of
 * upcoming events so it can answer "what's happening this weekend".
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

const SYSTEM_PROMPT = `You are the TicketSafe assistant, a friendly helper on a peer-to-peer
ticket resale platform for university students in Europe.

Your role:
- Explain how the platform works: listing tickets, buying, secure payment
  (Stripe), QR verification, refunds.
- Help users navigate: where to go to sell, where to find events.
- Give short, direct answers (3-5 sentences max). Use the user's language
  (French or English — match the user).
- Never invent prices, dates, or policies. If you don't know, say so and
  point the user to /contact or /how-it-works.
- Do not promise refunds or make legally binding statements. Defer to
  the refund policy at /refund-policy.

Hard rules:
- Never reveal seller personal data, email, or phone.
- Never provide ticket file URLs or QR codes.
- If asked about admin/moderation, point to /contact.
- If the question is about a specific event you don't see in the context,
  ask the user to share the event link.`;

async function fetchEventContext(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from("events")
    .select("title, date, location, university, category")
    .eq("is_active", true)
    .gte("date", new Date().toISOString())
    .order("date", { ascending: true })
    .limit(20);

  if (!data?.length) return "No upcoming events in the catalog right now.";
  return data
    .map(
      (e) =>
        `- ${e.title} — ${new Date(e.date).toISOString().slice(0, 10)} — ${e.location ?? "?"} (${e.university ?? "?"})`
    )
    .join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) return json({ error: "AI assistant is not configured" }, 503);

  let body: { messages?: Array<{ role: string; content: string }> };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const messages = (body.messages ?? []).filter(
    (m) =>
      m &&
      (m.role === "user" || m.role === "assistant") &&
      typeof m.content === "string" &&
      m.content.trim().length > 0
  );

  if (messages.length === 0) return json({ error: "messages required" }, 400);
  if (messages.length > 30) return json({ error: "Conversation too long" }, 400);
  for (const m of messages) {
    if (m.content.length > 2000) return json({ error: "Message too long" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
  );

  const eventContext = await fetchEventContext(supabase);
  const fullSystem = `${SYSTEM_PROMPT}\n\nUPCOMING EVENTS (read-only context):\n${eventContext}`;

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 600,
      system: fullSystem,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error("[ai-assistant] Anthropic error:", aiRes.status, errText);
    return json({ error: "AI service unavailable" }, 502);
  }

  const payload = await aiRes.json();
  const reply =
    payload?.content?.find((b: { type: string }) => b.type === "text")?.text ??
    "Sorry, I couldn't generate a reply.";

  return json({ reply });
});
