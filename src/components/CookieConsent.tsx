import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Cookie } from "lucide-react";
import { useI18n } from "@/contexts/I18nContext";

/**
 * Cookie notice. Ticket Safe only stores what the site needs to work (sign-in, payment security,
 * the language and theme you pick, your cookie choice): under the ePrivacy rules (art. 82 of the
 * French Data Protection Act, CNIL guidelines of 17 Sept. 2020) those need no consent, so this is a
 * notice with one "OK", not an accept/refuse choice. There are no analytics or advertising trackers.
 *
 * If an optional tracker (analytics, ads, pixel) is ever added, it must only load after a real
 * opt-in: bring back Accept / Refuse buttons of equal weight here, off by default, and list the
 * tracker in /cookie-policy first.
 */

const NOTICE_KEY = "ticketsafe_cookie_consent";
/** Bump when what the site stores changes, so everyone sees the notice again. */
const NOTICE_VERSION = "2026-11-12";
/** CNIL: ask again after 13 months at most. */
const MAX_AGE_MS = 395 * 24 * 60 * 60 * 1000;
export const OPEN_COOKIE_SETTINGS_EVENT = "ticketsafe:open-cookie-settings";

const COPY = {
  en: {
    bar: "Ticket Safe only uses what's needed to run the site: keeping you signed in, payment security and your language. No ads, no tracking.",
    more: "Learn more",
    details: "Details",
    ok: "OK",
    title: "Cookies on Ticket Safe",
    intro: "This is everything Ticket Safe stores on your device. None of it needs your consent, and none of it is shared with advertisers.",
    necessary: "Strictly necessary",
    always: "Always on",
    necessaryText: "Sign-in, protection against fraud and forged requests, payment by Stripe, and the language, theme and cookie choice you pick.",
    analytics: "Audience measurement",
    analyticsText: "Not used. Ticket Safe does not measure your visits with Google Analytics or any similar tool.",
    ads: "Advertising",
    adsText: "Not used. No ads, no tracking across other sites, no Meta or TikTok pixel.",
    notUsed: "Not used",
    footer: "Full list in the",
    policy: "Cookie Policy",
  },
  fr: {
    bar: "Ticket Safe n'utilise que ce qui est nécessaire au site : rester connecté, sécuriser le paiement et retenir votre langue. Ni publicité, ni pistage.",
    more: "En savoir plus",
    details: "Détails",
    ok: "OK",
    title: "Les cookies sur Ticket Safe",
    intro: "Voici tout ce que Ticket Safe enregistre sur votre appareil. Rien de tout cela ne demande votre consentement, et rien n'est partagé avec des annonceurs.",
    necessary: "Strictement nécessaires",
    always: "Toujours actifs",
    necessaryText: "Connexion, protection contre la fraude et les requêtes falsifiées, paiement par Stripe, et la langue, le thème et le choix de cookies que vous avez faits.",
    analytics: "Mesure d'audience",
    analyticsText: "Non utilisée. Ticket Safe ne mesure pas vos visites avec Google Analytics ni aucun outil équivalent.",
    ads: "Publicité",
    adsText: "Non utilisée. Pas de publicité, pas de pistage sur d'autres sites, pas de pixel Meta ou TikTok.",
    notUsed: "Non utilisé",
    footer: "Liste complète dans la",
    policy: "Politique de cookies",
  },
  es: {
    bar: "Ticket Safe solo usa lo necesario para funcionar: mantener tu sesión, proteger el pago y recordar tu idioma. Sin publicidad ni seguimiento.",
    more: "Más información",
    details: "Detalles",
    ok: "OK",
    title: "Cookies en Ticket Safe",
    intro: "Esto es todo lo que Ticket Safe guarda en tu dispositivo. Nada de ello requiere tu consentimiento ni se comparte con anunciantes.",
    necessary: "Estrictamente necesarias",
    always: "Siempre activas",
    necessaryText: "Inicio de sesión, protección contra el fraude y las peticiones falsificadas, pago con Stripe, y el idioma, el tema y la elección de cookies que hayas hecho.",
    analytics: "Medición de audiencia",
    analyticsText: "No se usa. Ticket Safe no mide tus visitas con Google Analytics ni con ninguna herramienta similar.",
    ads: "Publicidad",
    adsText: "No se usa. Sin anuncios, sin seguimiento en otros sitios, sin píxel de Meta o TikTok.",
    notUsed: "No se usa",
    footer: "Lista completa en la",
    policy: "Política de cookies",
  },
} as const;

