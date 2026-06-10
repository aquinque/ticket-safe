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
  Calendar,
  Users,
  Palette,
  Tag,
  Globe,
  User,
  Clock,
} from "lucide-react";
import Header from "@/components/Header";
import { BackButton } from "@/components/BackButton";
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
  first_event_name: string | null;
  first_event_date: string | null;
  expected_attendees: number | null;
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
    if (!authLoading && !user) navigate("/auth?next=/admin/organizers");
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
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Organizer approved");
    // Notify the organizer by email (best-effort)
    supabase.functions
      .invoke("organizer-notify", { body: { kind: "approved", organizer_id: id } })
      .catch((err) => console.warn("[admin-organizers] notify failed:", err));
    load();
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
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Application rejected");
    supabase.functions
      .invoke("organizer-notify", { body: { kind: "rejected", organizer_id: id, reason } })
      .catch((err) => console.warn("[admin-organizers] notify failed:", err));
    load();
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
          <div className="mb-4">
            <BackButton />
          </div>
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
            <div className="space-y-4">
              {apps.map((a) => (
                <ApplicationCard
                  key={a.id}
                  app={a}
                  acting={acting === a.id}
                  onApprove={() => approve(a.id)}
                  onReject={() => reject(a.id)}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

const ApplicationCard = ({
  app,
  acting,
  onApprove,
  onReject,
}: {
  app: OrgApp;
  acting: boolean;
  onApprove: () => void;
  onReject: () => void;
}) => {
  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }) : "—";

  const orgTypeLabel = (t: string) => {
    switch (t) {
      case "bde": return "BDE / Student union";
      case "sports": return "Sports club";
      case "alumni": return "Alumni association";
      case "conference": return "Conference / Academic";
      case "student-society": return "Student society";
      default: return "Other";
    }
  };

  return (
    <article className="bg-card border border-border rounded-2xl overflow-hidden">
      {/* Header strip in organizer brand color */}
      <div
        className="px-5 py-4 flex items-center justify-between gap-3 text-white"
        style={{ background: `linear-gradient(135deg, ${app.primary_color || "#003399"}, hsl(210 100% 45%))` }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-11 h-11 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center font-black text-lg shrink-0">
            {app.name[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <div className="font-bold text-base md:text-lg leading-tight truncate">{app.name}</div>
            <div className="text-[11px] uppercase tracking-[0.16em] font-bold opacity-80 mt-0.5">
              {orgTypeLabel(app.org_type)}
            </div>
          </div>
        </div>
        <StatusPill status={app.status} />
      </div>

      {/* Body */}
      <div className="p-5 md:p-6">
        {/* Two-column key info grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 mb-5">
          <FieldRow icon={User} label="Contact name" value={app.contact_name} />
          <FieldRow
            icon={Mail}
            label="Contact email"
            value={
              <a href={`mailto:${app.contact_email}`} className="text-primary hover:underline break-all">
                {app.contact_email}
              </a>
            }
          />
          <FieldRow icon={Tag} label="Public slug" value={<code className="font-mono text-xs bg-muted px-1.5 py-0.5 rounded">{app.slug}</code>} />
          <FieldRow
            icon={Globe}
            label="Website"
            value={
              app.website ? (
                <a href={app.website} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">
                  {app.website}
                </a>
              ) : (
                <span className="text-muted-foreground">—</span>
              )
            }
          />
          <FieldRow icon={Palette} label="Brand color" value={
            <span className="inline-flex items-center gap-2">
              <span
                className="w-4 h-4 rounded border border-border"
                style={{ background: app.primary_color }}
              />
              <code className="font-mono text-xs">{app.primary_color}</code>
            </span>
          } />
          <FieldRow icon={Clock} label="Submitted" value={fmt(app.created_at)} />
        </div>

        {/* First event block — only if any info was provided */}
        {(app.first_event_name || app.first_event_date || app.expected_attendees) && (
          <div className="rounded-xl bg-muted/40 border border-border px-4 py-4 mb-5">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-3">
              First planned event
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <FieldRow icon={Calendar} label="Event name" value={app.first_event_name || "—"} compact />
              <FieldRow icon={Calendar} label="Date" value={app.first_event_date ? fmt(app.first_event_date) : "—"} compact />
              <FieldRow icon={Users} label="Expected attendees" value={app.expected_attendees ? app.expected_attendees.toLocaleString("en-GB") : "—"} compact />
            </div>
          </div>
        )}

        {/* About / pitch */}
        {app.about && (
          <div className="mb-5">
            <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-2">
              About / pitch
            </div>
            <p className="text-sm text-foreground/90 whitespace-pre-line leading-relaxed">{app.about}</p>
          </div>
        )}

        {/* Rejection reason — shown only on rejected status */}
        {app.status === "rejected" && app.rejection_reason && (
          <div className="rounded-xl bg-destructive/10 border border-destructive/30 px-4 py-3 mb-4 text-sm text-destructive">
            <strong>Rejection reason:</strong> {app.rejection_reason}
          </div>
        )}

        {/* Actions */}
        {app.status === "pending" && (
          <div className="flex flex-col sm:flex-row gap-2 pt-2 border-t border-border">
            <button
              onClick={onApprove}
              disabled={acting}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg font-bold text-sm bg-green-600 text-white hover:bg-green-700 disabled:opacity-60"
            >
              {acting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Approve application
            </button>
            <button
              onClick={onReject}
              disabled={acting}
              className="inline-flex items-center justify-center gap-1.5 px-4 min-h-[44px] rounded-lg font-bold text-sm border border-destructive text-destructive hover:bg-destructive/10 disabled:opacity-60"
            >
              <XCircle className="w-4 h-4" />
              Reject
            </button>
          </div>
        )}
      </div>
    </article>
  );
};

const FieldRow = ({
  icon: Icon,
  label,
  value,
  compact,
}: {
  icon: typeof Mail;
  label: string;
  value: React.ReactNode;
  compact?: boolean;
}) => (
  <div className={compact ? "" : ""}>
    <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-muted-foreground mb-1 inline-flex items-center gap-1">
      <Icon className="w-3 h-3" />
      {label}
    </div>
    <div className="text-sm text-foreground/90 break-words">{value}</div>
  </div>
);

const StatusPill = ({ status }: { status: string }) => {
  const map: Record<string, string> = {
    pending: "bg-amber-200/30 text-amber-50 border-amber-200/40",
    approved: "bg-green-200/30 text-green-50 border-green-200/40",
    rejected: "bg-red-200/30 text-red-50 border-red-200/40",
    suspended: "bg-white/15 text-white/80 border-white/30",
  };
  return (
    <span className={`shrink-0 inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border backdrop-blur ${map[status] ?? "bg-white/15 text-white/80 border-white/30"}`}>
      {status}
    </span>
  );
};

export default AdminOrganizers;
