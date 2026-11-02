import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
);

Deno.serve(async () => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

  const emails = ["achille.quinquenel@edu.escp.eu", "adrien.menard@edu.escp.eu"];
  const results = [];

  // Fetch all users (paginated — up to 1000)
  const { data: allUsers } = await supabase.auth.admin.listUsers({ perPage: 1000 });
  const userMap = new Map((allUsers?.users ?? []).map((u: { id: string; email?: string }) => [u.email, u.id]));

  // Also try profiles table as fallback
  const { data: profiles } = await supabase.from("profiles").select("id, email").in("email", emails);
  for (const p of profiles ?? []) if (p.email && !userMap.has(p.email)) userMap.set(p.email, p.id);

  for (const email of emails) {
    const userId = userMap.get(email);
    if (!userId) {
      results.push({ email, status: "not found — user must sign up first" });
      continue;
    }
    // Delete existing role first, then insert
    await supabase.from("user_roles").delete().eq("user_id", userId);
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role: "admin" });
    results.push({ email, user_id: userId, status: error ? error.message : "admin set" });
  }

  // Also return all known emails for debugging
  const allEmails = (allUsers?.users ?? []).map((u: { email?: string }) => u.email);

  return new Response(JSON.stringify({ results, allEmails }, null, 2), { headers: corsHeaders });
});
