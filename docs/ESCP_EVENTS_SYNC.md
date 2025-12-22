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

## 🔄 How to Update Events on the Platform

### ⚠️ Important: Events don't update automatically

After updating the calendar source URL, **new ESCP events won't appear on the website until you sync them**.

Think of it like this:
- The ESCP calendar is updated regularly with new events
- Our platform needs to "fetch" these events and save them
- This fetching process is called **synchronization**

---

### ✅ Action Required: Run the Sync Function

To make new events appear, you need to trigger the synchronization process.

#### **Option 1: Via Supabase Dashboard** (Easiest method)

**What you need:**
- Access to the Supabase Dashboard
- 30 seconds of your time

**Steps:**
1. Open [Supabase Dashboard](https://supabase.com/dashboard)
2. Navigate to: **Edge Functions** (in the left sidebar)
3. Find the function named: `sync-escp-events`
4. Click the **"Invoke"** button
5. Wait 5-10 seconds for the sync to complete
6. ✅ Done! New events are now visible on the website

**What happens when you click "Invoke"?**
- The system connects to ESCP's calendar
- Downloads all upcoming events
- Saves them to the database
- Makes them available on the platform

---

#### **Option 2: Automatic Sync** (Recommended for long-term)

**What is this?**
Instead of manually clicking "Invoke" each time, you can set up automatic synchronization.

**Benefits:**
- Events update automatically every 6 hours
- No manual intervention needed
- Always up-to-date with ESCP calendar

**Setup:**
This requires setting up a scheduled job (cron). If you need this, ask a developer to configure it using the example below:

```sql
-- This runs the sync function automatically every 6 hours
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

---

## 🚀 Deployment (For Developers)

### Initial Setup

**1. Deploy the sync function to Supabase:**
```bash
supabase functions deploy sync-escp-events
```

**2. Run the first sync to populate events:**
```bash
curl -X POST \
  https://YOUR_PROJECT_ID.supabase.co/functions/v1/sync-escp-events \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY"
```

**3. Verify events were imported:**
- Go to the Full Catalog page (`/catalog`)
- You should see all ESCP events listed

---

## 📊 Monitoring & Verification

### How to check if the sync worked

**After running the sync function, you can verify it succeeded:**

**Option 1: Check the website**
1. Go to the Full Catalog page: `/catalog`
2. You should see ESCP events listed
3. If you see events → ✅ Sync successful!

**Option 2: Check Supabase logs** (For developers)
1. Go to **Supabase Dashboard** → **Edge Functions**
2. Click on `sync-escp-events`
3. Open the **Logs** tab
4. Look for the latest execution

**What you should see in the logs:**
- ✅ `Synced X events from ESCP iCal feed`
- ✅ Statistics showing:
  - Total events in calendar feed
  - Number of future events imported
  - Successfully synced count
  - Error count (should be 0)

**Example successful log:**
```
[SYNC] Complete: 45 synced, 0 errors
Synced 45 events from ESCP iCal feed
```

## 🔧 Troubleshooting

### Problem: No events showing on the website

**Quick checklist:**
1. ✅ Did you run the sync function? → Go to Supabase and click "Invoke"
2. ✅ Did the sync complete? → Check logs (should show "X synced, 0 errors")
3. ✅ Are you looking at the right page? → Go to `/catalog` (Full Catalog)

**Still no events?**
- Wait 10-20 seconds and refresh the page
- Check if ESCP's calendar is accessible: [Open ESCP Calendar](https://campuslife.escp.eu/ical/escp/ical_escp.ics)
- If the calendar link is broken, contact ESCP IT support

---

### Problem: Events are outdated

**Solution:**
Run the sync function again to fetch the latest events from ESCP.

**Steps:**
1. Go to Supabase Dashboard → Edge Functions
2. Click `sync-escp-events` → Click "Invoke"
3. Wait for completion
4. Refresh the Full Catalog page

**Note:** The sync will automatically:
- Add new events
- Update changed events
- Remove past events

---

### Problem: Sync function failed

**How to know it failed:**
- Logs show errors
- Event count is 0 or very low
- Website shows no events

**Common causes:**
- ESCP calendar URL changed
- Network connection issue
- Supabase function timeout

**Solution:**
1. Check the logs in Supabase (Edge Functions → sync-escp-events → Logs)
2. Look for error messages
3. If you see network errors, try again in a few minutes
4. If errors persist, contact a developer with the error message

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
