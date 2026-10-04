/**
 * Route-level Studio guard — wraps every /studio/* route so none of them
 * can render for a user without an approved organizer_profiles row.
 *
 * Before this, the "pending / rejected / suspended" waiting screen only
 * existed inline in StudioDashboard.tsx (the /studio route) — every other
 * Studio page (StudioEvents, StudioPayouts, StudioTeam had no client-side
 * check at all) rendered its full UI for anyone with a session, relying
 * only on each page's own Supabase queries happening to come back empty
 * under RLS. This component makes the check uniform and impossible to
 * forget on a new page, the same way ProtectedAdminRoute does for /admin.
 *
 * Still defense-in-depth on top of RLS, not a replacement for it — see
 * the "organizer_id ownership" policies on events/event_tiers/event_orders
 * etc., which are what actually stop a pending organizer's API calls from
 * reading or writing anything once they're signed in, regardless of what
 * the UI shows them.
 */
import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, Clock, AlertCircle, Sparkles } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { SEOHead } from "@/components/SEOHead";
import { useEffect } from "react";

const FullScreenSpinner = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

export const StudioAccessGate = ({ children }: { children: ReactNode }) => {
  useThemeMode("studio");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { organizer, loading: orgLoading } = useOrganizer();

  useEffect(() => {
    if (!authLoading && !user) navigate(`/auth?next=${encodeURIComponent(window.location.pathname)}`);
  }, [user, authLoading, navigate]);

  if (authLoading || orgLoading) return <FullScreenSpinner />;
  if (!user) return null;

  if (!organizer) {
    return (
      <div className="theme-studio min-h-screen bg-background flex flex-col">
        <SEOHead title="Studio — Ticket Safe" description="Ticket Safe Studio for student event organizers." />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center bg-card border border-border rounded-lg p-8 shadow-card">
            <div className="w-14 h-14 rounded-lg mx-auto flex items-center justify-center mb-5" style={{ background: "var(--gradient-hero)" }}>
              <Sparkles className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Apply for Studio</h1>
            <p className="text-sm text-muted-foreground mb-6">You need an approved organizer profile to access the Studio dashboard.</p>
            <Link
              to="/organizers/apply"
              className="inline-flex items-center justify-center gap-2 px-5 min-h-[44px] rounded-lg font-bold bg-primary text-primary-foreground hover:bg-primary-hover transition-colors"
            >
              Apply now
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (organizer.status !== "approved") {
    return (
      <div className="theme-studio min-h-screen bg-background flex flex-col">
        <SEOHead title="Studio — Ticket Safe" description="Application status" />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center bg-card border border-border rounded-lg p-8 shadow-card">
            <div className="w-14 h-14 rounded-lg mx-auto flex items-center justify-center mb-5 bg-primary/10">
              {organizer.status === "pending" ? <Clock className="w-7 h-7 text-primary" /> : <AlertCircle className="w-7 h-7 text-destructive" />}
            </div>
            <h1 className="text-2xl font-bold mb-2">
              {organizer.status === "pending" && "Application under review"}
              {organizer.status === "rejected" && "Application not approved"}
              {organizer.status === "suspended" && "Account suspended"}
            </h1>
            <p className="text-sm text-muted-foreground mb-2">
              {organizer.status === "pending" && "We'll get back to you at " + organizer.contact_email + " within 24 hours."}
              {organizer.status === "rejected" && (organizer.rejection_reason || "Please contact support for more details.")}
              {organizer.status === "suspended" && "Please contact support to resolve this issue."}
            </p>
            <Link to="/contact" className="text-sm font-semibold text-primary hover:underline">
              Contact support
            </Link>
          </div>
        </main>
      </div>
    );
  }

  return <>{children}</>;
};
