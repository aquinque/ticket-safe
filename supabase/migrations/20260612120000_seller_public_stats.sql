-- Public, safe seller stats for buyer-facing trust badges.
-- profiles are private (RLS lets a user read only their own row), so buyers
-- cannot see a seller's name/university/sales directly. This SECURITY DEFINER
-- function exposes ONLY non-sensitive public fields for a single seller.
create or replace function public.seller_public_stats(p_seller_id uuid)
returns table (
  full_name       text,
  university      text,
  campus          text,
  member_since    timestamptz,
  completed_sales integer
)
language sql
security definer
set search_path = public
stable
as $$
  select
    p.full_name,
    p.university,
    p.campus,
    p.created_at,
    coalesce((
      select count(*)::int
      from public.transactions t
      where t.seller_id = p_seller_id
        and t.status = 'completed'
    ), 0)
  from public.profiles p
  where p.id = p_seller_id
    and p.deleted_at is null;
$$;

revoke all on function public.seller_public_stats(uuid) from public;
grant execute on function public.seller_public_stats(uuid) to anon, authenticated;
