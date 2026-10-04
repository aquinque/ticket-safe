import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory rate limiting (resets on function restart)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 3600000; // 1 hour in milliseconds
const MAX_REQUESTS_PER_WINDOW = 5;

// Organizer types accepted by organizer_profiles_org_type_check.
const ORG_TYPES = ['bde', 'sports', 'alumni', 'conference', 'student-society', 'other'];
const GENDERS = ['female', 'male'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

    const body = await req.json();
    const email = body?.email;
    const emailConfirm = body?.emailConfirm;
    const firstName = body?.firstName;
    const lastName = body?.lastName;
    const gender = body?.gender;
    const accountType = body?.accountType === 'studio' ? 'studio' : 'ticketsafe';
    const studio = body?.studio ?? {};

    // Validation errors array
    const errors: string[] = [];

    // Email validation. Any email domain is accepted.
    if (!email || typeof email !== 'string') {
      errors.push('Email is required');
    } else if (email.length > 255) {
      errors.push('Email must be less than 255 characters');
    } else if (!EMAIL_RE.test(email.trim())) {
      errors.push('Invalid email format');
    }

    // Confirmation must match the email exactly (case and surrounding spaces aside).
    if (typeof email === 'string' && typeof emailConfirm === 'string') {
      if (email.trim().toLowerCase() !== emailConfirm.trim().toLowerCase()) {
        errors.push('The email addresses do not match');
      }
    } else {
      errors.push('Please confirm your email address');
    }

    // First and last name
    const first = typeof firstName === 'string' ? firstName.trim() : '';
    const last = typeof lastName === 'string' ? lastName.trim() : '';
    if (first.length < 1 || first.length > 60) errors.push('First name must be between 1 and 60 characters');
    if (last.length < 1 || last.length > 60) errors.push('Last name must be between 1 and 60 characters');

    // Gender is required for a TicketSafe account
    if (accountType === 'ticketsafe' && (typeof gender !== 'string' || !GENDERS.includes(gender))) {
      errors.push('Please select a gender');
    }

    // Studio organizer details
    if (accountType === 'studio') {
      const orgName = typeof studio.name === 'string' ? studio.name.trim() : '';
      if (orgName.length < 2 || orgName.length > 120) errors.push('Organization name must be between 2 and 120 characters');
      if (typeof studio.org_type !== 'string' || !ORG_TYPES.includes(studio.org_type)) errors.push('Please choose an organization type');
      if (studio.contact_email !== undefined && studio.contact_email !== null && studio.contact_email !== '') {
        if (typeof studio.contact_email !== 'string' || !EMAIL_RE.test(studio.contact_email.trim()) || studio.contact_email.length > 254) {
          errors.push('Contact email is invalid');
        }
      }
    }

    if (errors.length > 0) {
      return new Response(
        JSON.stringify({ valid: false, errors }),
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
