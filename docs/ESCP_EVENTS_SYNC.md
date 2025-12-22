# ESCP Events Synchronization

This document explains how the ESCP Campus Life events calendar is integrated into the ticket-safe platform.

## Overview

The platform automatically syncs events from the ESCP Campus Life calendar so that students can:
- **Sell tickets** for any ESCP event directly from the catalog
- **Buy tickets** for events that have listings available
- View the **complete catalog** of ESCP events (with and without tickets)

## Calendar Source

**Calendar URL**: `https://campuslife.escp.eu/ical/escp/ical_escp.ics`

This URL provides:
- All ESCP Campus Life events
- Complete calendar feed for ESCP
- Includes all event types and categories

## Architecture

### 1. Edge Function: `sync-escp-events`

**Location**: `supabase/functions/sync-escp-events/index.ts`

**What it does**:
- Fetches the iCal feed from ESCP Campus Life
- Parses events using ical.js library
- Filters out past events (only syncs future events)
- Upserts events to the `escp_events` table
- Maps ESCP categories to platform categories

**Event Categories Mapping**:
- Parties → "Parties"
- Galas → "Galas"
- Conferences/Talks/Workshops → "Conferences"
- Sports → "Sports"
- Sustainability/Environment → "Sustainability"
- Other → "Other"

### 2. Database Table: `escp_events`

**Schema**:
```sql
CREATE TABLE escp_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ical_uid TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  location TEXT NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  organizer TEXT DEFAULT 'ESCP Campus Life',
  category TEXT,
  url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. React Hook: `useESCPEvents`

**Location**: `src/hooks/useESCPEvents.tsx`

**Parameters**:
- `onlyWithTickets` (boolean): Filter events that have available tickets
- `category` (string): Filter by event category

**Returns**:
- `events`: Array of ESCPEvent objects
- `loading`: Loading state
- `error`: Error state

**Usage Examples**:
```typescript
// Get all events (for Full Catalog)
const { events } = useESCPEvents({ onlyWithTickets: false });

// Get only events with available tickets (for Available Events)
const { events } = useESCPEvents({ onlyWithTickets: true });

// Get events by category
const { events } = useESCPEvents({ category: 'Parties' });
```

## How It Works

### Seller Flow:
1. Student navigates to `/sell` (Sell Ticket page)
2. Event selector shows **ALL** ESCP events from the catalog
3. Student can search by name, location, or category
4. Student selects an event and lists their ticket
5. Once listed, the event automatically appears in "Available Events"

### Buyer Flow:
1. Student navigates to `/events` (Available Events)
2. Only events with **available tickets** are shown
3. Student can search and filter events
4. Student clicks on an event to see ticket listings
5. Student purchases a ticket

### Full Catalog:
1. Student navigates to `/catalog`
2. **ALL** ESCP events are shown (past are filtered out)
3. Events with tickets show "View Tickets" button
4. Events without tickets show "Sell Your Ticket" button

## Synchronization

### Manual Sync (via Supabase Dashboard)

1. Go to Supabase Dashboard → Edge Functions
2. Find `sync-escp-events` function
3. Click "Invoke" to trigger manual sync

### Automatic Sync (Recommended)

Set up a cron job to sync events regularly:

```sql
-- Example: Sync events every 6 hours
SELECT cron.schedule(
  'sync-escp-events',
  '0 */6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://YOUR_PROJECT_ID.supabase.co/functions/v1/sync-escp-events',
    headers := '{"Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb
  );
  $$
);
```

## Deployment

### Deploy the Edge Function:

```bash
supabase functions deploy sync-escp-events
```

### Initial Sync:

After deployment, run the function once to populate the database:

```bash
curl -X POST \
  https://YOUR_PROJECT_ID.supabase.co/functions/v1/sync-escp-events \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

## Monitoring

Check sync logs in Supabase Dashboard:
- Go to Edge Functions → sync-escp-events → Logs
- Look for sync statistics:
  - Total events in feed
  - Future events filtered
  - Successfully synced
  - Errors (if any)

## Troubleshooting

### No Events Showing Up

1. Check if Edge Function ran successfully:
   ```bash
   # View logs
   supabase functions logs sync-escp-events
   ```

2. Verify database has events:
   ```sql
   SELECT COUNT(*) FROM escp_events WHERE is_active = true;
   ```

3. Check if events are in the future:
   ```sql
   SELECT COUNT(*) FROM escp_events
   WHERE is_active = true
   AND start_date > NOW();
   ```

### Events Not Updating

1. Check `last_synced_at` timestamp:
   ```sql
   SELECT MAX(last_synced_at) FROM escp_events;
   ```

2. Manually trigger sync
3. Check iCal URL is accessible:
   ```bash
   curl -I https://campuslife.escp.eu/ics?topic_tags=6554010&school=escp
   ```

## Data Privacy

- Events are public information from ESCP Campus Life
- No personal data is stored in `escp_events` table
- Event descriptions may contain contact information (public)
- Ticket listings are linked to events but stored separately

## Future Improvements

- [ ] Add webhook support for real-time event updates
- [ ] Cache iCal response to reduce API calls
- [ ] Add event image URLs from ESCP
- [ ] Support for recurring events
- [ ] Event capacity tracking
- [ ] Integration with ESCP authentication for organizer verification
