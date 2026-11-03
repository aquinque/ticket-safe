import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import HeaderNight from "@/components/HeaderNight";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useThemeMode } from "@/hooks/useThemeMode";
import { useAuth } from "@/hooks/useAuth";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useI18n } from "@/contexts/I18nContext";
import { supabase } from "@/integrations/supabase/client";
import { RESALE_ENABLED } from "@/lib/featureFlags";
import { GENDER_CHOICES, authErrorMessage, genderToStore } from "@/lib/authRules";
import { CURRENCIES, toCurrency, type Currency } from "@/lib/money";
import { isPastEvent } from "@/lib/eventTime";
import { authPathHere } from "@/lib/returnTo";
import { authRedirect } from "@/lib/siteUrl";
import { ibanLast4 } from "@/components/wallet/walletModel";
import { Chip, ChoiceEditRow, LinkRow, Row, RowAction, Section, TextEditRow, eyebrow } from "@/components/profile/ProfileUI";
import { PasswordChangeRow } from "@/components/profile/PasswordChangeRow";
import {
  NAME_MAX_LENGTH,
  SCHOOL_MAX_LENGTH,
  initialsOf,
  nameError,
  newEmailError,
  recapLine,
  schoolError,
  signInMethods,
} from "@/components/profile/profileModel";

/**
 * /profile — the account page, reached from the menu (Profile · My tickets · My wallet) and from the
 * initials in the desktop header. Signing in never lands here (see lib/returnTo).
 *
 * Everything the old Profile, Settings and Personal information pages did lives here:
 * - who you are: initials, first name, email, school, campus, member since, a one-line recap;
 * - your tickets: the next event with its QR, all tickets, purchase history, messages;
 * - personal info: first and last name (also on the account, for emails), gender, school, campus;
 * - sign-in & security: email (changed after confirming a link), password (current + new + confirm),
 *   sign-in methods, sign out of all devices;
 * - payments: resale payout account on Stripe (status, last 4 of the withdrawal IBAN), wallet balance,
 *   Ticket Studio payouts for organizers;
 * - preferences: language;
 * - privacy: download, anonymize or delete the account (privacy-request function).
 * Each change saves on its own, inline, with a toast; nothing reloads the page.
 */

/** Campuses offered at sign-up. */
const CAMPUSES = ["Paris", "London", "Madrid", "Berlin", "Turin"] as const;

const LANGUAGES: { code: "fr" | "en" | "es"; label: string }[] = [
  { code: "fr", label: "Français" },
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
];

const LOCALE: Record<string, string> = { fr: "fr-FR", es: "es-ES", en: "en-GB" };

interface ProfileData {
  firstName: string;
  lastName: string;
  fullName: string;
  gender: "" | "female" | "male";
  school: string;
  campus: string;
  memberSince: string | null;
  profileEmail: string | null;
  payoutIban: string | null;
}

interface NextTicket {
  orderId: string;
  title: string;
  date: string | null;
  location: string | null;
  tier: string | null;
}

interface Recap {
  events: number;
  tickets: number;
  spent: { value: number; currency: Currency }[];
  resales: number;
}

type Payout = { state: "none" | "pending" | "ready"; availableCents: number };

type EditKey = "first" | "last" | "gender" | "school" | "campus" | "email" | "password";

const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

