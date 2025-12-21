// =====================================================
// PRIVACY REQUEST HANDLER
// GDPR compliance: data export, deletion, anonymization
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PrivacyRequest {
  request_type: 'EXPORT' | 'DELETE' | 'ANONYMIZE';
  reason?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Verify authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization');
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    );

    if (authError || !user) {
      throw new Error('Unauthorized');
    }

    const body: PrivacyRequest = await req.json();
    const clientIP = req.headers.get('x-forwarded-for') || 'unknown';

    // Log the privacy request
    await supabase.from('data_access_log').insert({
      user_id: user.id,
      accessed_user_id: user.id,
      access_type: `PRIVACY_REQUEST_${body.request_type}`,
      resource_type: 'USER_PROFILE',
      ip_address: clientIP,
      metadata: {
        reason: body.reason,
        timestamp: new Date().toISOString(),
      },
    });

    let result;

    switch (body.request_type) {
      case 'EXPORT':
        result = await handleDataExport(supabase, user.id);
        break;

      case 'DELETE':
        result = await handleDataDeletion(supabase, user.id);
        break;

      case 'ANONYMIZE':
        result = await handleDataAnonymization(supabase, user.id);
        break;

      default:
        throw new Error('Invalid request type');
    }

    return new Response(
      JSON.stringify({
        success: true,
        request_type: body.request_type,
        ...result,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[PRIVACY_REQUEST_ERROR]', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});

// =====================================================
// EXPORT USER DATA
// =====================================================

async function handleDataExport(supabase: ReturnType<typeof createClient>, userId: string) {
  // Gather all user data
  const userData: Record<string, unknown> = {};

  // 1. User profile
  const { data: profile } = await supabase.auth.admin.getUserById(userId);
  userData.profile = {
    id: profile.user?.id,
    email: profile.user?.email,
    created_at: profile.user?.created_at,
    last_sign_in_at: profile.user?.last_sign_in_at,
  };

  // 2. Tickets
  const { data: tickets } = await supabase
    .from('secure_tickets')
    .select('*')
    .or(`current_owner_id.eq.${userId},original_owner_id.eq.${userId}`);
  userData.tickets = tickets || [];

  // 3. Purchases
  const { data: purchases } = await supabase
    .from('purchases')
    .select('*')
    .eq('buyer_id', userId);
  userData.purchases = purchases || [];

  // 4. Sales
  const { data: sales } = await supabase
    .from('purchases')
    .select('*')
    .eq('seller_id', userId);
  userData.sales = sales || [];

  // 5. Data access logs (last 90 days)
  const { data: accessLogs } = await supabase
    .from('data_access_log')
    .select('*')
    .eq('user_id', userId)
    .gte('accessed_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    .order('accessed_at', { ascending: false })
    .limit(1000);
  userData.access_logs = accessLogs || [];

  // 6. Active sessions
  const { data: sessions } = await supabase
    .from('user_sessions')
    .select('device_type, ip_address, created_at, last_activity_at')
    .eq('user_id', userId)
    .eq('is_active', true);
  userData.active_sessions = sessions || [];

  // 7. Consents
  const { data: consents } = await supabase
    .from('user_consents')
    .select('*')
    .eq('user_id', userId);
  userData.consents = consents || [];

  // Create export package
  const exportData = {
    export_date: new Date().toISOString(),
    user_id: userId,
    data: userData,
    data_categories: [
      'profile',
      'tickets',
      'purchases',
      'sales',
      'access_logs',
      'active_sessions',
      'consents',
    ],
  };

  // Store export request
  await supabase.from('data_requests').insert({
    user_id: userId,
    request_type: 'EXPORT',
    status: 'COMPLETED',
    completed_at: new Date().toISOString(),
    metadata: {
      record_count: Object.keys(userData).length,
      export_size: JSON.stringify(exportData).length,
    },
  });

  return {
    message: 'Data export completed successfully',
    export_data: exportData,
  };
}

// =====================================================
// DELETE USER DATA
// =====================================================

async function handleDataDeletion(supabase: ReturnType<typeof createClient>, userId: string) {
  // Create deletion request
  const { data: request } = await supabase
    .from('data_requests')
    .insert({
      user_id: userId,
      request_type: 'DELETE',
      status: 'PENDING',
      metadata: {
        requested_at: new Date().toISOString(),
      },
    })
    .select()
    .single();

  // IMPORTANT: Actual deletion should be manual or delayed (30 days grace period)
  // This is to prevent accidental deletions and allow recovery

  return {
    message: 'Data deletion request submitted. Your data will be deleted in 30 days.',
    request_id: request?.id,
    deletion_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    note: 'You can cancel this request within 30 days by contacting support.',
  };
}

// =====================================================
// ANONYMIZE USER DATA
// =====================================================

async function handleDataAnonymization(
  supabase: ReturnType<typeof createClient>,
  userId: string
) {
  // Call the database function to anonymize data
  const { error } = await supabase.rpc('anonymize_user_data', {
    target_user_id: userId,
  });

  if (error) throw error;

  // Create anonymization record
  await supabase.from('data_requests').insert({
    user_id: userId,
    request_type: 'ANONYMIZE',
    status: 'COMPLETED',
    completed_at: new Date().toISOString(),
    metadata: {
      anonymized_at: new Date().toISOString(),
    },
  });

  return {
    message: 'Your data has been anonymized successfully',
    note: 'Your account has been converted to an anonymous account. Personal data has been removed.',
  };
}
