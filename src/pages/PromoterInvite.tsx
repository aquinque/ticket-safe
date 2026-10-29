import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { CalendarDays, Loader2, MapPin, Megaphone } from "lucide-react";
import { toast } from "sonner";
import Footer from "@/components/Footer";
import HeaderNight from "@/components/HeaderNight";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { useThemeMode } from "@/hooks/useThemeMode";
import {
  claimPromoterLink,
  fetchPromoterInvite,
  forgetPromoterInvite,
  rememberPromoterInvite,
  type PromoterInvite as Invite,
} from "@/lib/promoterLinks";
import { fmtDate } from "@/lib/studioFormat";

/**
 * /p/<token>: the invitation an organizer sends to a promoter. The promoter creates (or signs in to) their Ticket
 * Safe account, accepts, and lands in their personal space (/promoter). The address alone shows no sales.
 * Data: supabase/migrations/20261029140000_promoter_accounts.sql.
 */
const PromoterInvite = () => {
  useThemeMode("night");
  const { token = "" } = useParams();
  const { user, loading: authLoading } = useAuth();
  const [invite, setInvite] = useState<Invite | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [joining, setJoining] = useState(false);
  const [done, setDone] = useState(false);

  // Private page: keep it out of search results.
  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex,nofollow";
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  // Survive sign-up and e-mail confirmation, which may not bring the visitor back to this address.
  useEffect(() => {
    if (token) rememberPromoterInvite(token);
  }, [token]);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    fetchPromoterInvite(token)
      .then((r) => {
        if (cancelled) return;
        setInvite(r);
        setState(r ? "ready" : "missing");
        // Nothing left to accept: don't carry the invitation around.
        if (!r || r.claimed || r.archived) forgetPromoterInvite();
      })
      .catch((err) => {
        console.error("[PromoterInvite] load failed:", err);
        if (!cancelled) setState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [token, authLoading, user?.id]);

  const join = async () => {
    setJoining(true);
    try {
      const result = await claimPromoterLink(token);
      if (result === "claimed" || result === "already") {
        forgetPromoterInvite();
        setDone(true);
      } else if (result === "taken") {
        toast.error("This invitation was already accepted with another account.");
        const fresh = await fetchPromoterInvite(token);
        setInvite(fresh);
      } else {
        toast.error("This invitation is not valid anymore.");
      }
    } catch (err) {
      console.error("[PromoterInvite] claim failed:", err);
      toast.error("Could not accept the invitation. Please try again.");
    } finally {
      setJoining(false);
    }
  };

  if (done || (invite?.mine && state === "ready")) return <Navigate to="/promoter" replace />;

  const next = encodeURIComponent(`/p/${token}`);

  return (
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <SEOHead title="Promoter invitation — Ticket Safe" description="Join as a promoter on Ticket Safe." />
      <HeaderNight />
      <main className="pt-24 pb-16 flex-1">
        <div className="container mx-auto px-4 max-w-lg">
          {(state === "loading" || authLoading) && (
            <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
          )}

          {state === "missing" && !authLoading && (
            <div className="text-center py-16">
              <h1 className="text-xl font-bold">This invitation doesn't exist</h1>
              <p className="text-sm text-muted-foreground mt-2">Check the address the organizer sent you, or ask them for a new one.</p>
            </div>
          )}

          {state === "error" && !authLoading && (
            <div className="text-center py-16">
              <h1 className="text-xl font-bold">Couldn't load the invitation</h1>
              <p className="text-sm text-muted-foreground mt-2">Please reload the page in a moment.</p>
            </div>
          )}

          {state === "ready" && invite && !authLoading && (
            <div className="rounded-2xl bg-card border border-border overflow-hidden">
              {invite.bannerUrl && <img src={invite.bannerUrl} alt="" className="w-full aspect-[16/9] object-cover" />}
              <div className="p-6">
                <p className="text-xs uppercase tracking-wider font-bold text-primary flex items-center gap-1.5">
                  <Megaphone className="w-3.5 h-3.5" />
                  Promoter invitation
                </p>
                <h1 className="font-display text-2xl font-bold mt-2">{invite.eventTitle}</h1>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  {invite.eventDate && (
                    <p className="flex items-center gap-1.5"><CalendarDays className="w-4 h-4" />{fmtDate(invite.eventDate)}</p>
                  )}
                  {invite.eventLocation && (
                    <p className="flex items-center gap-1.5"><MapPin className="w-4 h-4" />{invite.eventLocation}</p>
                  )}
                </div>

                <p className="text-sm mt-5">
                  {invite.organizerName ? <><strong>{invite.organizerName}</strong> invites</> : "You are invited"} {invite.name ? <>you, <strong>{invite.name}</strong>,</> : "you"} to promote this event.
                  With your Ticket Safe account you get your own link to the ticket page and follow your visits and ticket sales in your personal space.
                </p>

                {invite.archived ? (
                  <p className="mt-5 text-sm px-3 py-2 rounded-lg border border-border bg-muted/40">This invitation has been closed by the organizer.</p>
                ) : invite.claimed ? (
                  <div className="mt-5 text-sm px-3 py-2 rounded-lg border border-border bg-muted/40">
                    This invitation was already accepted
                    {user ? " with another account." : ". If it was you, sign in to open your space."}
                    {!user && (
                      <div className="mt-3">
                        <Button asChild className="w-full"><Link to={`/auth?next=${next}`}>Sign in</Link></Button>
                      </div>
                    )}
                  </div>
                ) : user ? (
                  <Button onClick={join} disabled={joining} className="w-full mt-5">
                    {joining && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                    Join as a promoter
                  </Button>
                ) : (
                  <div className="mt-5 space-y-2">
                    <Button asChild className="w-full"><Link to={`/auth?mode=signup&next=${next}`}>Create my account</Link></Button>
                    <Button asChild variant="outline" className="w-full"><Link to={`/auth?next=${next}`}>I already have an account</Link></Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default PromoterInvite;
