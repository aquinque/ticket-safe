import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Cookie } from "lucide-react";

interface CookiePreferences {
  necessary: boolean;
  functional: boolean;
  analytics: boolean;
  marketing: boolean;
}

const COOKIE_CONSENT_KEY = 'ticketsafe_cookie_consent';
const COOKIE_PREFERENCES_KEY = 'ticketsafe_cookie_preferences';

export const CookieConsent = () => {
  const [showBanner, setShowBanner] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>({
    necessary: true, // Always true, can't be disabled
    functional: true,
    analytics: false,
    marketing: false,
  });

  useEffect(() => {
    // Check if user has already made a choice
    const consent = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (!consent) {
      // Show banner after a short delay for better UX
      setTimeout(() => setShowBanner(true), 1000);
    } else {
      // Load saved preferences
      const savedPrefs = localStorage.getItem(COOKIE_PREFERENCES_KEY);
      if (savedPrefs) {
        setPreferences(JSON.parse(savedPrefs));
      }
    }
  }, []);

  const savePreferences = (prefs: CookiePreferences) => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'true');
    localStorage.setItem(COOKIE_PREFERENCES_KEY, JSON.stringify(prefs));
    setPreferences(prefs);
    setShowBanner(false);
    setShowSettings(false);

    // Apply cookie preferences
    applyCookiePreferences(prefs);
  };

  const acceptAll = () => {
    const allAccepted: CookiePreferences = {
      necessary: true,
      functional: true,
      analytics: true,
      marketing: true,
    };
    savePreferences(allAccepted);
  };

  const acceptNecessary = () => {
    const necessaryOnly: CookiePreferences = {
      necessary: true,
      functional: false,
      analytics: false,
      marketing: false,
    };
    savePreferences(necessaryOnly);
  };

  const saveCustomPreferences = () => {
    savePreferences(preferences);
  };

  const applyCookiePreferences = (prefs: CookiePreferences) => {
    // Disable analytics if not consented
    if (!prefs.analytics && typeof window !== 'undefined') {
      // Disable Google Analytics if implemented
      if (window.gtag) {
        window.gtag('consent', 'update', {
          analytics_storage: 'denied',
        });
      }
    } else if (prefs.analytics && window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: 'granted',
      });
    }
  };

  if (!showBanner) {
    return null;
  }

  return (
    <>
      {/* Compact bar — one line of text + 3 actions, capped ~120px on
          mobile instead of the previous full-screen-ish modal card. */}
      <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[120px] md:max-h-none border-t border-border bg-card/95 backdrop-blur-sm shadow-hover animate-in slide-in-from-bottom duration-300">
        <div className="container mx-auto px-4 py-3 md:py-3.5 flex flex-col md:flex-row md:items-center gap-2.5 md:gap-4">
          <div className="flex items-start md:items-center gap-2.5 flex-1 min-w-0">
            <Cookie className="w-5 h-5 text-primary shrink-0" />
            <p className="text-xs md:text-sm text-foreground leading-snug line-clamp-2 md:line-clamp-1">
              We use cookies to run TicketSafe and, with your consent, to measure usage.{" "}
              <Link to="/cookie-policy" className="text-primary hover:underline whitespace-nowrap">
                Learn more
              </Link>
            </p>
          </div>

          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="text-xs md:text-sm font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 whitespace-nowrap"
            >
              Customize
            </button>
            <Button variant="outline" size="sm" onClick={acceptNecessary} className="whitespace-nowrap">
              Refuse
            </Button>
            <Button variant="primary" size="sm" onClick={acceptAll} className="whitespace-nowrap">
              Accept All
            </Button>
          </div>
        </div>
      </div>

      {/* Detailed preferences — opened from "Customize", keeps the bar
          itself compact at all times. */}
      <Dialog open={showSettings} onOpenChange={setShowSettings}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cookie className="w-5 h-5 text-primary" />
              Cookie Preferences
            </DialogTitle>
            <DialogDescription>
              Choose which types of cookies you want to allow. Essential cookies are always enabled.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-1">
            <div className="border border-border rounded-lg p-4 bg-muted/30">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1.5">
                    <h4 className="font-semibold text-sm">Strictly Necessary</h4>
                    <span className="text-[10px] font-bold uppercase bg-danger/10 text-danger px-2 py-0.5 rounded-full">
                      Always Active
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Essential for the website to function — authentication, security, payment processing. Cannot be disabled.
                  </p>
                </div>
                <Switch checked disabled className="opacity-50" />
              </div>
            </div>

            <div className="border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1.5">Functional</h4>
                  <p className="text-xs text-muted-foreground">
                    Remembers your preferences — language, recently viewed tickets.
                  </p>
                </div>
                <Switch
                  checked={preferences.functional}
                  onCheckedChange={(checked) => setPreferences({ ...preferences, functional: checked })}
                />
              </div>
            </div>

            <div className="border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1.5">Analytics & Performance</h4>
                  <p className="text-xs text-muted-foreground">
                    Anonymized usage data, helps us improve the platform.
                  </p>
                </div>
                <Switch
                  checked={preferences.analytics}
                  onCheckedChange={(checked) => setPreferences({ ...preferences, analytics: checked })}
                />
              </div>
            </div>

            <div className="border border-border rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h4 className="font-semibold text-sm mb-1.5">Marketing & Advertising</h4>
                  <p className="text-xs text-muted-foreground">
                    Currently not used. TicketSafe does not track you across sites or show targeted ads.
                  </p>
                </div>
                <Switch checked={false} disabled className="opacity-50" />
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" size="sm" onClick={acceptNecessary} className="w-full sm:flex-1">
              Reject Optional
            </Button>
            <Button variant="primary" size="sm" onClick={saveCustomPreferences} className="w-full sm:flex-1">
              Save Preferences
            </Button>
          </DialogFooter>

          <p className="text-[11px] text-muted-foreground text-center">
            You can change this anytime in our{' '}
            <Link to="/cookie-policy" className="text-primary hover:underline">
              Cookie Policy
            </Link>
          </p>
        </DialogContent>
      </Dialog>
    </>
  );
};

// Type declaration for window.gtag
declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}
