import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory rate limiting (resets on function restart)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in milliseconds
const MAX_REQUESTS_PER_WINDOW = 5;

function getRateLimitKey(req: Request): string {
  // Use combination of IP and user agent for rate limiting
  const forwarded = req.headers.get('x-forwarded-for');
  const ip = forwarded ? forwarded.split(',')[0] : 'unknown';
  const userAgent = req.headers.get('user-agent') || 'unknown';
  return `${ip}:${userAgent.substring(0, 50)}`; // Limit user-agent length
}

function checkRateLimit(key: string): { allowed: boolean; resetAt: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now > entry.resetAt) {
    // Create new entry or reset expired entry
    rateLimitMap.set(key, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
    return { allowed: true, resetAt: now + RATE_LIMIT_WINDOW };
  }

  if (entry.count >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, resetAt: entry.resetAt };
  }

  entry.count++;
  return { allowed: true, resetAt: entry.resetAt };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Apply rate limiting
    const rateLimitKey = getRateLimitKey(req);
    const rateLimit = checkRateLimit(rateLimitKey);

    if (!rateLimit.allowed) {
      const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
      console.warn(`Rate limit exceeded for key: ${rateLimitKey}`);
      
      return new Response(
        JSON.stringify({ 
          valid: false, 
          errors: ['Too many validation requests. Please try again later.'] 
        }),
        { 
          status: 429,
          headers: { 
            ...corsHeaders, 
            'Content-Type': 'application/json',
            'Retry-After': retryAfter.toString()
          } 
        }
      );
    }

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
      console.error('[INTERNAL] Domain validation error:', domainError);
      return new Response(
        JSON.stringify({ valid: false, errors: ['Unable to validate email. Please try again.'] }),
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
    console.error('[INTERNAL] Error in validate-signup:', error);
    // Generic error message to prevent information disclosure
    return new Response(
      JSON.stringify({ valid: false, errors: ['Unable to process validation. Please try again.'] }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
