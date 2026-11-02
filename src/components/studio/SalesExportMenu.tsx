/**
 * The exports of one past event, in the two shapes the archive needs: a compact "Export" menu
 * for a list row, and two buttons for the page header. What it offers is decided from props
 * alone, without a request: the CSV always; the financial statement PDF when the event was
 * paid through Stripe, as a download when it exists and as "Generate now" before the
 * automatic run (24 h after the end) has produced it.
 */
import { useState, type MouseEvent } from "react";
import { Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { callStatement, openFromFunction } from "@/lib/eventStatementClient";
import { eventEnd } from "@/lib/eventTime";
import { statementState } from "@/lib/salesArchive";
import { downloadEventSalesCsv } from "@/lib/salesExport";
import { fmtDate, fmtTime } from "@/lib/studioFormat";

export interface SalesExportEvent {
  id: string;
  slug: string | null;
  title: string | null;
  payment_provider: string | null;
  date: string | null;
  ends_at: string | null;
}

interface Props {
  event: SalesExportEvent;
  /** Whether an event_statements row exists for the event (the parent knows from its own query). */
  hasStatement: boolean;
  /** Called once "Generate now" has produced the statement, so the parent can offer the download. */
  onStatementGenerated: () => void;
  variant: "menu" | "buttons";
}

type Busy = "csv" | "download" | "generate" | null;

/** The automatic run builds the statement this long after the event ends. */
const STATEMENT_DELAY_MS = 24 * 60 * 60 * 1000;

const NOT_STRIPE = "Not available: this event was not paid through Stripe.";
const AVAILABLE_LATER = "Statement available 24 h after the event ends";

const BUTTON =
  "inline-flex items-center justify-center gap-2 px-4 min-h-[44px] text-sm font-bold bg-card border border-border hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed";
const SMALL_BUTTON =
  "inline-flex items-center gap-1.5 px-3 min-h-[44px] text-xs font-bold bg-card border border-border hover:bg-muted disabled:opacity-60";
const ITEM = "rounded-none min-h-[40px] cursor-pointer";

/** The menu sits in a row that navigates on click: nothing inside it may reach the row. */
const stop = (e: MouseEvent) => e.stopPropagation();

export function SalesExportMenu({ event, hasStatement, onStatementGenerated, variant }: Props) {
  const [busy, setBusy] = useState<Busy>(null);
  const state = statementState(event, hasStatement);

  const end = eventEnd(event);
  const expectedFrom = end ? new Date(end.getTime() + STATEMENT_DELAY_MS).toISOString() : null;
  const expectedTitle = expectedFrom ? `Built on its own from ${fmtDate(expectedFrom)} ${fmtTime(expectedFrom)}` : undefined;

  const exportCsv = async () => {
    setBusy("csv");
    try {
      await downloadEventSalesCsv(event.id, event.slug);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  };

  // openFromFunction shows its own error toast.
  const downloadStatement = async () => {
    setBusy("download");
    try {
      await openFromFunction(event.id, "download");
    } finally {
      setBusy(null);
    }
  };

  const generateStatement = async () => {
    // Opened inside the click, so the browser does not take the PDF for a pop-up.
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    setBusy("generate");
    try {
      const { url } = await callStatement<{ url?: string }>(event.id, "regenerate");
      if (url) {
        if (tab) tab.location.href = url;
        else window.open(url, "_blank", "noopener,noreferrer");
      } else {
        tab?.close();
      }
      toast.success("Financial statement generated.");
      onStatementGenerated();
    } catch (err) {
      tab?.close();
      toast.error(err instanceof Error ? err.message : "Could not generate the statement.");
    } finally {
      setBusy(null);
    }
  };

  const busyLabel = busy === "csv" ? "Exporting…" : busy === "generate" ? "Generating…" : busy === "download" ? "Opening…" : null;

  if (variant === "menu") {
    return (
      <div className="inline-flex" onClick={stop}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" disabled={busy !== null} className={SMALL_BUTTON} aria-label={`Export ${event.title ?? "this event"}`}>
              {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <Download className="w-3.5 h-3.5" aria-hidden="true" />}
              {busyLabel ?? "Export"}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="rounded-none min-w-[260px]" onClick={stop}>
            <DropdownMenuItem className={ITEM} onSelect={() => void exportCsv()}>
              <Download className="w-4 h-4 mr-2" aria-hidden="true" />
              Export CSV
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {state === "not_stripe" ? (
              <>
                <DropdownMenuItem disabled className={ITEM}>
                  <FileText className="w-4 h-4 mr-2" aria-hidden="true" />
                  Financial statement (PDF)
                </DropdownMenuItem>
                <p className="px-2 pb-1.5 text-[11px] leading-snug text-muted-foreground">{NOT_STRIPE}</p>
              </>
            ) : state === "available" ? (
              <DropdownMenuItem className={ITEM} onSelect={() => void downloadStatement()}>
                <FileText className="w-4 h-4 mr-2" aria-hidden="true" />
                Download financial statement (PDF)
              </DropdownMenuItem>
            ) : (
              <>
                <DropdownMenuItem disabled className="rounded-none text-[11px] text-muted-foreground">
                  {AVAILABLE_LATER}
                </DropdownMenuItem>
                <DropdownMenuItem className={ITEM} onSelect={() => void generateStatement()} title={expectedTitle}>
                  <RefreshCw className="w-4 h-4 mr-2" aria-hidden="true" />
                  Generate now
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start md:items-end gap-1.5">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void exportCsv()} disabled={busy !== null} className={BUTTON}>
          {busy === "csv" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <Download className="w-4 h-4" aria-hidden="true" />}
          {busy === "csv" ? "Exporting…" : "Export CSV"}
        </button>
        {state === "not_stripe" ? (
          <button type="button" disabled className={BUTTON} title={NOT_STRIPE}>
            <FileText className="w-4 h-4" aria-hidden="true" />
            Financial statement (PDF)
          </button>
        ) : state === "available" ? (
          <button type="button" onClick={() => void downloadStatement()} disabled={busy !== null} className={BUTTON}>
            {busy === "download" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <FileText className="w-4 h-4" aria-hidden="true" />}
            {busy === "download" ? "Opening…" : "Download financial statement (PDF)"}
          </button>
        ) : (
          <button type="button" onClick={() => void generateStatement()} disabled={busy !== null} className={BUTTON} title={expectedTitle}>
            {busy === "generate" ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-4 h-4" aria-hidden="true" />}
            {busy === "generate" ? "Generating…" : "Generate statement now"}
          </button>
        )}
      </div>
      {state === "not_stripe" && <p className="text-[11px] leading-snug text-muted-foreground">{NOT_STRIPE}</p>}
      {state === "missing" && <p className="text-[11px] leading-snug text-muted-foreground">{AVAILABLE_LATER}</p>}
    </div>
  );
}
