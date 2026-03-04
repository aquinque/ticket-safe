// =====================================================
// SYNC ESCP EVENTS FROM ICAL
// =====================================================
// Fetches the ESCP Campus Life iCal feed and upserts events
// into both escp_events (catalog) and events (marketplace).
//
// Optimisations:
//   • ETag / If-Modified-Since at feed level → 304 early return
//   • LAST-MODIFIED per VEVENT → skip unchanged events
//
// Cron: call via pg_net every 6 h (see migration 20260305000001)
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import ICAL from 'https://esm.sh/ical.js@1.5.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ESCP_ICAL_URL = 'https://campuslife.escp.eu/ical/escp/ical_escp.ics';
const SYNC_STATE_KEY = 'escp-ical';

interface ESCPEvent {
  uid: string;
  title: string;
  description: string;
  location: string | null;
  start_date: string;          // ISO-8601
  end_date: string;            // ISO-8601
  organizer: string;
  campus: string | null;
  category: string;
  url: string | null;
  ical_last_modified: string | null; // ISO-8601 from LAST-MODIFIED property
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // ── 1. Load cached ETag / Last-Modified ────────────────────────────────
    const { data: syncState } = await supabase
      .from('sync_state')
      .select('etag, last_modified')
      .eq('key', SYNC_STATE_KEY)
      .maybeSingle();

    const fetchHeaders: Record<string, string> = {};
    if (syncState?.etag)          fetchHeaders['If-None-Match']     = syncState.etag;
    if (syncState?.last_modified) fetchHeaders['If-Modified-Since'] = syncState.last_modified;

    console.log('[SYNC] Fetching ESCP events iCal feed...',
      syncState?.etag ? `(ETag: ${syncState.etag})` : '(no cache)');

    // ── 2. Fetch iCal ──────────────────────────────────────────────────────
    const response = await fetch(ESCP_ICAL_URL, { headers: fetchHeaders });

