-- Fix two causes of the "chat is broken" issue tracked in RUNBOOK.md #6:
--
-- 1. `profiles` RLS only ever allowed `auth.uid() = id` — a buyer/seller
--    could never SELECT their conversation counterparty's own profile row.
--    useChat.ts / ChatRoom.tsx both embed
--    `buyer:profiles!conversations_buyer_id_fkey(full_name)` /
--    `seller:profiles!conversations_seller_id_fkey(full_name)` in their
--    queries — that embedded join silently returned NULL for the other
--    party, degrading the UI to a generic "Buyer"/"Seller" fallback.
--
-- 2. `conversations` was never added to the `supabase_realtime`
--    publication (only `messages` and `offers` were, in
--    20260310000000_chat_and_offers.sql). New conversations — and
--    `last_message_at` bumps — never pushed live to an open Messages list.

-- 1. Let a user read the profile of anyone they share a conversation with.
DROP POLICY IF EXISTS "Users can read conversation counterparty profile" ON public.profiles;
CREATE POLICY "Users can read conversation counterparty profile"
  ON public.profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE (c.buyer_id = auth.uid() AND c.seller_id = profiles.id)
         OR (c.seller_id = auth.uid() AND c.buyer_id = profiles.id)
    )
  );

-- 2. Add conversations to Realtime so new threads and last_message_at
-- bumps show up live without a manual refresh.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
