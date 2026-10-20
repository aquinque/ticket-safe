import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Download, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { OrganizerProfile } from "@/hooks/useOrganizer";
import { eur, plural } from "@/lib/studioFormat";

// Only the sales statement is offered. TicketSafe does not invoice organizers: the service fee pays for what it
// does for the buyer and is owed by the buyer, so the organizer receives a statement of what it is owed.
type DocType = "sales_statement" | "service_invoice";

interface DocumentEvent {
  eventId: string;
  title: string;
  status: string | null;
  date: string | null;
  endsAt: string | null;
  paidOrders: number;
  paidTickets: number;
  grossCents: number;
  feeCents: number;
}

interface IssuedDocument {
  event_id: string;
  doc_type: DocType;
  document_number: string | null;
  status: "provisoire" | "definitif";
  issued_at: string;
}

const PAGE = 1000; // rows per request: the most the API returns

/**
 * What the documents are built from, read in full: every paid order of the organizer (a page
 * at a time, so an organizer with thousands of sales still sees the right totals), the events
 * they belong to, and the documents already issued.
 */
function useStudioDocuments(organizerId: string) {
  const [events, setEvents] = useState<DocumentEvent[]>([]);
  const [docs, setDocs] = useState<IssuedDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const totals = new Map<string, { paidOrders: number; paidTickets: number; grossCents: number; feeCents: number }>();
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from("event_orders")
          .select("event_id, quantity, total_cents, fee_cents")
          .eq("organizer_id", organizerId)
          .eq("status", "paid")
          .order("created_at", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        for (const r of data ?? []) {
          const t = totals.get(r.event_id) ?? { paidOrders: 0, paidTickets: 0, grossCents: 0, feeCents: 0 };
          t.paidOrders += 1;
          t.paidTickets += r.quantity;
          t.grossCents += r.total_cents;
          t.feeCents += r.fee_cents ?? 0;
          totals.set(r.event_id, t);
        }
        if ((data ?? []).length < PAGE) break;
      }

      const ids = [...totals.keys()];
      const found: DocumentEvent[] = [];
      for (let i = 0; i < ids.length; i += 100) {
        const { data, error } = await supabase
          .from("events")
          .select("id, title, status, date, ends_at")
          .in("id", ids.slice(i, i + 100));
        if (error) throw error;
        for (const e of data ?? []) {
          found.push({
            eventId: e.id,
            title: e.title ?? "Untitled event",
            status: e.status,
            date: e.date,
            endsAt: e.ends_at,
            ...(totals.get(e.id) as { paidOrders: number; paidTickets: number; grossCents: number; feeCents: number }),
          });
        }
      }
      found.sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

      // billing_documents isn't in the generated types yet; the policy returns only this organizer's own documents.
      const { data: issued, error: docsError } = await (supabase as unknown as {
        from: (table: string) => { select: (columns: string) => Promise<{ data: IssuedDocument[] | null; error: unknown }> };
      })
        .from("billing_documents")
        .select("event_id, doc_type, document_number, status, issued_at");
      if (docsError) throw docsError;

      setEvents(found);
      setDocs(issued ?? []);
      setFailed(false);
    } catch (err) {
      console.error("[StudioDocuments] load failed:", err);
      setFailed(true);
    } finally {
      setLoading(false);
    }
  }, [organizerId]);

  useEffect(() => {
    load();
  }, [load]);

  return { events, docs, loading, failed, reload: load };
}

export function StudioDocuments({ organizer }: { organizer: OrganizerProfile }) {
  const { events, docs, loading, failed, reload } = useStudioDocuments(organizer.id);
  const [busy, setBusy] = useState<string | null>(null);

  const statementFor = useMemo(() => {
    const byEvent = new Map(docs.filter((d) => d.doc_type === "sales_statement").map((d) => [d.event_id, d]));
    return (eventId: string) => byEvent.get(eventId);
  }, [docs]);

  const generate = async (eventId: string) => {
    const docType: DocType = "sales_statement";
    setBusy(eventId);
    // Opened now, inside the click, so the browser doesn't take it for a pop-up; pointed at the PDF once it exists.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        tab?.close();
        toast.error("Please sign in again.");
        return;
      }
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-billing-document`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ event_id: eventId, doc_type: docType }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        tab?.close();
        toast.error(data.error ?? "Could not generate the document.");
        return;
      }
      if (tab) tab.location.href = data.url;
      else window.open(data.url, "_blank", "noopener,noreferrer");
      reload();
    } catch {
      tab?.close();
      toast.error("Network error. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="bg-card border border-border" aria-labelledby="docs-heading">
      <div className="flex items-center justify-between px-4 md:px-5 py-3 border-b border-border">
        <h2 id="docs-heading" className="text-sm font-bold flex items-center gap-1.5">
          <Receipt className="w-4 h-4 text-primary" />
          Sales statements
        </h2>
        <span className="text-[11px] text-muted-foreground">PDF, one per event</span>
      </div>

      {loading ? (
        <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : failed ? (
        <p className="px-4 md:px-5 py-4 text-sm text-muted-foreground">Your statements couldn't be loaded. Reload the page to try again.</p>
      ) : events.length === 0 ? (
        <p className="px-4 md:px-5 py-4 text-sm text-muted-foreground">
          A sales statement for each event will appear here once you have sold tickets.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {events.map((e) => {
            const statement = statementFor(e.eventId);
            const working = busy === e.eventId;

            return (
              <li key={e.eventId} className="flex items-center justify-between gap-3 px-4 md:px-5 py-3">
                <div className="min-w-0">
                  <Link to={`/studio/events/${e.eventId}`} className="font-semibold text-sm hover:text-primary truncate block">{e.title}</Link>
                  <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                    {plural(e.paidOrders, "paid order")} · {eur(e.grossCents)} gross
                    {e.grossCents > 0 && (
                      <> · {statement?.status === "definitif" ? `Final, ${statement.document_number}` : "Provisional, updates until you are paid out"}</>
                    )}
                  </div>
                </div>

                {e.grossCents <= 0 ? (
                  <span className="text-xs text-muted-foreground shrink-0">Free tickets, nothing to report</span>
                ) : (
                  <button
                    type="button"
                    disabled={working}
                    onClick={() => generate(e.eventId)}
                    className="inline-flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-bold bg-card border border-border hover:bg-muted disabled:opacity-60 shrink-0"
                  >
                    {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                    Download statement
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <p className="px-4 md:px-5 py-3 border-t border-border text-[11px] leading-relaxed text-muted-foreground">
        Buyers pay the service fee on top of your ticket price, for the service TicketSafe provides to them (issuing and sending the ticket,
        keeping the payment records). You receive the full ticket price and are not invoiced.
      </p>
    </section>
  );
}
