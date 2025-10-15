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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    );

    const { email, fullName, university } = await req.json();

    // Validation errors array
    const errors: string[] = [];

    // Email validation
    if (!email || typeof email !== 'string') {
      errors.push('Email is required');
    } else if (email.length > 255) {
      errors.push('Email must be less than 255 characters');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      errors.push('Invalid email format');
    }

    // Full name validation
    if (!fullName || typeof fullName !== 'string') {
      errors.push('Full name is required');
    } else if (fullName.trim().length === 0) {
      errors.push('Full name cannot be empty');
    } else if (fullName.length > 100) {
      errors.push('Full name must be less than 100 characters');
    }

    // University validation
    if (!university || typeof university !== 'string') {
      errors.push('University is required');
    } else if (university.trim().length === 0) {
      errors.push('University cannot be empty');
    } else if (university.length > 200) {
      errors.push('University name must be less than 200 characters');
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ valid: false, errors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify university email domain
    const { data: isValidDomain, error: domainError } = await supabase
      .rpc('validate_university_email', { email_address: email });

    if (domainError) {
      return new Response(
        JSON.stringify({ valid: false, errors: ['Error validating email domain'] }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValidDomain) {
      return new Response(
        JSON.stringify({ valid: false, errors: ['Please use a valid university email address'] }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ valid: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    return new Response(
      JSON.stringify({ valid: false, errors: [errorMessage] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});