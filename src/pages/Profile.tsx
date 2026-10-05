import { useState, useEffect } from "react";
import { BackButton } from "@/components/BackButton";
import { useNavigate } from "react-router-dom";
import HeaderNight from "@/components/HeaderNight";
import { useThemeMode } from "@/hooks/useThemeMode";
import Footer from "@/components/Footer";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
  Calendar,
} from "lucide-react";

/** A ticket the user holds for an event that has not happened yet. */
interface UpcomingTicket {
  id: string;
  orderId: string;
  eventTitle: string;
  eventDate: string | null;
  location: string | null;
  tierName: string | null;
  holderName: string | null;
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
             event:events(title, date, location),
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
              const event = one(row.event as { title: string | null; date: string | null; location: string | null } | null);
              const tier = one(row.tier as { name: string | null } | null);
              return {
                id: row.id,
                orderId: row.order_id,
                eventTitle: event?.title || "Événement",
                eventDate: event?.date ?? null,
                location: event?.location ?? null,
                tierName: tier?.name ?? null,
                holderName: [row.holder_first_name, row.holder_last_name].filter(Boolean).join(" ") || null,
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
        <main className="pt-20 pb-16 md:pt-24 flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-[9999px] h-10 w-10 border-b-2 border-primary mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t("profile.loadingProfile")}</p>
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

  const formatEuros = (n: number) =>
    new Intl.NumberFormat(dateLocale, {
      style: "currency",
      currency: "EUR",
      maximumFractionDigits: n % 1 === 0 ? 0 : 2,
    }).format(n);
  const formatDate = (s: string) =>
    new Date(s).toLocaleDateString(dateLocale, { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.profile" descriptionKey="settings.description" />
      <HeaderNight />
      <main className="flex-1 pt-20 pb-16 md:pt-24">
        {/* Identity hero */}
        <div className="relative overflow-hidden bg-card border-b border-border">
          <div className="relative container mx-auto px-4 max-w-3xl py-8 md:py-10">
            <div className="mb-5">
              <BackButton />
            </div>
            <div className="flex items-center gap-4 md:gap-5">
              <div
                className="w-14 h-14 md:w-16 md:h-16 bg-primary/15 ring-1 ring-primary/30 flex items-center justify-center text-lg md:text-xl font-bold tracking-tight text-foreground flex-shrink-0"
                aria-label={`${userData.name}'s initials`}
              >
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] md:text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                  {[userData.school, userData.campus].filter(Boolean).join(" · ") || "Ticket Safe"}
                </p>
                <h1 className="text-2xl md:text-3xl font-bold mt-0.5 leading-tight text-foreground">
                  {t("profile.hello", { name: firstName })}
                </h1>
                <p className="text-sm text-muted-foreground mt-0.5 truncate">{userData.email}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="container mx-auto px-4 max-w-3xl mt-8 space-y-8">
          {/* At-a-glance stats. The selling figures only exist when resale is switched on. */}
          <div className={`grid gap-3 ${RESALE_ENABLED ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2"}`}>
            <Card className="border-border">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {fr ? "Billets à venir" : "Upcoming tickets"}
                </p>
                <p className="text-xl md:text-2xl font-black mt-1 tabular-nums">{upcomingTickets.length}</p>
              </CardContent>
            </Card>
            <Card className="border-border">
              <CardContent className="p-4 text-center">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  {fr ? "Achats" : "Purchases"}
                </p>
                <p className="text-xl md:text-2xl font-black mt-1 tabular-nums">{purchases.length}</p>
              </CardContent>
            </Card>
            {RESALE_ENABLED && (
              <>
                <Card className="border-border">
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {fr ? "Vendu" : "Sold"}
                    </p>
                    <p className="text-xl md:text-2xl font-black mt-1 tabular-nums">{totalSold}</p>
                  </CardContent>
                </Card>
                <Card className="border-border">
                  <CardContent className="p-4 text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {fr ? "Annonces" : "Listed"}
                    </p>
                    <p className="text-xl md:text-2xl font-black mt-1 tabular-nums">{activeListings}</p>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          {/* Upcoming tickets */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Ticket className="w-5 h-5 text-primary" />
                {fr ? "Mes billets à venir" : "Upcoming tickets"}
              </CardTitle>
              <CardDescription>
                {fr
                  ? "Ouvrez un billet pour afficher son QR code à l'entrée"
                  : "Open a ticket to show its QR code at the door"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {upcomingTickets.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-sm text-muted-foreground mb-4">
                    {fr ? "Aucun billet à venir pour l'instant." : "No upcoming tickets yet."}
                  </p>
                  <Button variant="hero" size="sm" onClick={() => navigate("/tickets")} className="gap-1.5">
                    <ShoppingBag className="w-4 h-4" />
                    {t("profile.browseEvents")}
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {upcomingTickets.map((tk) => (
                    <div key={tk.id} className="flex items-center gap-3 py-3">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Calendar className="w-4 h-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">{tk.eventTitle}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {tk.eventDate ? formatDate(tk.eventDate) : fr ? "Date à venir" : "Date to come"}
                          {tk.tierName ? ` · ${tk.tierName}` : ""}
                          {tk.holderName ? ` · ${tk.holderName}` : ""}
                        </p>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => navigate(`/my-tickets/${tk.orderId}`)}
                        className="gap-1.5 flex-shrink-0"
                      >
                        <QrCode className="w-4 h-4" />
                        {fr ? "QR code" : "QR code"}
                      </Button>
                    </div>
                  ))}
                </div>
              )}
              {RESALE_ENABLED && upcomingTickets.length > 0 && (
                <div className="mt-4 pt-4 border-t border-border">
                  <Button variant="outline" size="sm" onClick={() => navigate("/marketplace/sell")} className="gap-1.5">
                    <Tag className="w-4 h-4" />
                    {fr ? "Revendre un billet" : "Resell a ticket"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Personal information */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User className="w-5 h-5 text-primary" />
                {fr ? "Informations personnelles" : "Personal information"}
              </CardTitle>
              <CardDescription>
                {fr ? "Modifiez votre nom quand vous voulez" : "Update your name whenever you need"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="profile-first-name" className="text-xs uppercase tracking-wider text-muted-foreground">
                    {fr ? "Prénom" : "First name"}
                  </Label>
                  <Input
                    id="profile-first-name"
                    autoComplete="given-name"
                    maxLength={60}
                    value={editFirstName}
                    onChange={(e) => setEditFirstName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="profile-last-name" className="text-xs uppercase tracking-wider text-muted-foreground">
                    {fr ? "Nom" : "Last name"}
                  </Label>
                  <Input
                    id="profile-last-name"
                    autoComplete="family-name"
                    maxLength={60}
                    value={editLastName}
                    onChange={(e) => setEditLastName(e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {fr ? "Genre (facultatif)" : "Gender (optional)"}
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  {GENDER_CHOICES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={editGender === option.value}
                      onClick={() => setEditGender(editGender === option.value ? "" : option.value)}
                      className={`min-h-10 px-2 py-2 rounded-md border text-xs sm:text-sm font-semibold leading-tight transition-colors ${
                        editGender === option.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>
              <Button onClick={handleSaveIdentity} disabled={savingIdentity} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {savingIdentity
                  ? fr ? "Enregistrement…" : "Saving…"
                  : fr ? "Enregistrer mes informations" : "Save my details"}
              </Button>
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  {fr ? "Adresse email" : "Email address"}
                </Label>
                <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                  <Mail className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <span className="text-sm font-medium truncate">{userData.email || "—"}</span>
                </div>
              </div>
              {userData.school && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    {fr ? "École" : "School"}
                  </Label>
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/40 border border-border">
                    <Building2 className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm font-medium truncate">{userData.school}</span>
                  </div>
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                  Campus
                </Label>
                <Select
                  value={userData.campus || undefined}
                  onValueChange={handleSaveCampus}
                  disabled={savingCampus}
                >
                  <SelectTrigger className="h-auto py-3 bg-muted/40">
                    <span className="flex items-center gap-3">
                      <MapPin className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      <SelectValue placeholder={fr ? "Choisissez votre campus" : "Choose your campus"} />
                    </span>
                  </SelectTrigger>
                  <SelectContent>
                    {CAMPUSES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-start gap-2 p-3 rounded-lg bg-primary/5 border border-primary/15">
                <ShieldCheck className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  <span className="font-semibold text-foreground">
                    {fr ? "Email verrouillé." : "Email locked."}
                  </span>{" "}
                  {fr
                    ? "Votre adresse email sert à retrouver vos billets. Pour la changer, écrivez à "
                    : "Your email address is how we find your tickets. To change it, contact "}
                  <a href="mailto:support@ticket-safe.eu" className="text-primary font-medium hover:underline">
                    support@ticket-safe.eu
                  </a>
                  .
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Security — password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                {fr ? "Mot de passe" : "Password"}
              </CardTitle>
              <CardDescription>
                {fr ? "Changez votre mot de passe" : "Change your account password"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">{fr ? "Nouveau mot de passe" : "New password"}</Label>
                <Input
                  id="new-password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  maxLength={PASSWORD_MAX_LENGTH}
                  autoComplete="new-password"
                  placeholder={fr ? `Au moins ${PASSWORD_MIN_LENGTH} caractères` : `At least ${PASSWORD_MIN_LENGTH} characters`}
                />
                {newPassword && (
                  <span className={`text-xs ${newPassword.length >= PASSWORD_MIN_LENGTH ? "text-green-600" : "text-muted-foreground"}`}>
                    {newPassword.length >= PASSWORD_MIN_LENGTH ? "✓ " : "○ "}
                    {fr ? `Au moins ${PASSWORD_MIN_LENGTH} caractères` : `At least ${PASSWORD_MIN_LENGTH} characters`}
                  </span>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">{fr ? "Confirmer le mot de passe" : "Confirm password"}</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder={fr ? "Retapez le mot de passe" : "Re-enter the password"}
                />
              </div>
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <div className="flex items-center gap-2 text-sm text-destructive">
                  <AlertCircle className="w-4 h-4" />
                  {fr ? "Les mots de passe ne correspondent pas" : "Passwords do not match"}
                </div>
              )}
              <Button onClick={handleSavePassword} disabled={savingPassword || !newPassword} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                {savingPassword
                  ? fr ? "Enregistrement…" : "Saving…"
                  : fr ? "Mettre à jour le mot de passe" : "Update password"}
              </Button>
            </CardContent>
          </Card>

          {/* Transactions */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="w-5 h-5 text-primary" />
                {fr ? "Historique d'achats" : "Purchase history"}
              </CardTitle>
              <CardDescription>
                {RESALE_ENABLED
                  ? fr ? "Vos achats et ventes sur Ticket Safe" : "Your purchases and sales on Ticket Safe"
                  : fr ? "Vos achats sur Ticket Safe" : "Your purchases on Ticket Safe"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {totalSpent > 0 && (
                <p className="text-xs text-muted-foreground mb-4">
                  {fr ? "Total dépensé : " : "Total spent: "}
                  <span className="font-bold text-foreground">{formatEuros(totalSpent)}</span>
                </p>
              )}
              {txRows.length === 0 ? (
                <div className="text-center py-8">
                  <div className="mx-auto w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                    <ShoppingBag className="w-5 h-5 text-primary" />
                  </div>
                  <p className="text-sm text-muted-foreground mb-5">
                    {fr ? "Aucun achat pour l'instant." : "No purchases yet."}
                  </p>
                  <Button variant="hero" size="sm" onClick={() => navigate("/tickets")} className="gap-1.5">
                    <ShoppingBag className="w-4 h-4" />
                    {t("profile.browseEvents")}
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {txRows.map((tx) => {
                    const isPurchase = tx.kind === "purchase";
                    return (
                      <div key={tx.id} className="flex items-center gap-3 py-3">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isPurchase ? "bg-primary/10" : "bg-green-500/10"
                          }`}
                        >
                          {isPurchase ? (
                            <ArrowDownLeft className="w-4 h-4 text-primary" />
                          ) : (
                            <ArrowUpRight className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{tx.title}</p>
                          <p className="text-xs text-muted-foreground">
                            {isPurchase ? (fr ? "Achat" : "Purchase") : (fr ? "Vente" : "Sale")}
                            <span className="mx-1.5">·</span>
                            {formatDate(tx.date)}
                          </p>
                        </div>
                        <span
                          className={`text-sm font-bold tabular-nums flex-shrink-0 ${
                            isPurchase ? "text-foreground" : "text-green-600"
                          }`}
                        >
                          {isPurchase ? "−" : "+"}
                          {formatEuros(tx.amount)}
                        </span>
                        {tx.orderId && (
                          <button
                            type="button"
                            onClick={() => navigate(`/my-tickets/${tx.orderId}`)}
                            className="text-xs font-semibold text-primary hover:underline flex-shrink-0"
                          >
                            {fr ? "Billet" : "Ticket"}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Deep links to the full hubs */}
              <div className={`grid gap-3 mt-5 pt-5 border-t border-border ${RESALE_ENABLED ? "grid-cols-2" : "grid-cols-1"}`}>
                <button
                  onClick={() => navigate("/my-tickets")}
                  className="flex items-center justify-between gap-2 px-3.5 h-11 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/40 transition-colors text-sm font-semibold"
                >
                  <span className="inline-flex items-center gap-2">
                    <Ticket className="w-4 h-4 text-primary" />
                    {t("profile.myTickets")}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </button>
                {RESALE_ENABLED && (
                <button
                  onClick={() => navigate("/settings/listings")}
                  className="flex items-center justify-between gap-2 px-3.5 h-11 rounded-lg border border-border hover:border-primary/40 hover:bg-muted/40 transition-colors text-sm font-semibold"
                >
                  <span className="inline-flex items-center gap-2">
                    <Tag className="w-4 h-4 text-primary" />
                    {fr ? "Mon portefeuille" : "My Wallet"}
                  </span>
                  <ArrowRight className="w-4 h-4 text-muted-foreground" />
                </button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Profile;
