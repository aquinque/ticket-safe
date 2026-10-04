-- ============================================================
-- Chat & Counter-Offer System (Vinted-style negotiation)
-- ============================================================

-- Offer status enum
CREATE TYPE public.offer_status AS ENUM ('pending', 'accepted', 'rejected', 'expired');

-- Conversations between buyer and seller about a specific ticket
CREATE TABLE public.conversations (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id   UUID NOT NULL REFERENCES public.tickets(id) ON DELETE CASCADE,
  buyer_id    UUID NOT NULL REFERENCES public.profiles(id),
  seller_id   UUID NOT NULL REFERENCES public.profiles(id),
  last_message_at TIMESTAMPTZ DEFAULT now(),
  created_at  TIMESTAMPTZ DEFAULT now(),
  updated_at  TIMESTAMPTZ DEFAULT now(),
  -- One conversation per buyer-ticket pair
  UNIQUE (ticket_id, buyer_id)
);

-- Messages within a conversation
CREATE TABLE public.messages (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id       UUID NOT NULL REFERENCES public.profiles(id),
  content         TEXT NOT NULL CHECK (char_length(content) <= 2000),
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Counter-offers (price negotiations)
CREATE TABLE public.offers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  proposer_id     UUID NOT NULL REFERENCES public.profiles(id),
  price           NUMERIC NOT NULL CHECK (price > 0 AND price <= 10000),
  status          public.offer_status DEFAULT 'pending',
  created_at      TIMESTAMPTZ DEFAULT now(),
  responded_at    TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_conversations_buyer   ON public.conversations(buyer_id);
CREATE INDEX idx_conversations_seller  ON public.conversations(seller_id);
CREATE INDEX idx_conversations_ticket  ON public.conversations(ticket_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_offers_conversation   ON public.offers(conversation_id);

-- Auto-update updated_at on conversations
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = now(), updated_at = now()
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_message_updates_conversation
  AFTER INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();

-- ============================================================
-- RLS Policies
-- ============================================================

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers         ENABLE ROW LEVEL SECURITY;

-- Conversations: participants can see their own
CREATE POLICY "Users see own conversations"
  ON public.conversations FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

-- Conversations: buyers can start a conversation
CREATE POLICY "Buyers can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

-- Messages: participants can read messages in their conversations
CREATE POLICY "Users read messages in own conversations"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

-- Messages: participants can send messages
CREATE POLICY "Users send messages in own conversations"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

-- Offers: participants can see offers in their conversations
CREATE POLICY "Users see offers in own conversations"
  ON public.offers FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

-- Offers: participants can create offers
CREATE POLICY "Users create offers in own conversations"
  ON public.offers FOR INSERT
  WITH CHECK (
    auth.uid() = proposer_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
    )
  );

-- Offers: the OTHER participant can accept/reject (not the proposer)
CREATE POLICY "Recipient can respond to offers"
  ON public.offers FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
        AND (c.buyer_id = auth.uid() OR c.seller_id = auth.uid())
        AND auth.uid() != proposer_id
    )
  );

-- Enable Realtime for messages table
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.offers;
