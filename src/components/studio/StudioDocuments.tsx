import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronDown, Download, FileText, Loader2, Receipt } from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { supabase } from "@/integrations/supabase/client";
import type { OrganizerProfile } from "@/hooks/useOrganizer";
import { eur, fmtDate, plural } from "@/lib/studioFormat";
// The same rules the server applies before it issues an invoice, here only to say why one isn't available yet.
import { invoiceBlocker } from "../../../supabase/functions/_shared/billingRules.ts";

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

const billedTo = (o: OrganizerProfile) =>
  [o.billing_address_line1, [o.billing_postal_code, o.billing_city].filter(Boolean).join(" ")].filter(Boolean).join(", ");

export function StudioDocuments({ organizer }: { organizer: OrganizerProfile }) {
  const navigate = useNavigate();
  const { events, docs, loading, failed, reload } = useStudioDocuments(organizer.id);
  const [busy, setBusy] = useState<string | null>(null);
  const [issuing, setIssuing] = useState<DocumentEvent | null>(null);

  const docFor = useMemo(() => {
    const byKey = new Map(docs.map((d) => [`${d.event_id}:${d.doc_type}`, d]));
    return (eventId: string, type: DocType) => byKey.get(`${eventId}:${type}`);
  }, [docs]);

  const generate = async (eventId: string, docType: DocType) => {
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
        const message = data.error ?? "Could not generate the document.";
        if (data.code === "client_details_missing") {
          toast.error(message, { action: { label: "Open Settings", onClick: () => navigate("/studio/profile") } });
        } else {
          toast.error(message);
        }
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
          Statements and invoices
        </h2>
        <span className="text-[11px] text-muted-foreground">PDF, one per event</span>
      </div>

      {loading ? (
        <div className="p-6 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>
      ) : failed ? (
        <p className="px-4 md:px-5 py-4 text-sm text-muted-foreground">Your statements couldn't be loaded. Reload the page to try again.</p>
      ) : events.length === 0 ? (
        <p className="px-4 md:px-5 py-4 text-sm text-muted-foreground">
          A sales statement and a service fee invoice for each event will appear here once you have sold tickets.
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {events.map((e) => {
            const statement = docFor(e.eventId, "sales_statement");
            const invoice = docFor(e.eventId, "service_invoice");
            const issued = invoice?.status === "definitif";
            const blocker = issued
              ? null
              : invoiceBlocker({
                  event: { status: e.status, ends_at: e.endsAt, date: e.date },
                  paidTickets: e.paidTickets,
                  feeCents: e.feeCents,
                  client: organizer,
                });
            const needsDetails = blocker?.code === "client_details_missing";
            const working = busy === e.eventId;

            return (
              <li key={e.eventId} className="flex items-center justify-between gap-3 px-4 md:px-5 py-3">
                <div className="min-w-0">
                  <Link to={`/studio/events/${e.eventId}`} className="font-semibold text-sm hover:text-primary truncate block">{e.title}</Link>
                  <div className="text-xs text-muted-foreground mt-0.5 tabular-nums">
                    {plural(e.paidOrders, "paid order")} · {eur(e.grossCents)} gross
                  </div>
                </div>

                {e.grossCents <= 0 ? (
                  <span className="text-xs text-muted-foreground shrink-0">Free tickets, nothing to report</span>
                ) : (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        disabled={working}
                        className="inline-flex items-center gap-1.5 px-3 min-h-[40px] text-xs font-bold bg-card border border-border hover:bg-muted disabled:opacity-60 shrink-0"
                      >
                        {working ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
                        Download
                        <ChevronDown className="w-3 h-3" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="min-w-[270px]">
                      <DropdownMenuItem onClick={() => generate(e.eventId, "sales_statement")}>
                        <FileText className="w-3.5 h-3.5 mr-2 shrink-0" />
                        <span className="flex flex-col">
                          <span>Sales statement (relevé de ventes)</span>
                          <span className="text-[11px] text-muted-foreground">
                            {statement?.status === "definitif" ? `Final · ${statement.document_number}` : "Provisional, updates until you are paid out"}
                          </span>
                        </span>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        disabled={!!blocker && !needsDetails}
                        title={blocker?.message}
                        onClick={() => {
                          if (needsDetails) navigate("/studio/profile");
                          else if (issued) generate(e.eventId, "service_invoice");
                          else setIssuing(e);
                        }}
                      >
                        <Receipt className="w-3.5 h-3.5 mr-2 shrink-0" />
                        <span className="flex flex-col">
                          <span>{issued || blocker ? "Service fee invoice" : "Issue service fee invoice"}</span>
                          <span className="text-[11px] text-muted-foreground">
                            {issued && invoice
                              ? `${invoice.document_number} · ${fmtDate(invoice.issued_at)}`
                              : blocker
                                ? blocker.hint
                                : "A legal document, numbered once"}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* An invoice gets its own number and can't be changed afterwards, so it is never issued by a stray click. */}
      <AlertDialog open={!!issuing} onOpenChange={(open) => !open && setIssuing(null)}>
        <AlertDialogContent className="max-w-lg">
          {issuing && (
            <>
              <AlertDialogTitle>Issue the service fee invoice?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-foreground/85">
                  <p>
                    Invoice for <strong>{issuing.title}</strong>: {plural(issuing.paidTickets, "ticket")} sold, service fees of{" "}
                    <strong>{eur(issuing.feeCents, 2)}</strong> in total.
                  </p>
                  <div>
                    <div className="text-xs font-bold text-muted-foreground mb-1">Billed to</div>
                    <div className="border border-border bg-muted/40 px-3 py-2">
                      <div className="font-semibold">{organizer.name}</div>
                      <div className="text-muted-foreground">{billedTo(organizer)}</div>
                      <div className="text-muted-foreground">
                        {[organizer.siren && `SIREN ${organizer.siren}`, organizer.rna_number && `RNA ${organizer.rna_number}`].filter(Boolean).join(" · ")}
                      </div>
                    </div>
                  </div>
                  <p>
                    An invoice is a legal document with its own number. Once issued it cannot be changed or deleted, so check these details first.{" "}
                    <Link to="/studio/profile" className="underline underline-offset-2">Edit them in Settings</Link>.
                  </p>
                </div>
              </AlertDialogDescription>
              <div className="flex items-center justify-end gap-2 mt-5 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIssuing(null)}
                  className="inline-flex items-center gap-1.5 px-4 min-h-[40px] text-sm font-bold bg-muted text-foreground hover:bg-muted/70"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = issuing;
                    setIssuing(null);
                    generate(target.eventId, "service_invoice");
                  }}
                  className="inline-flex items-center gap-1.5 px-4 min-h-[40px] text-sm font-bold bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Receipt className="w-3.5 h-3.5" />
                  Issue invoice
                </button>
              </div>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
