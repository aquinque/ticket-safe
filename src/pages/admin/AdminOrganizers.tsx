import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Mail,
  ExternalLink,
  Building2,
  AlertCircle,
} from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface OrgApp {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  org_type: string;
  contact_name: string;
  contact_email: string;
  website: string | null;
  about: string | null;
  primary_color: string;
  status: "pending" | "approved" | "rejected" | "suspended";
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
}

const AdminOrganizers = () => {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [apps, setApps] = useState<OrgApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth");
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    })();
  }, [user]);

  const load = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    let q = supabase.from("organizer_profiles").select("*").order("created_at", { ascending: false });
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setApps((data as OrgApp[]) ?? []);
    setLoading(false);
  }, [filter, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (id: string) => {
    setActing(id);
    const { error } = await supabase
      .from("organizer_profiles")
      .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: user!.id })
      .eq("id", id);
    setActing(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Organizer approved");
      load();
    }
  };

  const reject = async (id: string) => {
    const reason = prompt("Reason for rejection (will be shown to the applicant):");
    if (!reason) return;
    setActing(id);
    const { error } = await supabase
      .from("organizer_profiles")
      .update({ status: "rejected", rejection_reason: reason })
      .eq("id", id);
    setActing(null);
    if (error) toast.error(error.message);
    else {
      toast.success("Application rejected");
      load();
    }
  };

  if (authLoading || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <Header />
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="text-center max-w-md">
            <div className="mx-auto mb-3 w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center">
              <AlertCircle className="w-6 h-6 text-destructive" />
            </div>
            <h1 className="text-xl font-bold mb-2">Admins only</h1>
            <p className="text-sm text-muted-foreground">
              You do not have permission to access this page.
            </p>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead title="Admin — Organizers" description="Organizer applications review queue" />
      <Header />

      <main className="flex-1 py-6 md:py-10">
        <div className="container mx-auto px-4 max-w-5xl">
          <h1 className="text-2xl md:text-3xl font-black mb-5 flex items-center gap-2">
            <Building2 className="w-7 h-7 text-primary" />
            Organizer applications
          </h1>

          {/* Filter tabs */}
          <div className="flex gap-1.5 mb-5 overflow-x-auto -mx-1 px-1">
            {(["pending", "approved", "rejected", "all"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`shrink-0 px-4 min-h-[36px] rounded-full text-sm font-semibold transition-colors ${
                  filter === f
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-7 h-7 animate-spin text-primary" />
            </div>
          ) : apps.length === 0 ? (
            <div className="text-center py-12 bg-card border border-dashed border-border rounded-2xl">
              <p className="text-sm text-muted-foreground">No applications in this state.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {apps.map((a) => (
                <div key={a.id} className="bg-card border border-border rounded-2xl p-5">
                  <div className="flex flex-col md:flex-row md:items-start gap-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center text-white font-black shrink-0"
                      style={{ background: a.primary_color || "#003399" }}
                    >
                      {a.name[0]?.toUpperCase() ?? "?"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="font-bold text-lg">{a.name}</h3>
                        <StatusPill status={a.status} />
                      </div>
                      <div className="text-xs text-muted-foreground mb-2">
                        Slug: <code className="font-mono">{a.slug}</code> · Type: {a.org_type}
                      </div>
                      <div className="text-sm space-y-1">
                        <div className="flex items-center gap-1.5 text-foreground/90">
                          <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                          {a.contact_name} — <a href={`mailto:${a.contact_email}`} className="text-primary hover:underline">{a.contact_email}</a>
                        </div>
                        {a.website && (
                          <div className="flex items-center gap-1.5 text-foreground/80">
                            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                            <a href={a.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline truncate">
                              {a.website}
                            </a>
                          </div>
                        )}
                      </div>
                      {a.about && (
                        <p className="text-sm text-muted-foreground mt-3 line-clamp-3">{a.about}</p>
                      )}
                      {a.rejection_reason && (
                        <p className="text-xs text-destructive mt-2">
                          Rejected: {a.rejection_reason}
                        </p>
                      )}
                      <p className="text-[11px] text-muted-foreground mt-2">
                        Submitted {new Date(a.created_at).toLocaleString("en-GB")}
                      </p>
                    </div>
                    {a.status === "pending" && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => approve(a.id)}
                          disabled={acting === a.id}
                          className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
                        >
                          {acting === a.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          )}
                          Approve
                        </button>
                        <button
                          onClick={() => reject(a.id)}
                          disabled={acting === a.id}
                          className="inline-flex items-center gap-1.5 px-4 min-h-[40px] rounded-lg font-bold text-sm border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-60"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

const StatusPill = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    pending: "bg-amber-100 text-amber-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    suspended: "bg-muted text-muted-foreground",
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
};

export default AdminOrganizers;