function noticeSeen(): boolean {
  try {
    const raw = localStorage.getItem(NOTICE_KEY);
    if (!raw) return false;
    const saved = JSON.parse(raw) as { version?: string; at?: number };
    return saved.version === NOTICE_VERSION && typeof saved.at === "number" && Date.now() - saved.at < MAX_AGE_MS;
  } catch {
    return false;
  }
}

export const CookieConsent = () => {
  const { language } = useI18n();
  const c = COPY[language] ?? COPY.en;
  const [showBanner, setShowBanner] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  // The footer's "Cookie settings" link opens the details at any time.
  useEffect(() => {
    const open = () => setShowDetails(true);
    window.addEventListener(OPEN_COOKIE_SETTINGS_EVENT, open);
    return () => window.removeEventListener(OPEN_COOKIE_SETTINGS_EVENT, open);
  }, []);

  useEffect(() => {
    if (noticeSeen()) return;
    const id = window.setTimeout(() => setShowBanner(true), 1000);
    return () => window.clearTimeout(id);
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(NOTICE_KEY, JSON.stringify({ version: NOTICE_VERSION, at: Date.now() }));
      localStorage.removeItem("ticketsafe_cookie_preferences"); // left over from the old banner
    } catch {
      /* private mode: show the notice again next visit */
    }
    setShowBanner(false);
    setShowDetails(false);
  };

  const Row = ({ title, text, on, badge }: { title: string; text: string; on: boolean; badge: string }) => (
    <div className={`border border-border rounded-lg p-4 ${on ? "bg-muted/30" : ""}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1.5">
            <h4 className="font-semibold text-sm">{title}</h4>
            <span className="text-[10px] font-bold uppercase bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{badge}</span>
          </div>
          <p className="text-xs text-muted-foreground">{text}</p>
        </div>
        <Switch checked={on} disabled aria-label={title} className="opacity-50" />
      </div>
    </div>
  );

  return (
    <>
      {showBanner && (
        <div
          role="region"
          aria-label={c.title}
          className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card/95 backdrop-blur-sm shadow-hover animate-in slide-in-from-bottom duration-300"
        >
          <div className="container mx-auto px-4 py-3 md:py-3.5 flex flex-col md:flex-row md:items-center gap-2.5 md:gap-4">
            <div className="flex items-start md:items-center gap-2.5 flex-1 min-w-0">
              <Cookie className="w-5 h-5 text-primary shrink-0" aria-hidden />
              <p className="text-xs md:text-sm text-foreground leading-snug">
                {c.bar}{" "}
                <Link to="/cookie-policy" className="text-primary hover:underline whitespace-nowrap">{c.more}</Link>
              </p>
            </div>
            <div className="flex items-center gap-2 md:gap-3 shrink-0 self-end md:self-auto">
              <Button variant="outline" size="sm" onClick={() => setShowDetails(true)}>{c.details}</Button>
              <Button variant="primary" size="sm" onClick={dismiss} className="min-w-[64px]">{c.ok}</Button>
            </div>
          </div>
        </div>
      )}

      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cookie className="w-5 h-5 text-primary" aria-hidden />
              {c.title}
            </DialogTitle>
            <DialogDescription>{c.intro}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            <Row title={c.necessary} text={c.necessaryText} on badge={c.always} />
            <Row title={c.analytics} text={c.analyticsText} on={false} badge={c.notUsed} />
            <Row title={c.ads} text={c.adsText} on={false} badge={c.notUsed} />
          </div>

          <DialogFooter>
            <Button variant="primary" size="sm" onClick={dismiss} className="w-full">{c.ok}</Button>
          </DialogFooter>

          <p className="text-[11px] text-muted-foreground text-center">
            {c.footer}{" "}
            <Link to="/cookie-policy" onClick={() => setShowDetails(false)} className="text-primary hover:underline">{c.policy}</Link>
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
};