const Profile = () => {
  useThemeMode("night");
  const navigate = useNavigate();
  const { t, language, setLanguage } = useI18n();
  const { user, loading: authLoading, signOut } = useAuth();
  const { organizer } = useOrganizer();
  const locale = LOCALE[language] ?? "en-GB";

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [nextTicket, setNextTicket] = useState<NextTicket | null>(null);
  const [upcomingCount, setUpcomingCount] = useState(0);
  const [recap, setRecap] = useState<Recap>({ events: 0, tickets: 0, spent: [], resales: 0 });
  const [payout, setPayout] = useState<Payout>({ state: "none", availableCents: 0 });
  const [editing, setEditing] = useState<EditKey | null>(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [dialog, setDialog] = useState<"signout" | "anonymize" | "delete" | null>(null);
  const [dialogBusy, setDialogBusy] = useState(false);
  const [deleteEmail, setDeleteEmail] = useState("");

  const email = user?.email ?? "";
  const pendingEmail = (user as { new_email?: string | null } | null)?.new_email ?? null;

  useEffect(() => {
    if (!authLoading && !user) navigate(authPathHere(), { replace: true });
  }, [authLoading, user, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    const [profileRes, ordersRes, resaleBuysRes, ticketsRes, salesRes, accountRes, earningsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
      supabase.from("event_orders").select("id, event_id, quantity, unit_price_cents, total_cents, currency").eq("buyer_id", user.id).eq("status", "paid"),
      supabase.from("transactions").select("id, amount, quantity, status, ticket:tickets(event_id)").eq("buyer_id", user.id),
      supabase
        .from("event_tickets")
        .select("id, order_id, event:events(title, date, ends_at, location), tier:event_tiers(name)")
        .eq("buyer_id", user.id)
        .eq("status", "valid"),
      RESALE_ENABLED ? supabase.from("tickets").select("id, status").eq("seller_id", user.id).eq("status", "sold") : Promise.resolve({ data: [] as { id: string }[] }),
      supabase.from("stripe_connect_accounts").select("id, payouts_enabled").eq("user_id", user.id).eq("owner_type", "reseller").maybeSingle(),
      supabase.from("seller_earnings").select("available_cents").eq("seller_id", user.id).maybeSingle(),
    ]);

    const p = profileRes.data as Record<string, unknown> | null;
    const meta = (user.user_metadata ?? {}) as Record<string, unknown>;
    const fullName = String(p?.full_name ?? meta.full_name ?? "").trim();
    const parts = fullName.split(/\s+/).filter(Boolean);
    const gender = p?.gender === "female" || p?.gender === "male" ? p.gender : "";
    setProfile({
      firstName: String(p?.first_name ?? meta.first_name ?? parts[0] ?? ""),
      lastName: String(p?.last_name ?? meta.last_name ?? parts.slice(1).join(" ") ?? ""),
      fullName,
      gender,
      school: String(p?.university ?? meta.university ?? ""),
      campus: String(p?.campus ?? meta.campus ?? ""),
      memberSince: (p?.created_at as string | null) ?? user.created_at ?? null,
      profileEmail: (p?.email as string | null) ?? null,
      payoutIban: (p?.payout_iban as string | null) ?? null,
    });

    // Upcoming tickets, soonest first: an event stays upcoming until it has ended (lib/eventTime).
    const tickets = (ticketsRes.data ?? []).map((row) => {
      const ev = one(row.event as { title: string | null; date: string | null; ends_at: string | null; location: string | null } | null);
      const tier = one(row.tier as { name: string | null } | null);
      return { orderId: row.order_id as string, title: ev?.title ?? "", date: ev?.date ?? null, endsAt: ev?.ends_at ?? null, location: ev?.location ?? null, tier: tier?.name ?? null };
    });
    const upcoming = tickets
      .filter((tk) => !tk.date || !isPastEvent({ date: tk.date, ends_at: tk.endsAt }))
      .sort((a, b) => new Date(a.date ?? 0).getTime() - new Date(b.date ?? 0).getTime());
    setUpcomingCount(upcoming.length);
    setNextTicket(upcoming[0] ?? null);

    // Recap: events attended or booked, tickets bought, money spent per currency, resales sold.
    const orders = ordersRes.data ?? [];
    const resaleBuys = (resaleBuysRes.data ?? []).filter((x) => x.status === "completed");
    const eventIds = new Set<string>([
      ...orders.map((o) => o.event_id as string).filter(Boolean),
      ...resaleBuys.map((x) => one(x.ticket as { event_id: string | null } | null)?.event_id ?? "").filter(Boolean),
    ]);
    const spent: Partial<Record<Currency, number>> = {};
    for (const o of orders) {
      const c = toCurrency(o.currency);
      spent[c] = (spent[c] ?? 0) + (o.total_cents ?? (o.unit_price_cents ?? 0) * (o.quantity ?? 1)) / 100;
    }
    for (const x of resaleBuys) spent.EUR = (spent.EUR ?? 0) + Number(x.amount ?? 0);
    setRecap({
      events: eventIds.size,
      tickets: orders.reduce((n, o) => n + (o.quantity ?? 1), 0) + resaleBuys.reduce((n, x) => n + (x.quantity ?? 1), 0),
      spent: CURRENCIES.filter((c) => spent[c]).map((c) => ({ value: Math.round(spent[c]! * 100) / 100, currency: c })),
      resales: (salesRes.data ?? []).length,
    });

    const account = accountRes.data as { payouts_enabled?: boolean } | null;
    setPayout({
      state: !account ? "none" : account.payouts_enabled ? "ready" : "pending",
      availableCents: (earningsRes.data as { available_cents?: number } | null)?.available_cents ?? 0,
    });
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // A confirmed email change is on the account first: copy it to the profile row the app reads.
  useEffect(() => {
    if (!user || !profile || !email || profile.profileEmail === email) return;
    void supabase.from("profiles").update({ email }).eq("id", user.id).then(({ error }) => {
      if (!error) setProfile((p) => (p ? { ...p, profileEmail: email } : p));
    });
  }, [user, profile, email]);

  const L = {
    edit: t("account.common.edit"),
    save: t("account.common.save"),
    saving: t("account.common.saving"),
    cancel: t("account.common.cancel"),
  };
  const close = () => setEditing(null);
  const saveFailed = (err: unknown) => {
    console.error("[profile] save failed:", err);
    toast.error(t("account.toast.saveFailed"));
    return t("account.errors.saveFailed");
  };

  /** Saves the name on the profile row and on the account (used to greet the person in emails). */
  const saveName = async (field: "first" | "last", draft: string): Promise<string | null> => {
    if (!user || !profile) return null;
    const problem = nameError(draft, field);
    if (problem) return t(problem.key, problem.params);
    const first = field === "first" ? draft.trim() : profile.firstName.trim();
    const last = field === "last" ? draft.trim() : profile.lastName.trim();
    const full = [first, last].filter(Boolean).join(" ");
    const { error } = await supabase.from("profiles").update({ first_name: first, last_name: last, full_name: full }).eq("id", user.id);
    if (error) return saveFailed(error);
    await supabase.auth.updateUser({ data: { first_name: first, last_name: last, full_name: full } }).catch(() => undefined);
    setProfile({ ...profile, firstName: first, lastName: last, fullName: full });
    toast.success(t("account.toast.saved"), { description: full });
    close();
    return null;
  };

  const saveField = async (column: "university" | "campus" | "gender", value: string | null, key: keyof ProfileData, label: string): Promise<string | null> => {
    if (!user || !profile) return null;
    const { error } = await supabase.from("profiles").update({ [column]: value }).eq("id", user.id);
    if (error) return saveFailed(error);
    setProfile({ ...profile, [key]: value ?? "" });
    toast.success(t("account.toast.saved"), { description: label });
    close();
    return null;
  };

  const saveEmail = async (draft: string): Promise<string | null> => {
    const problem = newEmailError(draft, email);
    if (problem) return t(problem.key, problem.params);
    const next = draft.trim();
    const { error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo: authRedirect("/profile") });
    if (error) return authErrorMessage(error);
    toast.success(t("account.toast.emailSent"), { description: t("account.toast.emailSentHint", { email: next }) });
    close();
    return null;
  };

  const openStripe = async (action: "onboard" | "dashboard") => {
    setStripeBusy(true);
    const { data, error } = await supabase.functions.invoke("stripe-connect-onboard-reseller", { body: { action } });
    setStripeBusy(false);
    if (error || !data?.url) {
      toast.error(t("account.toast.stripeFailed"));
      return;
    }
    window.location.href = data.url;
  };

  const chooseLanguage = (code: "fr" | "en" | "es") => {
    if (code === language) return;
    setLanguage(code);
    toast.success(LANGUAGES.find((l) => l.code === code)!.label);
  };

  const privacyRequest = async (type: "EXPORT" | "ANONYMIZE" | "DELETE") => {
    const { data, error } = await supabase.functions.invoke("privacy-request", { body: { request_type: type } });
    if (error) throw new Error(error.message);
    return data;
  };

  const downloadData = async () => {
    setExporting(true);
    try {
      const data = await privacyRequest("EXPORT");
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = `ticket-safe-data-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(t("account.toast.dataDownloaded"), { description: t("account.toast.dataDownloadedHint") });
    } catch (err) {
      console.error("[profile] export failed:", err);
      toast.error(t("account.toast.dataFailed"));
    } finally {
      setExporting(false);
    }
  };

  const leave = async () => {
    await signOut();
    window.location.href = "/";
  };

  const confirmDialog = async () => {
    if (dialogBusy) return;
    setDialogBusy(true);
    try {
      if (dialog === "signout") {
        await leave();
        return;
      }
      if (dialog === "delete" && deleteEmail.trim().toLowerCase() !== email.toLowerCase()) {
        toast.error(t("account.privacy.deleteMismatch"));
        return;
      }
      await privacyRequest(dialog === "delete" ? "DELETE" : "ANONYMIZE");
      toast.success(dialog === "delete" ? t("account.toast.deleted") : t("account.toast.anonymized"));
      setTimeout(() => void leave(), 1200);
    } catch (err) {
      console.error("[profile] privacy request failed:", err);
      toast.error(dialog === "delete" ? t("account.toast.deleteFailed") : t("account.toast.anonymizeFailed"));
    } finally {
      setDialogBusy(false);
    }
  };

  if (authLoading || !user || !profile) {
    return (
      <div className="theme-night min-h-screen bg-background flex flex-col">
        <HeaderNight />
        <main className="flex-1 pt-24 pb-16">
          <div className="mx-auto w-full max-w-[720px] px-4 space-y-5" aria-busy="true" aria-label={t("account.loading")}>
            <div className="h-28 bg-card/60 animate-pulse" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-48 border border-brand-200/15 bg-card/30 animate-pulse" />
            ))}
          </div>
        </main>
        <Footer />
      </div>
    );
  }

  const firstName = profile.firstName || profile.fullName.split(" ")[0] || email.split("@")[0];
  const recapText = recapLine(recap, t, locale);
  const methods = signInMethods(user.identities).map((m) => (m === "email" ? t("account.security.methodEmail") : m));
  const isOrganizer = organizer?.status === "approved";
  const formatDay = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, { weekday: "short", day: "numeric", month: "short" }) +
    " · " +
    new Date(iso).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  const genderOptions = [
    ...GENDER_CHOICES.filter((g) => g.value !== "prefer_not").map((g) => ({ value: g.value, label: t(`account.personal.gender_${g.value}`) })),
    { value: "", label: t("account.personal.genderNone") },
  ];
  const campusOptions = [...CAMPUSES.map((c) => ({ value: c, label: c })), { value: "", label: t("account.personal.none") }];

  const payoutChip =
    payout.state === "ready" ? <Chip tone="good">{t("account.payments.connected")}</Chip>
      : payout.state === "pending" ? <Chip tone="accent">{t("account.payments.actionNeeded")}</Chip>
        : <Chip>{t("account.payments.notSetUp")}</Chip>;
  const payoutHint =
    payout.state === "ready" ? t("account.payments.readyHint")
      : payout.state === "pending" ? t("account.payments.pendingHint")
        : t("account.payments.noneHint");

  return (
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.profile" descriptionKey="settings.description" />
      <HeaderNight />
      <main className="flex-1 pt-24 md:pt-28 pb-[max(4rem,calc(env(safe-area-inset-bottom)+2rem))]">
        <div className="mx-auto w-full max-w-[720px] px-4 space-y-5">
          {/* Who you are */}
          <header className="menu-rise pb-4" style={{ animationDelay: "0ms" }}>
            <p className={eyebrow}>{t("account.eyebrow")}</p>
            <div className="mt-4 flex items-center gap-4 sm:gap-5">
              <div
                className="w-16 h-16 sm:w-20 sm:h-20 shrink-0 rounded-full border border-brand-200/40 inline-flex items-center justify-center font-display text-[22px] sm:text-[28px] font-bold text-brand-200"
                aria-hidden="true"
              >
                {initialsOf(profile.fullName || firstName, email)}
              </div>
              <div className="min-w-0">
                <h1 className="font-display font-bold tracking-[-0.02em] leading-[1.02] text-[40px] sm:text-[56px] break-words">{firstName}</h1>
                <p className="mt-1.5 text-[15px] text-muted-foreground truncate">{email}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {profile.school && <Chip>{profile.school}</Chip>}
              {profile.campus && <Chip>{profile.campus}</Chip>}
              {profile.memberSince && (
                <Chip>{t("account.memberSince", { date: new Date(profile.memberSince).toLocaleDateString(locale, { month: "long", year: "numeric" }) })}</Chip>
              )}
            </div>
            {recapText && <p className="mt-5 text-[15px] text-foreground/90 tabular-nums">{recapText}</p>}
          </header>

          {/* Your tickets */}
          <Section id="profile-tickets" title={t("account.tickets.title")} delay={40}>
            {nextTicket ? (
              <LinkRow
                to={`/my-tickets/${nextTicket.orderId}`}
                label={nextTicket.title || t("account.tickets.event")}
                detail={
                  <>
                    {[nextTicket.date ? formatDay(nextTicket.date) : null, nextTicket.location, nextTicket.tier].filter(Boolean).join(" · ")}
                    <span className="mt-1 block font-semibold text-brand-200">{t("account.tickets.nextUp")} · {t("account.tickets.showQr")}</span>
                  </>
                }
              />
            ) : (
              <LinkRow to="/tickets" label={t("account.tickets.nothing")} detail={t("account.tickets.browse")} />
            )}
            <LinkRow to="/my-tickets" label={t("account.tickets.all")} detail={upcomingCount > 0 ? t("account.tickets.upcoming", { count: upcomingCount }) : undefined} />
            <LinkRow to="/settings/purchases" label={t("account.tickets.purchases")} />
            <LinkRow to="/messages" label={t("account.tickets.messages")} />
          </Section>

          {/* Personal info */}
          <Section id="profile-personal" title={t("account.personal.title")} delay={80}>
            <TextEditRow
              label={t("account.personal.firstName")}
              value={profile.firstName}
              editing={editing === "first"}
              onEdit={() => setEditing("first")}
              onCancel={close}
              onSave={(d) => saveName("first", d)}
              autoComplete="given-name"
              maxLength={NAME_MAX_LENGTH}
              formHint={t("account.personal.nameHint")}
              labels={{ ...L, editLabel: t("account.personal.editFirstName") }}
            />
            <TextEditRow
              label={t("account.personal.lastName")}
              value={profile.lastName}
              editing={editing === "last"}
              onEdit={() => setEditing("last")}
              onCancel={close}
              onSave={(d) => saveName("last", d)}
              autoComplete="family-name"
              maxLength={NAME_MAX_LENGTH}
              formHint={t("account.personal.nameHint")}
              labels={{ ...L, editLabel: t("account.personal.editLastName") }}
            />
            <ChoiceEditRow
              label={t("account.personal.gender")}
              value={profile.gender}
              options={genderOptions}
              editing={editing === "gender"}
              onEdit={() => setEditing("gender")}
              onCancel={close}
              onSave={(v) => saveField("gender", genderToStore(v as "female" | "male" | ""), "gender", t("account.personal.gender"))}
              labels={{ edit: L.edit, cancel: L.cancel, editLabel: t("account.personal.editGender"), none: t("account.personal.genderNone") }}
            />
            <TextEditRow
              label={t("account.personal.school")}
              value={profile.school}
              display={profile.school || <span className="font-normal text-muted-foreground">{t("account.personal.optional")}</span>}
              editing={editing === "school"}
              onEdit={() => setEditing("school")}
              onCancel={close}
              onSave={async (d) => {
                const problem = schoolError(d);
                if (problem) return t(problem.key, problem.params);
                return saveField("university", d.trim() || null, "school", d.trim() || t("account.personal.school"));
              }}
              autoComplete="organization"
              maxLength={SCHOOL_MAX_LENGTH}
              placeholder={t("account.personal.schoolPlaceholder")}
              labels={{ ...L, editLabel: t("account.personal.editSchool") }}
            />
            <ChoiceEditRow
              label={t("account.personal.campus")}
              value={profile.campus}
              options={campusOptions}
              editing={editing === "campus"}
              onEdit={() => setEditing("campus")}
              onCancel={close}
              onSave={(v) => saveField("campus", v || null, "campus", v || t("account.personal.campus"))}
              labels={{ edit: L.edit, cancel: L.cancel, editLabel: t("account.personal.editCampus"), none: t("account.personal.none") }}
            />
          </Section>

          {/* Sign-in & security */}
          <Section id="profile-security" title={t("account.security.title")} delay={120}>
            <TextEditRow
              label={t("account.security.email")}
              value={email}
              hint={pendingEmail ? t("account.security.emailPending", { email: pendingEmail }) : undefined}
              editing={editing === "email"}
              onEdit={() => setEditing("email")}
              onCancel={close}
              onSave={saveEmail}
              inputType="email"
              autoComplete="email"
              placeholder="you@example.com"
              formHint={t("account.security.emailHint")}
              labels={{ ...L, save: t("account.security.emailSend"), saving: t("account.common.sending"), editLabel: t("account.security.editEmail") }}
            />
            <PasswordChangeRow email={email} editing={editing === "password"} onEdit={() => setEditing("password")} onClose={close} />
            <Row
              label={t("account.security.methods")}
              value={
                <span className="flex flex-wrap gap-2 pt-1">
                  {methods.map((m) => (
                    <Chip key={m}>{m}</Chip>
                  ))}
                </span>
              }
            />
            <LinkRow onClick={() => setDialog("signout")} label={t("account.security.signOutAll")} detail={t("account.security.signOutAllHint")} />
          </Section>

          {/* Payments */}
          <Section id="profile-payments" title={t("account.payments.title")} delay={160}>
            <Row
              label={t("account.payments.payoutAccount")}
              value={
                <span className="flex flex-wrap items-center gap-2">
                  {t("account.payments.stripe")} {payoutChip}
                </span>
              }
              hint={
                <>
                  {payoutHint}
                  {profile.payoutIban && <> {t("account.payments.iban", { last4: ibanLast4(profile.payoutIban) })}</>}
                </>
              }
              action={
                payout.state !== "none" ? (
                  <RowAction onClick={() => openStripe(payout.state === "ready" ? "dashboard" : "onboard")} disabled={stripeBusy}>
                    {stripeBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : payout.state === "ready" ? t("account.payments.manage") : t("account.payments.finish")}
                  </RowAction>
                ) : undefined
              }
            />
            <LinkRow
              to="/settings/listings"
              label={t("account.payments.wallet")}
              detail={t("account.payments.walletHint", {
                amount: new Intl.NumberFormat(locale, { style: "currency", currency: "EUR" }).format(payout.availableCents / 100),
              })}
            />
            {isOrganizer && <LinkRow to="/studio" label={t("account.payments.studio")} detail={t("account.payments.studioHint")} />}
          </Section>

          {/* Preferences */}
          <Section id="profile-preferences" title={t("account.preferences.title")} delay={200}>
            <div className="flex items-center justify-between gap-3 py-3 min-h-[64px]">
              <div className="min-w-0">
                <div className="text-[13px] text-muted-foreground">{t("account.preferences.language")}</div>
                <div className="mt-0.5 font-semibold">{LANGUAGES.find((l) => l.code === language)?.label}</div>
              </div>
              <div role="group" aria-label={t("account.preferences.language")} className="-mr-2 flex items-center">
                {LANGUAGES.map((l, i) => (
                  <span key={l.code} className="flex items-center">
                    {i > 0 && <span className="text-[11px] text-muted-foreground" aria-hidden="true">·</span>}
                    <button
                      type="button"
                      onClick={() => chooseLanguage(l.code)}
                      aria-pressed={language === l.code}
                      aria-label={l.label}
                      className={`min-w-[44px] min-h-[44px] px-2 text-[13px] font-semibold tracking-wide transition-colors ${
                        language === l.code ? "text-foreground underline underline-offset-[5px]" : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {l.code.toUpperCase()}
                    </button>
                  </span>
                ))}
              </div>
            </div>
          </Section>

          {/* Privacy */}
          <Section id="profile-privacy" title={t("account.privacy.title")} delay={240}>
            <LinkRow onClick={downloadData} busy={exporting} label={exporting ? t("account.privacy.preparing") : t("account.privacy.download")} detail={t("account.privacy.downloadHint")} />
            <LinkRow onClick={() => setDialog("anonymize")} label={t("account.privacy.anonymize")} detail={t("account.privacy.anonymizeHint")} />
            <div className="py-3">
              <button
                type="button"
                onClick={() => {
                  setDeleteEmail("");
                  setDialog("delete");
                }}
                className="-ml-0.5 min-h-[44px] text-[14px] font-semibold text-destructive hover:underline underline-offset-4"
              >
                {t("account.privacy.delete")}
              </button>
            </div>
          </Section>
        </div>
      </main>
      <Footer />

      <AlertDialog open={dialog !== null} onOpenChange={(open) => !open && !dialogBusy && setDialog(null)}>
        <AlertDialogContent className="theme-night">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {dialog === "signout" ? t("account.security.signOutAllTitle") : dialog === "anonymize" ? t("account.privacy.anonymizeTitle") : t("account.privacy.deleteTitle")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {dialog === "signout" ? t("account.security.signOutAllBody") : dialog === "anonymize" ? t("account.privacy.anonymizeBody") : t("account.privacy.deleteBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {dialog === "delete" && (
            <div>
              <label htmlFor="delete-email" className="text-[13px] text-muted-foreground">
                {t("account.privacy.deleteType", { email })}
              </label>
              <Input id="delete-email" type="email" autoComplete="off" value={deleteEmail} onChange={(e) => setDeleteEmail(e.target.value)} className="mt-1.5 h-12 text-base" />
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={dialogBusy} className="min-h-[44px]">
              {t("account.common.cancel")}
            </AlertDialogCancel>
            <AlertDialogAction asChild>
              <Button
                variant={dialog === "signout" ? "primary" : "destructive"}
                className="min-h-[44px] gap-2"
                disabled={dialogBusy || (dialog === "delete" && deleteEmail.trim().toLowerCase() !== email.toLowerCase())}
                onClick={(e) => {
                  e.preventDefault();
                  void confirmDialog();
                }}
              >
                {dialogBusy && <Loader2 className="w-4 h-4 animate-spin" />}
                {dialog === "signout" ? t("account.security.signOutAllConfirm") : dialog === "anonymize" ? t("account.privacy.anonymizeConfirm") : t("account.privacy.deleteConfirm")}
              </Button>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Profile;
