# 🚀 Déploiement de la Synchronisation des Événements ESCP

## Méthode Simple: Via le Dashboard Supabase

### Étape 1: Accéder au Dashboard

1. Va sur `https://supabase.com/dashboard`
2. Connecte-toi avec ton compte
3. Sélectionne ton projet **ticket-safe**

---

### Étape 2: Créer la Fonction Edge

1. Dans la barre latérale gauche, clique sur **"Edge Functions"**
2. Clique sur **"Create a new function"** (bouton en haut à droite)
3. **Nom de la fonction**: `sync-escp-events`
4. Laisse les autres options par défaut
5. Clique sur **"Create function"**

---

### Étape 3: Copier le Code de la Fonction

Dans l'éditeur qui s'ouvre, **supprime tout le code par défaut** et colle ce code complet:

```typescript
// =====================================================
// SYNC ESCP EVENTS FROM ICAL
// Fetches and syncs events from ESCP's iCal feed
// =====================================================

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import ICAL from 'https://esm.sh/ical.js@1.5.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ESCP_ICAL_URL = 'https://campuslife.escp.eu/ical/escp/ical_escp.ics';

interface ESCPEvent {
  uid: string;
  title: string;
  description: string;
  location: string;
  start_date: string;
  end_date: string;
  organizer: string;
  category: string;
  url?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('[SYNC] Fetching ESCP events from iCal feed...');

    // Fetch iCal file
    const response = await fetch(ESCP_ICAL_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch iCal: ${response.statusText}`);
    }

    const icalData = await response.text();
    console.log('[SYNC] iCal data fetched, parsing...');

    // Parse iCal
    const jcalData = ICAL.parse(icalData);
    const vcalendar = new ICAL.Component(jcalData);
    const vevents = vcalendar.getAllSubcomponents('vevent');

    console.log(`[SYNC] Found ${vevents.length} events in iCal feed`);

    const events: ESCPEvent[] = [];
    const now = new Date();

    for (const vevent of vevents) {
      const event = new ICAL.Event(vevent);

      // Only sync future events
      const startDate = new Date(event.startDate.toString());
      if (startDate < now) {
        continue;
      }

      // Extract category from categories or default
      let category = 'Other';
      const categories = vevent.getFirstPropertyValue('categories');
      if (categories) {
        const catString = Array.isArray(categories) ? categories[0] : categories;
        category = mapCategory(catString);
      }

      // Extract organizer name
      let organizer = 'ESCP Campus Life';
      const organizerProp = vevent.getFirstProperty('organizer');
      if (organizerProp) {
        const cn = organizerProp.getParameter('cn');
        if (cn) organizer = cn;
      }

      events.push({
        uid: event.uid,
        title: event.summary || 'Untitled Event',
        description: event.description || '',
        location: event.location || 'ESCP Campus',
        start_date: event.startDate.toJSDate().toISOString(),
        end_date: event.endDate.toJSDate().toISOString(),
        organizer,
        category,
        url: vevent.getFirstPropertyValue('url') || null,
      });
    }

    console.log(`[SYNC] Syncing ${events.length} future events to database...`);

    // Upsert events to database
    let syncedCount = 0;
    let errorCount = 0;

    for (const event of events) {
      try {
        // Check if event already exists
        const { data: existing } = await supabase
          .from('escp_events')
          .select('id')
          .eq('ical_uid', event.uid)
          .single();

        if (existing) {
          // Update existing event
          await supabase
            .from('escp_events')
            .update({
              title: event.title,
              description: event.description,
              location: event.location,
              start_date: event.start_date,
              end_date: event.end_date,
              organizer: event.organizer,
              category: event.category,
              url: event.url,
              last_synced_at: new Date().toISOString(),
            })
            .eq('id', existing.id);
        } else {
          // Insert new event
          await supabase
            .from('escp_events')
            .insert({
              ical_uid: event.uid,
              title: event.title,
              description: event.description,
              location: event.location,
              start_date: event.start_date,
              end_date: event.end_date,
              organizer: event.organizer,
              category: event.category,
              url: event.url,
              is_active: true,
              last_synced_at: new Date().toISOString(),
            });
        }

        syncedCount++;
      } catch (error) {
        console.error(`[SYNC] Error syncing event ${event.uid}:`, error);
        errorCount++;
      }
    }

    console.log(`[SYNC] Complete: ${syncedCount} synced, ${errorCount} errors`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${syncedCount} events from ESCP iCal feed`,
        stats: {
          total_in_feed: vevents.length,
          future_events: events.length,
          synced: syncedCount,
          errors: errorCount,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('[SYNC] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});

// Map ESCP categories to our system
function mapCategory(icalCategory: string): string {
  const category = icalCategory.toLowerCase();

  if (category.includes('party') || category.includes('soirée') || category.includes('fete')) {
    return 'Parties';
  }
  if (category.includes('gala')) {
    return 'Galas';
  }
  if (category.includes('conference') || category.includes('talk') || category.includes('workshop')) {
    return 'Conferences';
  }
  if (category.includes('sport')) {
    return 'Sports';
  }
  if (category.includes('sustainability') || category.includes('environment') || category.includes('green')) {
    return 'Sustainability';
  }

  return 'Other';
}
```

---

### Étape 4: Déployer la Fonction

1. Vérifie que tout le code est bien copié
2. Clique sur **"Deploy"** ou **"Save"** (bouton en haut à droite)
3. Attends quelques secondes que le déploiement se termine
4. Tu devrais voir un message de succès ✅

---

### Étape 5: Lancer la Première Synchronisation

1. Reste sur la page de la fonction `sync-escp-events`
2. Cherche le bouton **"Invoke"** ou **"Run"**
3. Clique dessus pour lancer la synchronisation
4. Attends 10-20 secondes
5. Tu devrais voir une réponse JSON comme:

```json
{
  "success": true,
  "message": "Synced 45 events from ESCP iCal feed",
  "stats": {
    "total_in_feed": 87,
    "future_events": 45,
    "synced": 45,
    "errors": 0
  }
}
```

---

### Étape 6: Vérifier que ça Marche

#### **Option A: Via la Base de Données**
1. Dans Supabase, va dans **"Table Editor"**
2. Clique sur la table **`escp_events`**
3. Tu devrais voir plein d'événements ESCP avec:
   - Titres d'événements
   - Dates
   - Lieux
   - Catégories

#### **Option B: Via ton Site Web**
1. Lance ton application: `npm run dev`
2. Va sur `http://localhost:5173/catalog`
3. Tu devrais voir tous les événements ESCP affichés !

---

## ✅ **C'est Terminé !**

L'intégration est maintenant active. Les événements ESCP sont:
- ✅ Synchronisés depuis le calendrier ESCP
- ✅ Stockés dans ta base de données
- ✅ Visibles sur `/catalog` (tous les événements)
- ✅ Visibles sur `/events` (événements avec billets disponibles)

---

## 🔄 **Pour Synchroniser les Nouveaux Événements à l'Avenir**

Quand l'ESCP ajoute de nouveaux événements à son calendrier:
1. Va dans **Edge Functions** → `sync-escp-events`
2. Clique sur **"Invoke"**
3. Les nouveaux événements apparaissent automatiquement !

---

## ❓ **En Cas de Problème**

**La fonction ne se déploie pas:**
- Vérifie que tu as bien copié TOUT le code (depuis `import` jusqu'à la dernière `}`)
- Vérifie qu'il n'y a pas d'erreurs de syntaxe surlignées en rouge

**Aucun événement après le sync:**
- Vérifie que la table `escp_events` existe dans ta base de données
- Regarde les logs de la fonction (onglet "Logs") pour voir les erreurs

**Besoin d'aide:**
- Regarde le fichier `docs/ESCP_EVENTS_SYNC.md` pour plus de détails
- Partage-moi les logs d'erreur si tu en as
