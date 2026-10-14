import { useState, useEffect } from "react";
import { BackButton } from "@/components/BackButton";
import { useNavigate } from "react-router-dom";
import HeaderNight from "@/components/HeaderNight";
import { useThemeMode } from "@/hooks/useThemeMode";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "@/hooks/use-toast";
import { SEOHead } from "@/components/SEOHead";
import { RESALE_ENABLED } from "@/lib/featureFlags";
import { GENDER_CHOICES, PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, genderToStore, passwordError, type GenderChoice } from "@/lib/authRules";
import {
  User,
  Mail,
  Lock,
  Save,
  AlertCircle,
  ShieldCheck,
  Building2,
  MapPin,
  Ticket,
  Tag,
  ArrowRight,
  Banknote,
  ShoppingBag,
  ArrowDownLeft,
  ArrowUpRight,
  QrCode,
  MessageCircle,
  Settings as SettingsIcon,
  ShieldCheck as PrivacyIcon,
  ChevronDown,
  Check,
  Sparkles,
  Clock,
} from "lucide-react";
import { useCountUp } from "@/hooks/useCountUp";

/** The colours a member can pick for their page. Index 0 is the brand blue. */
const ACCENTS = [
  { name: "Blue", hex: "#3A5FE6" },
  { name: "Violet", hex: "#8B5CF6" },
  { name: "Pink", hex: "#EC4899" },
  { name: "Coral", hex: "#F43F5E" },
  { name: "Orange", hex: "#F97316" },
  { name: "Gold", hex: "#F59E0B" },
  { name: "Mint", hex: "#10B981" },
  { name: "Sky", hex: "#06B6D4" },
] as const;

/** A stable default colour per account, so two friends don't get the same page. */
const defaultAccentFor = (id: string) => ACCENTS[[...id].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % ACCENTS.length].hex;

/** "In 27 days", "Tonight", "Tomorrow", "Today" for the next ticket. */
function soonLabel(iso: string, fr: boolean): string {
  const start = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const day = new Date(start); day.setHours(0, 0, 0, 0);
  const days = Math.round((day.getTime() - today.getTime()) / 86_400_000);
  if (days <= 0) return start.getHours() >= 17 ? (fr ? "Ce soir" : "Tonight") : (fr ? "Aujourd'hui" : "Today");
  if (days === 1) return fr ? "Demain" : "Tomorrow";
  return fr ? `Dans ${days} jours` : `In ${days} days`;
}

