// Resolves a guest checkout's email to a Supabase auth user id. If no
// account exists for that email yet, creates a passwordless "shadow"
// account (auth.admin.createUser) so downstream tables that require a
// buyer_id/profiles row (event_orders, event_tickets, RLS policies, etc.)
// keep working completely unmodified. The guest never sees a signup flow;
// they can later use an emailed magic link to manage their tickets under
// that same account if they want to.
//
// Must be called with a service-role Supabase client — it bypasses RLS
// and calls the Admin API.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabaseClient = any;

export async function getOrCreateGuestAccount(
  supabase: AnySupabaseClient,
  email: string,
  fullName: string,
  phone?: string,
): Promise<string | null> {
  const normalizedEmail = email.trim().toLowerCase();

  const { data: existing } = await supabase
    .from("profiles")
    .select("id")
    .ilike("email", normalizedEmail)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase.auth.admin.createUser({
    email: normalizedEmail,
    email_confirm: true,
    user_metadata: {
      full_name: fullName || undefined,
      guest_shadow: true,
      ...(phone ? { phone } : {}),
    },
  });
  if (error || !created?.user) {
    // Most likely a race: another concurrent request just created this
    // same email. Look the profile up again rather than failing outright.
    const { data: retry } = await supabase
      .from("profiles")
      .select("id")
      .ilike("email", normalizedEmail)
      .maybeSingle();
    return (retry?.id as string) ?? null;
  }
  return created.user.id;
}
