import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Cookie, X, Settings } from "lucide-react";

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

    // Handle other cookie categories as needed
    console.log('Cookie preferences applied:', prefs);
  };

  if (!showBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6 animate-in slide-in-from-bottom duration-500">
      <Card className="max-w-5xl mx-auto shadow-2xl border-2">
        <CardContent className="p-6">
          {!showSettings ? (
            // Simple Banner View
            <div className="flex flex-col md:flex-row items-start md:items-center gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Cookie className="w-8 h-8 text-primary flex-shrink-0 mt-1" />
                <div>
                  <h3 className="font-semibold text-lg mb-2">We Value Your Privacy</h3>
                  <p className="text-sm text-muted-foreground">
                    We use cookies to enhance your experience, analyze site usage, and provide secure services.
                    Essential cookies are required for the platform to function. You can customize your preferences or accept all cookies.
                  </p>
                  <Link
                    to="/cookie-policy"
                    className="text-xs text-primary hover:underline inline-block mt-2"
                  >
                    Learn more about our cookie policy
                  </Link>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSettings(true)}
                  className="w-full sm:w-auto"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Customize
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={acceptNecessary}
                  className="w-full sm:w-auto"
                >
                  Necessary Only
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={acceptAll}
                  className="w-full sm:w-auto"
                >
                  Accept All
                </Button>
              </div>
            </div>
          ) : (
            // Detailed Settings View
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Cookie className="w-6 h-6 text-primary" />
                  <h3 className="font-semibold text-lg">Cookie Preferences</h3>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettings(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>

              <p className="text-sm text-muted-foreground">
                Choose which types of cookies you want to allow. Essential cookies are always enabled.
              </p>

              <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {/* Necessary Cookies */}
                <div className="border rounded-lg p-4 bg-muted/20">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h4 className="font-semibold">Strictly Necessary</h4>
                        <span className="text-xs bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 px-2 py-0.5 rounded">
                          Always Active
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Essential for the website to function. Includes authentication, security, and payment processing. Cannot be disabled.
                      </p>
                    </div>
                    <Switch
                      checked={true}
                      disabled={true}
                      className="opacity-50"
                    />
                  </div>
                </div>

                {/* Functional Cookies */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Functional</h4>
                      <p className="text-sm text-muted-foreground">
                        Remember your preferences like theme (dark/light mode), language, and recently viewed tickets. Enhances your user experience.
                      </p>
                    </div>
                    <Switch
                      checked={preferences.functional}
                      onCheckedChange={(checked) =>
                        setPreferences({ ...preferences, functional: checked })
                      }
                    />
                  </div>
                </div>

                {/* Analytics Cookies */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Analytics & Performance</h4>
                      <p className="text-sm text-muted-foreground">
                        Help us understand how you use the platform through anonymized data. Allows us to improve features and user experience.
                      </p>
                    </div>
                    <Switch
                      checked={preferences.analytics}
                      onCheckedChange={(checked) =>
                        setPreferences({ ...preferences, analytics: checked })
                      }
                    />
                  </div>
                </div>

                {/* Marketing Cookies */}
                <div className="border rounded-lg p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Marketing & Advertising</h4>
                      <p className="text-sm text-muted-foreground">
                        Currently not used. TicketSafe does not track you across websites or display targeted ads.
                      </p>
                    </div>
                    <Switch
                      checked={false}
                      disabled={true}
                      className="opacity-50"
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={acceptNecessary}
                  className="w-full sm:flex-1"
                >
                  Reject All Optional
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={saveCustomPreferences}
                  className="w-full sm:flex-1"
                >
                  Save My Preferences
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={acceptAll}
                  className="w-full sm:flex-1"
                >
                  Accept All Cookies
                </Button>
              </div>

              <p className="text-xs text-muted-foreground text-center">
                You can change your preferences at any time in our{' '}
                <Link to="/cookie-policy" className="text-primary hover:underline">
                  Cookie Policy
                </Link>
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

// Type declaration for window.gtag
declare global {
  interface Window {
    gtag?: (...args: any[]) => void;
  }
}
