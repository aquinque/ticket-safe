/**
 * Admin — Ticket Review Queue
 *
 * Shows all tickets with verification_status = 'pending'.
 * Admins can approve (ticket goes live) or reject (cancelled + reason).
 * Only accessible to users with role = 'admin' in user_roles table.
 */

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  Shield,
  RefreshCw,
  AlertTriangle,
  User,
  Calendar,
  MapPin,
  Euro,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PendingTicket {
  id: string;
  status: string;
  verification_status: string;
  selling_price: number;
  quantity: number;
  notes: string | null;
  qr_verified: boolean;
  created_at: string;
  event: {
    id: string;
    title: string;
    date: string;
    location: string | null;
    campus: string | null;
  } | null;
  seller: {
    full_name: string;
    email: string;
    campus: string | null;
  } | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ReviewTickets = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tickets, setTickets] = useState<PendingTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  // Check admin role
  useEffect(() => {
    if (!user) return;
    supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        setIsAdmin(data?.role === "admin");
        if (data?.role !== "admin") {
          toast.error("Admin access required");
          navigate("/");
        }
      });
  }, [user, navigate]);

  // Fetch pending tickets
  const fetchPending = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("tickets")
        .select(`
          id, status, verification_status, selling_price, quantity,
          notes, qr_verified, created_at,
          event:events(id, title, date, location, campus),
          seller:profiles(full_name, email, campus)
        `)
        .eq("verification_status", "pending")
        .eq("status", "available")
        .order("created_at", { ascending: true });

      if (error) throw error;
      setTickets((data as unknown as PendingTicket[]) ?? []);
    } catch (err) {
      toast.error("Failed to load pending tickets");
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchPending();
  }, [isAdmin]);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  const handleAction = async (ticketId: string, action: "approve" | "reject") => {
    const reason = rejectReason[ticketId] ?? "";
    if (action === "reject" && !reason.trim()) {
      toast.error("Please enter a rejection reason");
      return;
    }

    setProcessing(ticketId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not authenticated");

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/admin-review-ticket`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
            apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
          },
          body: JSON.stringify({ ticketId, action, reason }),
        }
      );
      const result = await res.json();

      if (!res.ok) throw new Error(result.error ?? "Request failed");

      toast.success(action === "approve" ? "Ticket approved — now live!" : "Ticket rejected");
      setTickets((prev) => prev.filter((t) => t.id !== ticketId));
      setShowRejectForm(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setProcessing(null);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  if (authLoading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <Header />
      <main className="flex-1 py-8">
        <div className="container mx-auto px-4 max-w-4xl">

          {/* Title */}
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-primary" />
              <div>
                <h1 className="text-2xl font-bold">Ticket Review Queue</h1>
                <p className="text-sm text-muted-foreground">
                  {loading ? "Loading…" : `${tickets.length} ticket${tickets.length !== 1 ? "s" : ""} pending review`}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={fetchPending} disabled={loading}>
              <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {/* Queue */}
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : tickets.length === 0 ? (
            <Card>
              <CardContent className="py-16 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto mb-4" />
                <p className="text-lg font-medium">Queue is empty</p>
                <p className="text-sm text-muted-foreground mt-1">All tickets have been reviewed.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {tickets.map((ticket) => (
                <Card key={ticket.id} className="border border-amber-200 bg-amber-50/30 dark:bg-amber-950/10">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <CardTitle className="text-base">
                          {ticket.event?.title ?? "Unknown event"}
                        </CardTitle>
                        <div className="flex flex-wrap gap-3 mt-1 text-sm text-muted-foreground">
                          {ticket.event?.date && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" />
                              {new Date(ticket.event.date).toLocaleDateString("fr-FR", {
                                weekday: "short", day: "numeric", month: "long", year: "numeric",
                              })}
                            </span>
                          )}
                          {ticket.event?.location && (
                            <span className="flex items-center gap-1">
                              <MapPin className="w-3.5 h-3.5" />
                              {ticket.event.location}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <Euro className="w-3.5 h-3.5" />
                            {ticket.selling_price} × {ticket.quantity}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
                        <Badge variant="outline" className="text-amber-700 border-amber-400 bg-amber-50">
                          Pending review
                        </Badge>
                        {ticket.qr_verified && (
                          <Badge variant="secondary" className="text-xs">QR verified</Badge>
                        )}
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="space-y-3">
                    {/* Seller info */}
                    <div className="flex items-start gap-2 p-3 bg-background rounded-lg text-sm">
                      <User className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="font-medium">{ticket.seller?.full_name ?? "Unknown seller"}</p>
                        <p className="text-muted-foreground text-xs">{ticket.seller?.email}</p>
                        {ticket.seller?.campus && (
                          <p className="text-muted-foreground text-xs">Campus {ticket.seller.campus}</p>
                        )}
                      </div>
                    </div>

                    {/* Notes from seller */}
                    {ticket.notes && (
                      <div className="p-3 bg-muted/40 rounded-lg text-sm">
                        <p className="text-xs text-muted-foreground font-medium mb-1 uppercase tracking-wide">
                          Seller notes
                        </p>
                        <p>{ticket.notes}</p>
                      </div>
                    )}

                    {/* Warning if QR not cryptographically verified */}
                    {!ticket.qr_verified && (
                      <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                        <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                        <p>
                          <strong>External ticket</strong> — QR not cryptographically verified.
                          Manually confirm the ticket is valid (check event, date, authenticity)
                          before approving.
                        </p>
                      </div>
                    )}

                    {/* Submitted */}
                    <p className="text-xs text-muted-foreground">
                      Submitted {new Date(ticket.created_at).toLocaleString("fr-FR")}
                    </p>

                    {/* Reject form */}
                    {showRejectForm === ticket.id && (
                      <div className="space-y-2">
                        <Label htmlFor={`reason-${ticket.id}`} className="text-sm">
                          Rejection reason (required)
                        </Label>
                        <Textarea
                          id={`reason-${ticket.id}`}
                          placeholder="e.g. Event date doesn't match, ticket appears invalid, wrong event..."
                          rows={2}
                          value={rejectReason[ticket.id] ?? ""}
                          onChange={(e) => setRejectReason((prev) => ({ ...prev, [ticket.id]: e.target.value }))}
                        />
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        variant="hero"
                        className="flex-1"
                        disabled={processing === ticket.id}
                        onClick={() => handleAction(ticket.id, "approve")}
                      >
                        {processing === ticket.id ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <CheckCircle2 className="w-4 h-4 mr-1.5" />
                            Approve — publish listing
                          </>
                        )}
                      </Button>

                      {showRejectForm === ticket.id ? (
                        <>
                          <Button
                            size="sm"
                            variant="destructive"
                            disabled={processing === ticket.id}
                            onClick={() => handleAction(ticket.id, "reject")}
                          >
                            Confirm reject
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setShowRejectForm(null)}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-destructive border-destructive/40 hover:bg-destructive/5"
                          disabled={processing === ticket.id}
                          onClick={() => setShowRejectForm(ticket.id)}
                        >
                          <XCircle className="w-4 h-4 mr-1.5" />
                          Reject
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default ReviewTickets;
