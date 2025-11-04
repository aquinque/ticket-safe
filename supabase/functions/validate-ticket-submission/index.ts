import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ valid: false, errors: ['Authentication required'] }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ valid: false, errors: ['Invalid authentication'] }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { eventId, sellingPrice, quantity, notes } = await req.json();
    const errors: string[] = [];

    // Event ID validation
    if (!eventId || typeof eventId !== 'string') {
      errors.push('Event ID is required');
    }

    // Selling price validation
    if (!sellingPrice || typeof sellingPrice !== 'number') {
      errors.push('Selling price is required');
    } else if (sellingPrice <= 0) {
      errors.push('Selling price must be greater than 0');
    } else if (sellingPrice > 10000) {
      errors.push('Selling price cannot exceed €10,000');
    }

    // Quantity validation
    if (!quantity || typeof quantity !== 'number') {
      errors.push('Quantity is required');
    } else if (quantity < 1 || quantity > 10) {
      errors.push('Quantity must be between 1 and 10 tickets');
    } else if (!Number.isInteger(quantity)) {
      errors.push('Quantity must be a whole number');
    }

    // Enhanced notes validation with better sanitization
    if (notes && typeof notes === 'string') {
      const trimmedNotes = notes.trim();
      
      if (trimmedNotes.length > 1000) {
        errors.push('Notes must be less than 1000 characters');
      }
      
      // Check for HTML tags and script content
      const htmlTagPattern = /<[^>]*>/g;
      if (htmlTagPattern.test(trimmedNotes)) {
        errors.push('Notes cannot contain HTML tags');
      }
      
      // More strict character validation - only printable ASCII + basic punctuation
      const strictPattern = /^[\x20-\x7E\r\n]*$/;
      if (!strictPattern.test(trimmedNotes)) {
        errors.push('Notes contain invalid characters');
      }
      
      // Check for basic XSS patterns
      const xssPatterns = [
        /javascript:/i,
        /on\w+\s*=/i,
        /<script/i,
        /<iframe/i,
        /eval\(/i
      ];
      
      for (const pattern of xssPatterns) {
        if (pattern.test(trimmedNotes)) {
          errors.push('Notes contain prohibited content');
          break;
        }
      }
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ valid: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate event exists and is active
    const { data: event, error: eventError } = await supabase
      .from('events')
      .select('id, is_active, date, campus, base_price')
      .eq('id', eventId)
      .single();

    if (eventError || !event) {
      return new Response(
        JSON.stringify({ valid: false, errors: ['Event not found'] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!event.is_active) {
      return new Response(
        JSON.stringify({ valid: false, errors: ['This event is no longer active'] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if event is in the future
    const eventDate = new Date(event.date);
    if (eventDate < new Date()) {
      return new Response(
        JSON.stringify({ valid: false, errors: ['Cannot sell tickets for past events'] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate seller's campus matches event campus (if campus is set)
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('campus')
      .eq('id', user.id)
      .single();

    if (profileError || !profile) {
      return new Response(
        JSON.stringify({ valid: false, errors: ['User profile not found'] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (event.campus && profile.campus && event.campus !== profile.campus) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          errors: [`You can only sell tickets for events at your campus (${profile.campus})`] 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Optional: Validate price against base_price if set
    if (event.base_price !== null) {
      const maxPrice = event.base_price + 1;
      if (sellingPrice > maxPrice) {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            errors: [`Selling price cannot exceed €${maxPrice.toFixed(2)} (base price + €1)`] 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (sellingPrice < event.base_price) {
        return new Response(
          JSON.stringify({ 
            valid: false, 
            errors: [`Selling price cannot be less than the event base price (€${event.base_price.toFixed(2)})`] 
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    return new Response(
      JSON.stringify({ valid: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[INTERNAL] Error in validate-ticket-submission:', error);
    // Generic error message to prevent information disclosure
    return new Response(
      JSON.stringify({ valid: false, errors: ['Unable to process ticket validation. Please try again.'] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