const Figure = ({ label, value, money, accent, locale }: { label: string; value: number; money?: boolean; accent?: string; locale: string }) => {
  const shown = useCountUp(Math.round(money ? value * 100 : value));
  const text = money
    ? new Intl.NumberFormat(locale, { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(shown / 100)
    : shown.toLocaleString(locale);
  return (
    <div className="min-w-0">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground truncate">{label}</p>
      <p className="text-2xl md:text-3xl font-bold tabular-nums leading-tight mt-0.5" style={accent ? { color: accent } : undefined}>{text}</p>
    </div>
  );
};

/** A ticket the user holds for an event that has not happened yet. */
interface UpcomingTicket {
  id: string;
  orderId: string;
  eventTitle: string;
  eventDate: string | null;
  location: string | null;
  tierName: string | null;
  holderName: string | null;
  eventColor: string | null;
}

/** Tickets stay "upcoming" until 12 hours after the event starts, so a night event is still there after midnight. */
const UPCOMING_GRACE_MS = 12 * 60 * 60 * 1000;

interface Purchase {
  id: string;
  /** Set for primary purchases: opens the tickets and their QR codes. */
  orderId?: string;
  eventTitle: string;
  date: string;
  price: number;
  quantity: number;
  status: string;
  soldAt: string | null;
}

interface Sale {
  id: string;
  eventTitle: string;
  date: string;
  salePrice: number;
  status: string;
  soldAt: string | null;
}

/** One unified transaction row, in or out. */
interface TxRow {
  id: string;
  kind: "purchase" | "sale";
  title: string;
  date: string; // ISO — when it happened (for sorting)
  amount: number; // euros
  status: string;
  orderId?: string;
}

/** Campuses where the school operates — used in the profile + at signup. */
const CAMPUSES = ["Paris", "London", "Madrid", "Berlin", "Turin"] as const;

const Profile = () => {
  useThemeMode("night");
  const [userData, setUserData] = useState({ name: "", email: "", school: "", campus: "" });
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [upcomingTickets, setUpcomingTickets] = useState<UpcomingTicket[]>([]);
  const [editFirstName, setEditFirstName] = useState("");
  const [editLastName, setEditLastName] = useState("");
  const [editGender, setEditGender] = useState<GenderChoice>("");
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [savingCampus, setSavingCampus] = useState(false);
  const [memberSince, setMemberSince] = useState<string | null>(null);
  const [accent, setAccent] = useState<string>(ACCENTS[0].hex);
  const [savingAccent, setSavingAccent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { language, t } = useI18n();
  const dateLocale = language === "fr" ? "fr-FR" : "en-US";
  const fr = language === "fr";

  // Redirect to auth if not logged in
  useEffect(() => {
    if (!authLoading && !user) {
      navigate("/auth", { replace: true });
    }
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    const saved = user.user_metadata?.accent as string | undefined;
    setAccent(saved && ACCENTS.some((a) => a.hex === saved) ? saved : defaultAccentFor(user.id));
  }, [user]);

  useEffect(() => {
    if (authLoading || !user) return;
    let mounted = true;

    const fetchUserData = async () => {
      try {
        setLoading(true);

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .maybeSingle();

        if (profileError && profileError.code !== "PGRST116") {
          console.error("Error fetching profile:", profileError);
        }

        if (!profile) {
          if (mounted) {
            setUserData({
              name: user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
              email: user.email || "",
              school: (user.user_metadata?.university as string) || "",
              campus: (user.user_metadata?.campus as string) || "",
            });
            setPurchases([]);
            setSales([]);
            setUpcomingTickets([]);
            setLoading(false);
          }
          return;
        }

        // Resale purchases (transactions) + primary purchases (event_orders).
        const { data: purchaseData } = await supabase
          .from("transactions")
          .select(`*, ticket:tickets(event:events(title, date))`)
          .eq("buyer_id", user.id)
          .order("created_at", { ascending: false });

        const { data: orderData } = await supabase
          .from("event_orders")
          .select(`id, quantity, unit_price_cents, total_cents, status, paid_at, created_at, event:events(title, date)`)
          .eq("buyer_id", user.id)
          .eq("status", "paid")
          .order("paid_at", { ascending: false });

        // The user's own resale listings are only read when resale is switched on.
        const { data: saleData } = RESALE_ENABLED
          ? await supabase
              .from("tickets")
              .select(`*, event:events(title, date)`)
              .eq("seller_id", user.id)
              .order("created_at", { ascending: false })
          : { data: [] };

        // Tickets the user holds. Purchases made without an account are owned by
        // the same account (created at checkout for that email), so they are here too.
        const { data: ticketData } = await supabase
          .from("event_tickets")
          .select(
            `id, order_id, status, holder_first_name, holder_last_name,
             event:events(title, date, location, primary_color),
             tier:event_tiers(name)`,
          )
          .eq("buyer_id", user.id)
          .eq("status", "valid");

        if (!mounted) return;

        setUserData({
          name: profile.full_name || user.email?.split("@")[0] || "User",
          email: profile.email || user.email || "",
          school: profile.university || "",
          campus: profile.campus || "",
        });
        setMemberSince((profile as { created_at?: string | null }).created_at ?? null);

        // Accounts created at checkout only have a full name: split it for the form.
        const nameParts = (profile.full_name || "").trim().split(/\s+/).filter(Boolean);
        setEditFirstName(profile.first_name || nameParts[0] || "");
        setEditLastName(profile.last_name || nameParts.slice(1).join(" ") || "");
        setEditGender(profile.gender === "female" || profile.gender === "male" ? profile.gender : "");

        const cutoff = Date.now() - UPCOMING_GRACE_MS;
        const one = <T,>(value: T | T[] | null | undefined): T | null =>
          Array.isArray(value) ? value[0] ?? null : value ?? null;
        setUpcomingTickets(
          (ticketData ?? [])
            .map((row) => {
              const event = one(row.event as { title: string | null; date: string | null; location: string | null; primary_color: string | null } | null);
              const tier = one(row.tier as { name: string | null } | null);
              return {
                id: row.id,
                orderId: row.order_id,
                eventTitle: event?.title || "Événement",
                eventDate: event?.date ?? null,
                location: event?.location ?? null,
                tierName: tier?.name ?? null,
                holderName: [row.holder_first_name, row.holder_last_name].filter(Boolean).join(" ") || null,
                eventColor: event?.primary_color && /^#[0-9a-fA-F]{6}$/.test(event.primary_color) ? event.primary_color : null,
              };
            })
            .filter((tk) => !tk.eventDate || new Date(tk.eventDate).getTime() >= cutoff)
            .sort((a, b) => new Date(a.eventDate ?? 0).getTime() - new Date(b.eventDate ?? 0).getTime()),
        );

        const resalePurchases: Purchase[] = (purchaseData ?? []).map((p) => ({
          id: p.id,
          eventTitle: p.ticket?.event?.title || "Unknown Event",
          date: p.ticket?.event?.date || p.created_at,
          price: p.amount,
          quantity: p.quantity ?? 1,
          status: p.status === "completed" ? "confirmed" : p.status,
          soldAt: p.created_at,
        }));

        const primaryPurchases: Purchase[] = (orderData ?? []).map((o) => ({
          id: `order-${o.id}`,
          orderId: o.id,
          eventTitle: o.event?.title || "Unknown Event",
          date: o.event?.date || o.paid_at || o.created_at,
          price: (o.total_cents ?? (o.unit_price_cents ?? 0) * (o.quantity ?? 1)) / 100,
          quantity: o.quantity ?? 1,
          status: "confirmed",
          soldAt: o.paid_at || o.created_at,
        }));

        setPurchases([...primaryPurchases, ...resalePurchases]);

        setSales(
          (saleData ?? []).map((s) => ({
            id: s.id,
            eventTitle: s.event?.title || "Unknown Event",
            date: s.event?.date || s.created_at,
            salePrice: s.selling_price,
            status: s.status,
            soldAt: s.status === "sold" ? s.updated_at ?? null : null,
          })),
        );
      } catch (error) {
        console.error("Error fetching user data:", error);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchUserData();
    return () => {
      mounted = false;
    };
  }, [user, authLoading]);

  const handleSavePassword = async () => {
    if (passwordError(newPassword)) {
      toast({
        title: fr ? "Mot de passe refusé" : "Password not accepted",
        description: fr
          ? `Entre ${PASSWORD_MIN_LENGTH} et ${PASSWORD_MAX_LENGTH} caractères.`
          : `Between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH} characters.`,
        variant: "destructive",
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({
        title: fr ? "Les mots de passe ne correspondent pas" : "Passwords do not match",
        description: fr ? "Vérifiez la confirmation." : "Check the confirmation field.",
        variant: "destructive",
      });
      return;
    }
    try {
      setSavingPassword(true);
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setNewPassword("");
      setConfirmPassword("");
      toast({
        title: fr ? "Mot de passe mis à jour" : "Password updated",
        description: fr ? "Votre mot de passe a été changé." : "Your password has been changed.",
      });
    } catch (error) {
      toast({
        title: t("toast.error"),
        description: fr ? "Impossible de changer le mot de passe. Réessayez." : error instanceof Error ? error.message : "Failed to update password",
        variant: "destructive",
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleSaveIdentity = async () => {
    if (!user) return;
    const first = editFirstName.trim();
    const last = editLastName.trim();
    if (!first || !last) {
      toast({
        title: fr ? "Prénom et nom requis" : "First and last name required",
        description: fr ? "Indiquez votre prénom et votre nom." : "Enter your first and last name.",
        variant: "destructive",
      });
      return;
    }
    const fullName = `${first} ${last}`;
    try {
      setSavingIdentity(true);
      const { error } = await supabase
        .from("profiles")
        .update({ first_name: first, last_name: last, full_name: fullName, gender: genderToStore(editGender) })
        .eq("id", user.id);
      if (error) throw error;
      // Keep the account's own copy in step (used to greet the user in emails). Best effort.
      await supabase.auth
        .updateUser({ data: { first_name: first, last_name: last, full_name: fullName } })
        .catch(() => undefined);
      setUserData((d) => ({ ...d, name: fullName }));
      toast({
        title: fr ? "Informations enregistrées" : "Details saved",
        description: fullName,
      });
    } catch (error) {
      console.error("[profile] save identity failed:", error);
      toast({
        title: t("toast.error"),
        description: fr ? "Impossible d'enregistrer. Réessayez." : "Could not save. Please try again.",
        variant: "destructive",
      });
    } finally {
      setSavingIdentity(false);
    }
  };

  const handleSaveAccent = async (hex: string) => {
    if (!user || hex === accent) return;
    const previous = accent;
    setAccent(hex);
    try {
      setSavingAccent(true);
      const { error } = await supabase.auth.updateUser({ data: { accent: hex } });
      if (error) throw error;
    } catch {
      setAccent(previous);
      toast({ title: t("toast.error"), description: fr ? "Couleur non enregistrée." : "Colour not saved.", variant: "destructive" });
    } finally {
      setSavingAccent(false);
    }
  };

  const handleSaveCampus = async (campus: string) => {
    if (!user || campus === userData.campus) return;
    const previous = userData.campus;
    setUserData((d) => ({ ...d, campus }));
    try {
      setSavingCampus(true);
      const { error } = await supabase.from("profiles").update({ campus }).eq("id", user.id);
      if (error) throw error;
      toast({
        title: fr ? "Campus mis à jour" : "Campus updated",
        description: campus,
      });
    } catch (error) {
      setUserData((d) => ({ ...d, campus: previous }));
      toast({
        title: t("toast.error"),
        description: error instanceof Error ? error.message : "Failed to update campus",
        variant: "destructive",
      });
    } finally {
      setSavingCampus(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="theme-night min-h-screen bg-background flex flex-col">
        <HeaderNight />
        <main className="pt-20 pb-16 md:pt-24 flex-1">
          <div className="container mx-auto px-4 max-w-3xl space-y-4">
            <div className="h-44 rounded-3xl bg-card animate-pulse" />
            <div className="h-40 rounded-2xl bg-card animate-pulse" />
            <div className="grid grid-cols-2 gap-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 rounded-2xl bg-card animate-pulse" />)}</div>
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  if (!user) return null;

  const initials =
    (userData.name || "")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((n) => n[0]?.toUpperCase())
      .join("") || "?";
  const firstName = userData.name.split(" ")[0] || "";

  // ── Unified transaction feed (purchases + sales), newest first ──────────────
  const txRows: TxRow[] = [
    ...purchases.map<TxRow>((p) => ({
      id: `p-${p.id}`,
      kind: "purchase",
      title: p.eventTitle,
      date: p.soldAt || p.date,
      amount: p.price,
      status: p.status,
      orderId: p.orderId,
    })),
    ...(RESALE_ENABLED ? sales : [])
      .filter((s) => s.status === "sold")
      .map<TxRow>((s) => ({
        id: `s-${s.id}`,
        kind: "sale",
        title: s.eventTitle,
        date: s.soldAt || s.date,
        amount: s.salePrice,
        status: s.status,
      })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const totalSpent = purchases.reduce((sum, p) => sum + (p.price || 0), 0);
  const totalSold = sales.filter((s) => s.status === "sold").length;
  const activeListings = sales.filter((s) => s.status === "available").length;
  const eventsCount = new Set(purchases.map((p) => p.eventTitle)).size;
  const nextTicket = upcomingTickets[0] ?? null;
  const otherTickets = upcomingTickets.slice(1);

  const formatEuros = (n: number) =>
    new Intl.NumberFormat(dateLocale, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });
  const formatDay = (s: string) =>
    new Date(s).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" });
  const formatTime = (s: string) => new Date(s).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit" });

  const accentIndex = Math.max(0, ACCENTS.findIndex((a) => a.hex === accent));
  const accent2 = ACCENTS[(accentIndex + 1) % ACCENTS.length].hex;
  const cover = `linear-gradient(120deg, ${accent} 0%, ${accent2} 100%)`;

  // The things people come here to do, each with its own colour.
  const tiles = [
    { to: "/my-tickets", icon: Ticket, label: t("profile.myTickets"), hint: fr ? `${upcomingTickets.length} à venir` : `${upcomingTickets.length} upcoming`, color: accent },
    { to: "/tickets", icon: Sparkles, label: fr ? "Événements" : "Browse events", hint: fr ? "Trouver une soirée" : "Find a night out", color: "#F97316" },
    { to: "/settings/purchases", icon: Banknote, label: fr ? "Mes achats" : "Purchases", hint: totalSpent > 0 ? formatEuros(totalSpent) : fr ? "Rien encore" : "Nothing yet", color: "#10B981" },
    ...(RESALE_ENABLED ? [{ to: "/settings/listings", icon: Tag, label: fr ? "Portefeuille" : "Wallet", hint: activeListings > 0 ? (fr ? `${activeListings} annonce${activeListings > 1 ? "s" : ""}` : `${activeListings} listed`) : fr ? "Revendre" : "Resell a ticket", color: "#F59E0B" }] : []),
    { to: "/messages", icon: MessageCircle, label: "Messages", hint: fr ? "Vos conversations" : "Your conversations", color: "#06B6D4" },
    { to: "/settings/privacy", icon: PrivacyIcon, label: fr ? "Données" : "Privacy & data", hint: fr ? "Exporter, supprimer" : "Export, delete", color: "#8B5CF6" },
    { to: "/settings/interface", icon: SettingsIcon, label: fr ? "Interface" : "Interface", hint: fr ? "Thème, affichage" : "Theme, display", color: "#EC4899" },
  ];

  return (
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.profile" descriptionKey="settings.description" />
      <HeaderNight />
      <main className="flex-1 pt-20 pb-16 md:pt-24">
        <div className="container mx-auto px-4 max-w-3xl space-y-5">
          {/* ===== Cover: your colour, your name ===== */}
          <section className="relative overflow-hidden rounded-3xl motion-safe:animate-fade-in" style={{ background: cover }} aria-label={fr ? "Mon profil" : "My profile"}>
            <div className="absolute -top-16 -right-10 w-64 h-64 rounded-full bg-white/15 blur-3xl pointer-events-none" aria-hidden />
            <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/35 to-transparent pointer-events-none" aria-hidden />
            <div className="relative p-5 md:p-7">
              <div className="flex items-start justify-between gap-3">
                <BackButton />
                <div className="flex items-center gap-1.5 bg-black/25 backdrop-blur rounded-full p-1" role="radiogroup" aria-label={fr ? "Couleur de ma page" : "My page colour"}>
                  {ACCENTS.map((a) => (
                    <button
                      key={a.hex}
                      type="button"
                      role="radio"
                      aria-checked={a.hex === accent}
                      aria-label={a.name}
                      title={a.name}
                      disabled={savingAccent}
                      onClick={() => handleSaveAccent(a.hex)}
                      className={`w-5 h-5 rounded-full border-2 transition-transform ${a.hex === accent ? "border-white scale-110" : "border-white/30 hover:scale-110"}`}
                      style={{ background: a.hex }}
                    />
                  ))}
                </div>
              </div>
              <div className="mt-8 md:mt-10 flex items-end gap-4">
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-full bg-white text-3xl md:text-4xl font-bold flex items-center justify-center shrink-0 shadow-lg ring-4 ring-white/30" style={{ color: accent }} aria-hidden>
                  {initials}
                </div>
                <div className="min-w-0 pb-1 text-white">
                  <h1 className="text-3xl md:text-4xl font-bold leading-tight truncate drop-shadow">{firstName || userData.name}</h1>
                  <p className="text-sm text-white/85 truncate">{userData.name}{userData.email ? ` · ${userData.email}` : ""}</p>
                  <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {[userData.school, userData.campus].filter(Boolean).map((x) => (
                      <span key={x} className="inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur px-2.5 py-1 text-xs font-semibold text-white">
                        {x === userData.campus ? <MapPin className="w-3 h-3" /> : <Building2 className="w-3 h-3" />}{x}
                      </span>
                    ))}
                    {memberSince && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur px-2.5 py-1 text-xs font-semibold text-white">
                        <Sparkles className="w-3 h-3" />
                        {fr ? "Membre depuis " : "Member since "}{new Date(memberSince).toLocaleDateString(dateLocale, { month: "short", year: "numeric" })}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ===== Next night out ===== */}
          <section className="motion-safe:animate-fade-in" style={{ animationDelay: "60ms", animationFillMode: "both" }} aria-labelledby="next-heading">
            {nextTicket ? (
              <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
                <div className="absolute inset-y-0 left-0 w-1.5" style={{ background: nextTicket.eventColor ?? accent }} aria-hidden />
                <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full blur-3xl opacity-30 pointer-events-none" style={{ background: nextTicket.eventColor ?? accent }} aria-hidden />
                <div className="relative p-5 pl-6">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <h2 id="next-heading" className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{fr ? "Prochaine sortie" : "Next night out"}</h2>
                    {nextTicket.eventDate && (
                      <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold text-white" style={{ background: nextTicket.eventColor ?? accent }}>
                        <Clock className="w-3 h-3" />{soonLabel(nextTicket.eventDate, fr)}
                      </span>
                    )}
                  </div>
                  <p className="text-2xl md:text-3xl font-bold leading-tight text-foreground text-balance">{nextTicket.eventTitle}</p>
                  <p className="text-sm text-muted-foreground mt-1.5">
                    {nextTicket.eventDate ? `${formatDay(nextTicket.eventDate)} · ${formatTime(nextTicket.eventDate)}` : fr ? "Date à venir" : "Date to come"}
                    {nextTicket.location ? ` · ${nextTicket.location}` : ""}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">{[nextTicket.tierName, nextTicket.holderName].filter(Boolean).join(" · ")}</p>
                  <div className="flex flex-wrap gap-2 mt-4">
                    <Button onClick={() => navigate(`/my-tickets/${nextTicket.orderId}`)} className="gap-1.5 rounded-full px-5">
                      <QrCode className="w-4 h-4" />{fr ? "Afficher le QR" : "Show my QR"}
                    </Button>
                    {RESALE_ENABLED && (
                      <Button variant="outline" onClick={() => navigate("/marketplace/sell")} className="gap-1.5 rounded-full">
                        <Tag className="w-4 h-4" />{fr ? "Revendre" : "Resell"}
                      </Button>
                    )}
                  </div>
                  {otherTickets.length > 0 && (
                    <ul className="mt-4 pt-4 border-t border-border divide-y divide-border">
                      {otherTickets.map((tk) => (
                        <li key={tk.id} className="flex items-center gap-3 py-2.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tk.eventColor ?? accent }} aria-hidden />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{tk.eventTitle}</p>
                            <p className="text-xs text-muted-foreground truncate">{tk.eventDate ? formatDay(tk.eventDate) : ""}{tk.tierName ? ` · ${tk.tierName}` : ""}{tk.holderName ? ` · ${tk.holderName}` : ""}</p>
                          </div>
                          <button type="button" onClick={() => navigate(`/my-tickets/${tk.orderId}`)} className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline shrink-0">
                            <QrCode className="w-3.5 h-3.5" /> QR
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border bg-card/60 p-5 flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 text-white" style={{ background: cover }}><Sparkles className="w-6 h-6" /></div>
                <div className="flex-1 min-w-0">
                  <h2 id="next-heading" className="text-base font-bold">{fr ? "Rien de prévu pour l'instant" : "Nothing planned yet"}</h2>
                  <p className="text-sm text-muted-foreground">{fr ? "Vos prochains billets apparaîtront ici, prêts à être scannés." : "Your next tickets will sit here, ready to scan at the door."}</p>
                </div>
                <Button variant="hero" onClick={() => navigate("/tickets")} className="gap-1.5 rounded-full shrink-0">
                  <ShoppingBag className="w-4 h-4" />{t("profile.browseEvents")}
                </Button>
              </div>
            )}
          </section>

          {/* ===== Numbers ===== */}
          <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 motion-safe:animate-fade-in" style={{ animationDelay: "120ms", animationFillMode: "both" }} aria-label={fr ? "Mes chiffres" : "My numbers"}>
            <div className="rounded-2xl border border-border bg-card p-4"><Figure label={fr ? "Billets à venir" : "Upcoming"} value={upcomingTickets.length} accent={accent} locale={dateLocale} /></div>
            <div className="rounded-2xl border border-border bg-card p-4"><Figure label={fr ? "Événements" : "Events"} value={eventsCount} locale={dateLocale} /></div>
            <div className="rounded-2xl border border-border bg-card p-4"><Figure label={fr ? "Dépensé" : "Spent"} value={totalSpent} money locale={dateLocale} /></div>
            {RESALE_ENABLED ? (
              <div className="rounded-2xl border border-border bg-card p-4"><Figure label={fr ? "Vendus" : "Sold"} value={totalSold} accent="#10B981" locale={dateLocale} /></div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-4"><Figure label={fr ? "Achats" : "Purchases"} value={purchases.length} locale={dateLocale} /></div>
            )}
          </section>

          {/* ===== Tiles ===== */}
          <section className="grid grid-cols-2 sm:grid-cols-3 gap-3" aria-label={fr ? "Raccourcis" : "Shortcuts"}>
            {tiles.map((tile, i) => {
              const Icon = tile.icon;
              return (
                <button
                  key={tile.to}
                  type="button"
                  onClick={() => navigate(tile.to)}
                  className="group text-left rounded-2xl border border-border bg-card p-4 min-h-[96px] transition-all hover:-translate-y-0.5 hover:shadow-lg motion-safe:animate-fade-in"
                  style={{ animationDelay: `${160 + i * 40}ms`, animationFillMode: "both" }}
                >
                  <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white mb-3 transition-transform group-hover:scale-105" style={{ background: tile.color }}><Icon className="w-4 h-4" /></span>
                  <p className="text-sm font-bold text-foreground">{tile.label}</p>
                  <p className="text-xs text-muted-foreground truncate">{tile.hint}</p>
                </button>
              );
            })}
          </section>

          {/* ===== Recent activity ===== */}
          {txRows.length > 0 && (
            <section className="rounded-2xl border border-border bg-card p-5" aria-labelledby="activity-heading">
              <div className="flex items-baseline justify-between mb-2">
                <h2 id="activity-heading" className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{fr ? "Activité récente" : "Recent activity"}</h2>
                <button type="button" onClick={() => navigate("/settings/purchases")} className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1">
                  {fr ? "Tout voir" : "See all"} <ArrowRight className="w-3 h-3" />
                </button>
              </div>
              <ul className="divide-y divide-border">
                {txRows.slice(0, 5).map((tx) => {
                  const isPurchase = tx.kind === "purchase";
                  return (
                    <li key={tx.id} className="flex items-center gap-3 py-3">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isPurchase ? "bg-primary/15 text-primary" : "bg-emerald-500/15 text-emerald-400"}`}>
                        {isPurchase ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{tx.title}</p>
                        <p className="text-xs text-muted-foreground">{isPurchase ? (fr ? "Achat" : "Purchase") : (fr ? "Vente" : "Sale")} · {formatDate(tx.date)}</p>
                      </div>
                      <span className={`text-sm font-bold tabular-nums shrink-0 ${isPurchase ? "text-foreground" : "text-emerald-400"}`}>{isPurchase ? "−" : "+"}{formatEuros(tx.amount)}</span>
                      {tx.orderId && (
                        <button type="button" onClick={() => navigate(`/my-tickets/${tx.orderId}`)} className="text-xs font-semibold text-primary hover:underline shrink-0">{fr ? "Billet" : "Ticket"}</button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* ===== About you ===== */}
          <section className="rounded-2xl border border-border bg-card p-5 space-y-4" aria-labelledby="about-heading">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-xl flex items-center justify-center text-white" style={{ background: accent }}><User className="w-4 h-4" /></span>
              <div>
                <h2 id="about-heading" className="text-sm font-bold">{fr ? "À propos de vous" : "About you"}</h2>
                <p className="text-xs text-muted-foreground">{fr ? "Le nom qui apparaît sur vos billets" : "The name that goes on your tickets"}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="profile-first-name" className="text-xs text-muted-foreground">{fr ? "Prénom" : "First name"}</Label>
                <Input id="profile-first-name" autoComplete="given-name" maxLength={60} value={editFirstName} onChange={(e) => setEditFirstName(e.target.value)} className="rounded-xl h-11" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="profile-last-name" className="text-xs text-muted-foreground">{fr ? "Nom" : "Last name"}</Label>
                <Input id="profile-last-name" autoComplete="family-name" maxLength={60} value={editLastName} onChange={(e) => setEditLastName(e.target.value)} className="rounded-xl h-11" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">{fr ? "Genre (facultatif)" : "Gender (optional)"}</Label>
              <div className="grid grid-cols-3 gap-2">
                {GENDER_CHOICES.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={editGender === option.value}
                    onClick={() => setEditGender(editGender === option.value ? "" : option.value)}
                    className={`min-h-10 px-2 py-2 rounded-xl border text-xs sm:text-sm font-semibold leading-tight transition-colors ${
                      editGender === option.value ? "border-transparent text-white" : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                    style={editGender === option.value ? { background: accent } : undefined}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Campus</Label>
                <Select value={userData.campus || undefined} onValueChange={handleSaveCampus} disabled={savingCampus}>
                  <SelectTrigger className="h-11 rounded-xl bg-muted/40">
                    <span className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                      <SelectValue placeholder={fr ? "Choisissez votre campus" : "Choose your campus"} />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPUSES.map((c) => (<SelectItem key={c} value={c}>{c}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">{fr ? "Email" : "Email"}</Label>
                <div className="flex items-center gap-2 h-11 px-3 rounded-xl bg-muted/40 border border-border">
                  <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{userData.email || "—"}</span>
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 ml-auto" aria-label={fr ? "Email verrouillé" : "Email locked"} />
                </div>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {fr ? "Votre email sert à retrouver vos billets. Pour le changer, écrivez à " : "Your email is how we find your tickets. To change it, write to "}
              <a href="mailto:support@ticket-safe.eu" className="text-primary font-medium hover:underline">support@ticket-safe.eu</a>.
            </p>
            <Button onClick={handleSaveIdentity} disabled={savingIdentity} className="w-full rounded-full h-11">
              <Save className="w-4 h-4 mr-2" />
              {savingIdentity ? (fr ? "Enregistrement…" : "Saving…") : (fr ? "Enregistrer" : "Save")}
            </Button>
          </section>

          {/* ===== Password, folded away ===== */}
          <section className="rounded-2xl border border-border bg-card" aria-labelledby="password-heading">
            <button type="button" onClick={() => setShowPassword((v) => !v)} aria-expanded={showPassword} className="w-full flex items-center gap-3 p-5 text-left">
              <span className="w-8 h-8 rounded-xl bg-muted flex items-center justify-center text-foreground"><Lock className="w-4 h-4" /></span>
              <div className="flex-1 min-w-0">
                <h2 id="password-heading" className="text-sm font-bold">{fr ? "Mot de passe" : "Password"}</h2>
                <p className="text-xs text-muted-foreground">{fr ? "Changez-le quand vous voulez" : "Change it whenever you like"}</p>
              </div>
              <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${showPassword ? "rotate-180" : ""}`} />
            </button>
            {showPassword && (
              <div className="px-5 pb-5 space-y-3 motion-safe:animate-fade-in">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password" className="text-xs text-muted-foreground">{fr ? "Nouveau mot de passe" : "New password"}</Label>
                  <Input id="new-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} maxLength={PASSWORD_MAX_LENGTH} autoComplete="new-password" className="rounded-xl h-11" placeholder={fr ? `Au moins ${PASSWORD_MIN_LENGTH} caractères` : `At least ${PASSWORD_MIN_LENGTH} characters`} />
                  {newPassword && (
                    <span className={`inline-flex items-center gap-1 text-xs ${newPassword.length >= PASSWORD_MIN_LENGTH ? "text-emerald-400" : "text-muted-foreground"}`}>
                      {newPassword.length >= PASSWORD_MIN_LENGTH ? <Check className="w-3 h-3" /> : null}
                      {fr ? `Au moins ${PASSWORD_MIN_LENGTH} caractères` : `At least ${PASSWORD_MIN_LENGTH} characters`}
                    </span>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password" className="text-xs text-muted-foreground">{fr ? "Confirmer" : "Confirm"}</Label>
                  <Input id="confirm-password" type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="rounded-xl h-11" placeholder={fr ? "Retapez le mot de passe" : "Re-enter the password"} />
                </div>
                {newPassword && confirmPassword && newPassword !== confirmPassword && (
                  <div className="flex items-center gap-2 text-sm text-destructive"><AlertCircle className="w-4 h-4" />{fr ? "Les mots de passe ne correspondent pas" : "Passwords do not match"}</div>
                )}
                <Button onClick={handleSavePassword} disabled={savingPassword || !newPassword} className="w-full rounded-full h-11">
                  <Save className="w-4 h-4 mr-2" />
                  {savingPassword ? (fr ? "Enregistrement…" : "Saving…") : (fr ? "Mettre à jour" : "Update password")}
                </Button>
              </div>
            )}
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Profile;
