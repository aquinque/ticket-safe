// =====================================================
// SECURE TICKET GENERATION
// Generates cryptographically signed ticket tokens
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import * as jose from 'https://deno.land/x/jose@v5.1.3/index.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface GenerateTicketRequest {
  event_id: string;
  user_id: string;
  ticket_type?: string;
  seat_section?: string;
  seat_row?: string;
  seat_number?: string;
  original_price: number;
  metadata?: Record<string, unknown>;
}

interface TicketPayload {
  sub: string; // user_id
  ticket_id: string;
  event_id: string;
  ticket_number: string;
  version: number;
  nonce: string;
  iat: number;
  exp: number;
  iss: string;
  aud: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    // Parse request
    const body: GenerateTicketRequest = await req.json();

    // Validate event exists and is active
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('*')
      .eq('id', body.event_id)
      .eq('is_active', true)
      .single();

    if (eventError || !event) {
      throw new Error('Event not found or inactive');
    }

    // Check user permissions (organizer or admin)
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .in('role', ['ADMIN', 'ORGANIZER'])
      .single();

    if (!userRole && event.organizer_id !== user.id) {
      throw new Error('Insufficient permissions to generate tickets');
    }

    // Get or create active signing key for this event
    let { data: signingKey } = await supabase
      .from('signing_keys')
      .select('*')
      .eq('event_id', body.event_id)
      .eq('is_active', true)
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!signingKey) {
      // Create new signing key
      const kid = `key-${event.id}-${Date.now()}`;
      const secret = Deno.env.get('TICKET_SIGNING_SECRET') || crypto.randomUUID();

      const { data: newKey, error: keyError } = await supabase
        .from('signing_keys')
        .insert({
          kid,
          algorithm: 'HS256',
          private_key_hash: await hashSecret(secret),
          event_id: body.event_id,
          is_active: true,
          expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(), // 1 year
          created_by: user.id,
        })
        .select()
        .single();

      if (keyError) throw keyError;
      signingKey = newKey;
    }

    // Generate ticket number
    const ticketNumber = `TIX-${event.id.substring(0, 8).toUpperCase()}-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;

    // Create ticket record (without token first)
    const ticketId = crypto.randomUUID();
    const nonce = crypto.randomUUID();
    const version = 1;

    const expiresAt = new Date(event.date);
    expiresAt.setDate(expiresAt.getDate() + 1); // Valid until 1 day after event

    // Create JWT payload
    const now = Math.floor(Date.now() / 1000);
    const payload: TicketPayload = {
      sub: body.user_id,
      ticket_id: ticketId,
      event_id: body.event_id,
      ticket_number: ticketNumber,
      version,
      nonce,
      iat: now,
      exp: Math.floor(expiresAt.getTime() / 1000),
      iss: 'ticket-safe',
      aud: 'ticket-safe-scanner',
    };

    // Sign the token
    const secret = new TextEncoder().encode(Deno.env.get('TICKET_SIGNING_SECRET') || crypto.randomUUID());
    const token = await new jose.SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256', kid: signingKey.kid })
      .sign(secret);

    // Insert ticket into database
    const { data: ticket, error: ticketError } = await supabase
      .from('secure_tickets')
      .insert({
        id: ticketId,
        ticket_number: ticketNumber,
        event_id: body.event_id,
        current_owner_id: body.user_id,
        original_owner_id: body.user_id,
        seat_section: body.seat_section,
        seat_row: body.seat_row,
        seat_number: body.seat_number,
        ticket_type: body.ticket_type || 'GENERAL',
        original_price: body.original_price,
        status: 'ACTIVE',
        version,
        nonce,
        ticket_token: token,
        signing_key_id: signingKey.id,
        issued_at: new Date().toISOString(),
        expires_at: expiresAt.toISOString(),
        metadata: body.metadata || {},
      })
      .select()
      .single();

    if (ticketError) throw ticketError;

    console.log(`[TICKET_GENERATED] Ticket ${ticketNumber} created for event ${event.title}`);

    return new Response(
      JSON.stringify({
        success: true,
        ticket: {
          id: ticket.id,
          ticket_number: ticket.ticket_number,
          ticket_token: token,
          qr_data: token, // The QR code should encode this token
          event_id: ticket.event_id,
          owner_id: ticket.current_owner_id,
          status: ticket.status,
          expires_at: ticket.expires_at,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[ERROR]', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

// Helper: Hash secret for storage (never store plaintext)
async function hashSecret(secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(secret);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
