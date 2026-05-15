/**
 * ai-event-draft — Supabase Edge Function (Deno)
 *
 * POST /functions/v1/ai-event-draft
 * Body: { source: string }        // plain text OR a URL the user pasted
 *
 * Admin-only. Extracts a structured event draft from free-form text or
 * the body of a fetched URL. Returns the draft WITHOUT inserting — the
 * admin reviews it client-side, then commits via the normal events
 * insert path (RLS-protected).
 *
 * Response:
 *   { draft: { title, description, date, location, university, campus,
 *              category, base_price, image_url? }, raw }
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

const CATEGORIES = [
  "Party",
  "Gala",
  "Conference",
  "Sport",
  "Concert",
  "Workshop",
  "Networking",
  "Other",
];

const EXTRACTION_PROMPT = `You extract structured event data from text describing a single event.

Return ONLY valid JSON, no prose, matching this schema:
{
  "title": string (required, max 120 chars),
  "description": string (required, 1-3 sentences),
  "date": string (required, ISO 8601 datetime; if only a date is known,
                  default time to 19:00 local),
  "location": string (required, venue + city),
  "university": string (required, e.g. "ESCP", "HEC", "Sciences Po"; if
                       no university is mentioned, return "Other"),
  "campus": string | null (e.g. "Paris", "London"; null if unknown),
  "category": one of ${JSON.stringify(CATEGORIES)},
  "base_price": number | null (ticket face value in EUR; null if unknown),
  "image_url": string | null (only if a clearly absolute image URL appears
                              in the source — never invent one)
}

Hard rules:
- Never invent facts. If a field is unknown and not required, use null.
- If multiple events are described, extract only the first one.
- If the text is clearly NOT about an event, return:
  { "error": "not_an_event" }`;

async function fetchUrlText(url: string): Promise<string> {
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    const res = await fetch(u.toString(), {
      headers: { "User-Agent": "TicketSafe-EventBot/1.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return "";
    const text = await res.text();
    // Strip script/style + tags; keep a reasonable cap so we don't blow
    // the model context.
    const cleaned = text
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return cleaned.slice(0, 12_000);
  } catch {
    return "";
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

  // Auth + admin gate
  const token = authHeader.replace("Bearer ", "");
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);
  if (authError || !user) return json({ error: "Invalid session" }, 401);

  const { data: roleRow } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();
  if (roleRow?.role !== "admin") return json({ error: "Admin access required" }, 403);

  let body: { source?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const source = (body.source ?? "").trim();
  if (!source) return json({ error: "source is required" }, 400);
  if (source.length > 20_000) return json({ error: "source too long" }, 400);

  // If the source looks like a URL, fetch its content; otherwise use as-is.
  let materialized = source;
  if (/^https?:\/\//i.test(source) && !source.includes(" ")) {
    const fetched = await fetchUrlText(source);
    if (!fetched) return json({ error: "Could not fetch URL content" }, 422);
    materialized = `URL: ${source}\n\nPAGE TEXT:\n${fetched}`;
  }

  const aiRes = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: 1200,
      system: EXTRACTION_PROMPT,
      messages: [{ role: "user", content: materialized }],
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    console.error("[ai-event-draft] Anthropic error:", aiRes.status, errText);
    return json({ error: "AI service unavailable" }, 502);
  }

  const payload = await aiRes.json();
  const raw =
    payload?.content?.find((b: { type: string }) => b.type === "text")?.text ?? "";

  // Extract the JSON object from the response (allow stray whitespace).
  const firstBrace = raw.indexOf("{");
  const lastBrace = raw.lastIndexOf("}");
  if (firstBrace < 0 || lastBrace <= firstBrace) {
    return json({ error: "AI response could not be parsed", raw }, 502);
  }

  let draft: Record<string, unknown>;
  try {
    draft = JSON.parse(raw.slice(firstBrace, lastBrace + 1));
  } catch {
    return json({ error: "AI returned invalid JSON", raw }, 502);
  }

  if (draft.error === "not_an_event") {
    return json({ error: "The provided source does not describe an event" }, 422);
  }

  return json({ draft, raw });
});