    // 304 → nothing changed
    if (response.status === 304) {
      console.log('[SYNC] Feed unchanged (304). Skipping.');
      return new Response(
        JSON.stringify({
          success: true,
          message: 'iCal feed unchanged since last sync',
          stats: { total_in_feed: 0, future_events: 0, synced: 0, errors: 0, cached: true },
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }

    if (!response.ok) {
      throw new Error(`Failed to fetch iCal: ${response.status} ${response.statusText}`);
    }

    // Save new ETag / Last-Modified for next run
    const newEtag         = response.headers.get('ETag');
    const newLastModified = response.headers.get('Last-Modified');

    const icalData = await response.text();
    console.log('[SYNC] Parsing iCal...');

    // ── 3. Parse iCal ──────────────────────────────────────────────────────
    const jcalData  = ICAL.parse(icalData);
    const vcal      = new ICAL.Component(jcalData);
    const vevents   = vcal.getAllSubcomponents('vevent');

    console.log(`[SYNC] ${vevents.length} events in feed`);

    const events: ESCPEvent[] = [];
    const now = new Date();

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);

      // Skip past events (use UTC comparison)
      const startDate = event.startDate.toJSDate();
      if (startDate < now) continue;

      // Category
      let category = 'Other';
      const categories = vevent.getFirstPropertyValue('categories');
      if (categories) {
        const cat = Array.isArray(categories) ? categories[0] : categories;
        category  = mapCategory(String(cat));
      }

      // Organizer → campus
      let organizer = 'ESCP Campus Life';
      const orgProp = vevent.getFirstProperty('organizer');
      if (orgProp) {
        const cn = orgProp.getParameter('cn');
        if (cn) organizer = String(cn);
      }
      const campus = extractCampus(organizer);

      // Location: strip private placeholder
      const rawLocation = event.location || null;
      const location =
        rawLocation && rawLocation.toLowerCase().includes('sign in') ? null : rawLocation;

      // URL: ensure protocol
      const rawUrl = vevent.getFirstPropertyValue('url') || null;
      const url    = rawUrl && !String(rawUrl).startsWith('http') ? `https://${rawUrl}` : rawUrl;

      // LAST-MODIFIED per event (if provided by server)
      const lastModProp  = vevent.getFirstPropertyValue('last-modified');
      let ical_last_modified: string | null = null;
      if (lastModProp) {
        try {
          const lm = new ICAL.Time(lastModProp as ICAL.TimeJsonData);
          ical_last_modified = lm.toJSDate().toISOString();
        } catch {
          // property present but unparseable — ignore
        }
      }

      events.push({
        uid:                event.uid,
        title:              event.summary  || 'Untitled Event',
        description:        event.description || '',
        location,
        start_date:         startDate.toISOString(),
        end_date:           event.endDate.toJSDate().toISOString(),
        organizer,
        campus,
        category,
        url:                url ? String(url) : null,
        ical_last_modified,
      });
    }

    console.log(`[SYNC] ${events.length} future events to sync...`);

    // ── 4. Upsert events ───────────────────────────────────────────────────
    let syncedCount = 0;
    let skippedCount = 0;
    let errorCount  = 0;
    const syncedAt  = new Date().toISOString();

    for (const ev of events) {
      try {
        // ── 4a. escp_events (catalog) ──────────────────────────────────────
        const { data: existing } = await supabase
          .from('escp_events')
          .select('id, ical_last_modified')
          .eq('ical_uid', ev.uid)
          .maybeSingle();

        if (existing) {
          // Skip if VEVENT hasn't changed since last sync
          if (
            ev.ical_last_modified &&
            existing.ical_last_modified &&
            new Date(ev.ical_last_modified) <= new Date(existing.ical_last_modified)
          ) {
            skippedCount++;
            // Still need to sync the marketplace events row (admin may have changed it)
            // Fall through to step 4b.
          } else {
            await supabase
              .from('escp_events')
              .update({
                title:               ev.title,
                description:         ev.description,
                location:            ev.location,
                start_date:          ev.start_date,
                end_date:            ev.end_date,
                organizer:           ev.organizer,
                category:            ev.category,
                url:                 ev.url,
                last_synced_at:      syncedAt,
                ical_last_modified:  ev.ical_last_modified,
              })
              .eq('id', existing.id);
          }
        } else {
          await supabase
            .from('escp_events')
            .insert({
              ical_uid:           ev.uid,
              title:              ev.title,
              description:        ev.description,
              location:           ev.location,
              start_date:         ev.start_date,
              end_date:           ev.end_date,
              organizer:          ev.organizer,
              category:           ev.category,
              url:                ev.url,
              is_active:          true,
              last_synced_at:     syncedAt,
              ical_last_modified: ev.ical_last_modified,
            });
        }

        // ── 4b. events (marketplace) ───────────────────────────────────────
        // Key: (external_source, external_event_id) = ('campuslife', ev.uid)
        const { data: existingMarket } = await supabase
          .from('events')
          .select('id')
          .eq('external_source', 'campuslife')
          .eq('external_event_id', ev.uid)
          .maybeSingle();

        if (existingMarket) {
          // Preserve base_price and campus set by admin; only sync mutable iCal fields.
          const patch: Record<string, unknown> = {
            title:       ev.title,
            description: ev.description,
            date:        ev.start_date,
            location:    ev.location,
            category:    ev.category,
            is_active:   true,
            updated_at:  syncedAt,
          };
          // Only overwrite campus if iCal provides one
          if (ev.campus !== null) patch.campus = ev.campus;

          await supabase
            .from('events')
            .update(patch)
            .eq('id', existingMarket.id);
        } else {
          await supabase
            .from('events')
            .insert({
              title:              ev.title,
              description:        ev.description,
              date:               ev.start_date,
              location:           ev.location,
              category:           ev.category,
              university:         'ESCP Business School',
              campus:             ev.campus,
              base_price:         null,   // admin fills in
              image_url:          null,
              is_active:          true,
              external_source:    'campuslife',
              external_event_id:  ev.uid,
              needs_review:       true,   // admin review queue
            });
        }

        syncedCount++;
      } catch (error) {
        console.error(`[SYNC] Error on ${ev.uid}:`, error);
        errorCount++;
      }
    }

    // ── 5. Persist new ETag ────────────────────────────────────────────────
    if (newEtag || newLastModified) {
      await supabase
        .from('sync_state')
        .upsert(
          { key: SYNC_STATE_KEY, etag: newEtag, last_modified: newLastModified, synced_at: syncedAt },
          { onConflict: 'key' }
        );
      console.log(`[SYNC] ETag saved: ${newEtag ?? 'n/a'}`);
    }

    console.log(
      `[SYNC] Done: ${syncedCount} synced, ${skippedCount} skipped (unchanged), ${errorCount} errors`
    );

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${syncedCount} events from ESCP iCal feed`,
        stats: {
          total_in_feed: vevents.length,
          future_events: events.length,
          synced:        syncedCount,
          skipped:       skippedCount,
          errors:        errorCount,
          cached:        false,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('[SYNC] Fatal error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Map ESCP iCal categories to internal taxonomy
// Known values: Athletic/Sports, Dinner/Gala, Academic, Conference, Cultural,
//               Networking, Ceremony, Online Webinar, Meeting, Orientation, ...
function mapCategory(icalCategory: string): string {
  const c = icalCategory.toLowerCase();

  if (c.includes('party') || c.includes('soirée') || c.includes('fete'))         return 'Parties';
  if (c.includes('gala') || c.includes('dinner'))                                  return 'Galas';
  if (c.includes('conference') || c.includes('talk')  || c.includes('workshop') ||
      c.includes('webinar')    || c.includes('academic') || c.includes('seminar')) return 'Conferences';
  if (c.includes('sport') || c.includes('athletic') || c.includes('climbing') ||
      c.includes('run'))                                                            return 'Sports';
  if (c.includes('sustainability') || c.includes('environment') ||
      c.includes('green'))                                                          return 'Sustainability';

  return 'Other';
}

// Extract campus name from iCal organizer CN field.
// Examples:
//   "Girl Up - Berlin Campus"          → "Berlin"
//   "Run Club - London Campus"         → "London"
//   "Paris Campus"                     → "Paris"
//   "ESCP Business School - Federal"   → null
function extractCampus(organizer: string): string | null {
  const match =
    organizer.match(/[-–]\s*([A-Za-z]+)\s+Campus/i) ||
    organizer.match(/^([A-Za-z]+)\s+Campus/i);

  if (match) {
    const name  = match[1];
    const known = ['Paris', 'London', 'Berlin', 'Madrid', 'Turin', 'Warsaw'];
    return known.find((k) => k.toLowerCase() === name.toLowerCase()) ?? name;
  }
  return null;
}
