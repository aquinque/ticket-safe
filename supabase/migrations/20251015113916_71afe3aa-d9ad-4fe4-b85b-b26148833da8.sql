-- Create enum for user roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- Create enum for transaction status (escrow logic)
CREATE TYPE public.transaction_status AS ENUM ('pending', 'escrowed', 'completed', 'cancelled', 'refunded');

-- Create enum for ticket status
CREATE TYPE public.ticket_status AS ENUM ('available', 'sold', 'reserved');

-- Create profiles table for user data
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  university TEXT NOT NULL,
  university_email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create user_roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, role)
);

-- Create events table
CREATE TABLE public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  date TIMESTAMPTZ NOT NULL,
  location TEXT NOT NULL,
  category TEXT NOT NULL,
  university TEXT NOT NULL,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create tickets table
CREATE TABLE public.tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  seller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  original_price DECIMAL(10,2) NOT NULL,
  selling_price DECIMAL(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  status ticket_status DEFAULT 'available' NOT NULL,
  ticket_file_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Create transactions table with escrow logic
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID REFERENCES public.tickets(id) ON DELETE CASCADE NOT NULL,
  buyer_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  seller_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  status transaction_status DEFAULT 'pending' NOT NULL,
  payment_intent_id TEXT,
  escrow_released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Create security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- RLS Policies for profiles
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- RLS Policies for user_roles
CREATE POLICY "Users can view their own roles"
  ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Only admins can manage roles"
  ON public.user_roles FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for events
CREATE POLICY "Anyone can view active events from their university"
  ON public.events FOR SELECT
  USING (
    is_active = true AND 
    university = (SELECT university FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Admins can manage all events"
  ON public.events FOR ALL
  USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for tickets
CREATE POLICY "Anyone can view available tickets from their university events"
  ON public.tickets FOR SELECT
  USING (
    status = 'available' AND
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.id = tickets.event_id
      AND e.university = (SELECT university FROM public.profiles WHERE id = auth.uid())
      AND e.is_active = true
    )
  );

CREATE POLICY "Sellers can view their own tickets"
  ON public.tickets FOR SELECT
  USING (auth.uid() = seller_id);

CREATE POLICY "Users can create tickets"
  ON public.tickets FOR INSERT
  WITH CHECK (auth.uid() = seller_id);

CREATE POLICY "Sellers can update their own tickets"
  ON public.tickets FOR UPDATE
  USING (auth.uid() = seller_id);

CREATE POLICY "Sellers can delete their own tickets"
  ON public.tickets FOR DELETE
  USING (auth.uid() = seller_id);

-- RLS Policies for transactions
CREATE POLICY "Users can view their own transactions"
  ON public.transactions FOR SELECT
  USING (auth.uid() = buyer_id OR auth.uid() = seller_id);

CREATE POLICY "Buyers can create transactions"
  ON public.transactions FOR INSERT
  WITH CHECK (auth.uid() = buyer_id);

CREATE POLICY "Admins can view all transactions"
  ON public.transactions FOR SELECT
  USING (public.has_role(auth.uid(), 'admin'));

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_tickets_updated_at BEFORE UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, university, university_email)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'university', ''),
    NEW.email
  );
  
  -- Assign default user role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  
  RETURN NEW;
END;
$$;

-- Trigger to create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to validate price regulation (fair pricing)
CREATE OR REPLACE FUNCTION public.validate_ticket_price()
RETURNS TRIGGER AS $$
BEGIN
  -- Ensure selling price is reasonable (between 50% and 150% of original)
  IF NEW.selling_price < (NEW.original_price * 0.5) OR 
     NEW.selling_price > (NEW.original_price * 1.5) THEN
    RAISE EXCEPTION 'Selling price must be between 50%% and 150%% of original price to ensure fairness';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to validate ticket prices
CREATE TRIGGER validate_ticket_price_trigger
  BEFORE INSERT OR UPDATE ON public.tickets
  FOR EACH ROW EXECUTE FUNCTION public.validate_ticket_price();