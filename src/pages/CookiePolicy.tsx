import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SEOHead } from "@/components/SEOHead";
import { Cookie, Settings, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LEGAL_UPDATED, formatLegalDate } from "@/lib/legalDates";
import { OPEN_COOKIE_SETTINGS_EVENT } from "@/components/CookieConsent";

const CookiePolicy = () => {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const element = document.querySelector(location.hash);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  const handleManageCookies = () => window.dispatchEvent(new Event(OPEN_COOKIE_SETTINGS_EVENT));

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        titleKey="Cookie Policy - TicketSafe"
        descriptionKey="Learn about how TicketSafe uses cookies and similar technologies. Manage your cookie preferences and understand your privacy options."
      />
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <BackButton />

          <div className="mt-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Cookie className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold">Cookie Policy</h1>
            </div>
            <p className="text-muted-foreground">
              Last updated: {formatLegalDate(LEGAL_UPDATED.cookies)}
            </p>
          </div>

          {/* Manage Cookies Button */}
          <Card className="mb-6 bg-primary/5 border-primary/20">
            <CardContent className="pt-6">
              <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Settings className="h-5 w-5 text-primary mt-1" />
                  <div>
                    <h3 className="font-semibold mb-1">Manage Your Cookie Preferences</h3>
                    <p className="text-sm text-muted-foreground">
                      You can change your cookie settings at any time.
                    </p>
                  </div>
                </div>
                <Button onClick={handleManageCookies} variant="default">
                  Cookie Settings
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="space-y-8">
                {/* Introduction */}
                <section>
                  <h2 className="text-2xl font-semibold mb-4">1. What Are Cookies?</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      Cookies are small text files that are placed on your device (computer, smartphone, or tablet) when you visit a website. They are widely used to make websites work more efficiently and provide information to website owners.
                    </p>
                    <p>
                      Ticket Safe uses a few similar technologies (local storage and session storage) so the site works: they are listed in full below.
                    </p>
                    <p>
                      <strong className="text-foreground">Legal framework:</strong> In the European Union, cookies are governed by the ePrivacy Directive (2002/58/EC), implemented in France by article 82 of the French Data Protection Act. In the United Kingdom, they are governed by the Privacy and Electronic Communications (EC Directive) Regulations 2003 ("PECR"). Under both, strictly necessary cookies can be used without consent, but every other cookie or similar technology (functional, analytics, marketing) is only set once you have given your consent, and you can withdraw that consent at any time. Where cookies involve personal data, the EU GDPR or the UK GDPR also applies (see our Privacy Policy).
                    </p>
                  </div>
                </section>

                <Separator />

                {/* How We Use Cookies */}
                <section id="usage">
                  <div className="flex items-start gap-3 mb-4">
                    <Info className="h-6 w-6 text-primary mt-1" />
                    <h2 className="text-2xl font-semibold">2. How We Use Cookies</h2>
                  </div>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      Ticket Safe only stores what the site needs to work: keeping you signed in, protecting accounts and
                      payments against fraud, and remembering the choices you make (language, theme, this cookie notice).
                    </p>
                    <p>
                      Under article 82 of the French Data Protection Act and the CNIL's guidelines, and under PECR in the
                      United Kingdom, these strictly necessary trackers do not need your consent. That is why our banner
                      only informs you and has no "Accept" or "Refuse" button: there is nothing optional to accept.
                    </p>
                    <p>
                      <strong className="text-foreground">We do not use</strong> audience measurement (no Google
                      Analytics or similar), advertising cookies, social-media pixels (Meta, TikTok, Snapchat) or any
                      tracking across other websites. If we ever add one, it will only load after you have said yes, and
                      we will update this page first.
                    </p>
                  </div>
                </section>

                <Separator />

                {/* What we store */}
                <section id="types">
                  <h2 className="text-2xl font-semibold mb-4">3. Everything We Store on Your Device</h2>
                  <p className="text-muted-foreground mb-4">
                    Ticket Safe uses your browser's local storage and session storage rather than classic cookies. They
                    work the same way in law, so they are all listed here. Session storage is cleared when you close the
                    tab; local storage stays until you sign out, clear it, or the duration shown.
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 pr-3 font-semibold">Name</th>
                          <th className="text-left py-2 pr-3 font-semibold">Purpose</th>
                          <th className="text-left py-2 font-semibold">Kept</th>
                        </tr>
                      </thead>
                      <tbody className="text-muted-foreground">
                        {[
                          ["sb-…-auth-token", "Keeps you signed in to your account (Supabase)", "Until you sign out"],
                          ["csrf_token", "Security: blocks forged requests sent from other sites", "Until the tab is closed"],
                          ["secure_* and its key", "Encrypts sensitive data kept in your browser", "Until the tab is closed"],
                          ["lang", "The language you chose", "Until you change it"],
                          ["theme", "Light or dark mode, if you chose one", "Until you change it"],
                          ["notifications", "Your notification settings", "Until you change them"],
                          ["ts.interest.<event>", "Counts you once in an event's “interested” number; no identifier is sent", "Until the tab is closed"],
                          ["ticketsafe_cookie_consent", "Remembers that you've seen this notice", "13 months"],
                        ].map(([name, purpose, kept]) => (
                          <tr key={name} className="border-b last:border-0 align-top">
                            <td className="py-2 pr-3 font-mono text-xs whitespace-nowrap">{name}</td>
                            <td className="py-2 pr-3">{purpose}</td>
                            <td className="py-2 whitespace-nowrap">{kept}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>

                <Separator />

                {/* Third-Party Cookies */}
                <section id="third-party">
                  <h2 className="text-2xl font-semibold mb-4">4. Third-Party Services</h2>
                  <div className="space-y-4 text-muted-foreground">
                    <div className="border border-border rounded-lg p-4">
                      <h4 className="font-semibold text-foreground mb-2">Stripe (payment)</h4>
                      <p className="text-sm mb-2">
                        When you pay, you are sent to Stripe's secure payment page. Stripe sets its own cookies there
                        (such as __stripe_mid and __stripe_sid) to prevent fraud. They are needed for the payment and
                        are governed by Stripe's own policy. Some events use Revolut's payment page instead, which applies its own cookies in the same way.
                      </p>
                      <p className="text-xs">
                        <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">stripe.com/privacy</a>
                        {" · "}
                        <a href="https://stripe.com/cookies-policy/legal" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">stripe.com/cookies-policy/legal</a>
                      </p>
                    </div>
                    <div className="border border-border rounded-lg p-4">
                      <h4 className="font-semibold text-foreground mb-2">Supabase (accounts and data)</h4>
                      <p className="text-sm mb-2">Hosts our database and sign-in. It sets no cookie of its own; the sign-in entry above is stored by our site.</p>
                      <p className="text-xs">
                        <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">supabase.com/privacy</a>
                      </p>
                    </div>
                    <div className="border border-border rounded-lg p-4">
                      <h4 className="font-semibold text-foreground mb-2">Links to other sites</h4>
                      <p className="text-sm">
                        Links such as "Open in Google Maps" take you to another site, which applies its own cookies.
                        Nothing from Google is loaded on Ticket Safe itself. Our fonts are served from our own site.
                      </p>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Managing Cookies */}
                <section id="manage">
                  <div className="flex items-start gap-3 mb-4">
                    <Settings className="h-6 w-6 text-primary mt-1" />
                    <h2 className="text-2xl font-semibold">5. How to Manage Cookies</h2>
                  </div>
                  <div className="space-y-3 text-muted-foreground">
                    <h3 className="font-semibold text-foreground text-lg">5.1 TicketSafe Cookie Settings</h3>
                    <p>
                      The “Cookie Settings” button at the top of this page, and the “Cookie settings” link at the bottom of every page, show what Ticket Safe stores. There is nothing optional to switch off, because only strictly necessary storage is used.
                    </p>

                    <h3 className="font-semibold text-foreground text-lg mt-4">5.2 Browser Settings</h3>
                    <p>
                      Most web browsers allow you to control cookies through their settings. You can:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li>Block all cookies</li>
                      <li>Delete existing cookies</li>
                      <li>Allow cookies only from trusted websites</li>
                      <li>Block third-party cookies</li>
                    </ul>
                    <p className="mt-3">
                      Learn how to manage cookies in popular browsers:
                    </p>
                    <ul className="list-disc pl-6 space-y-1 text-sm">
                      <li><a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Google Chrome</a></li>
                      <li><a href="https://support.mozilla.org/en-US/kb/enhanced-tracking-protection-firefox-desktop" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Mozilla Firefox</a></li>
                      <li><a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Safari</a></li>
                      <li><a href="https://support.microsoft.com/en-us/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Microsoft Edge</a></li>
                    </ul>

                    <h3 className="font-semibold text-foreground text-lg mt-4">5.3 Impact of Blocking Cookies</h3>
                    <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                      <p className="text-sm text-amber-900 dark:text-amber-100">
                        <Info className="w-4 h-4 inline mr-1" />
                        Please note that blocking or deleting cookies may impact your experience on TicketSafe. Essential features like login, payments, and ticket purchases require cookies to function properly.
                      </p>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Do Not Track */}
                <section id="dnt">
                  <h2 className="text-2xl font-semibold mb-4">6. Do Not Track Signals</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      Some browsers offer a "Do Not Track" (DNT) signal. Currently, there is no industry standard for responding to DNT signals. We do not track users across third-party websites and do not sell personal data to advertisers.
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Updates */}
                <section id="updates">
                  <h2 className="text-2xl font-semibold mb-4">7. Updates to This Policy</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      We may update this Cookie Policy from time to time to reflect changes in our practices or legal requirements. When we make significant changes, we will notify you via email or a prominent notice on our platform.
                    </p>
                    <p>
                      The "Last Updated" date at the top of this page indicates when the policy was last revised.
                    </p>
                  </div>
                </section>

                <Separator />

                {/* Contact */}
                <section id="contact">
                  <h2 className="text-2xl font-semibold mb-4">8. Questions About Cookies</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      If you have questions about our use of cookies or this Cookie Policy, please contact us:
                    </p>
                    <div className="bg-muted/50 p-4 rounded-lg space-y-1">
                      <p className="font-medium text-foreground">TicketSafe Privacy Team</p>
                      <p>Email: ticketsafe.friendly@gmail.com</p>
                      <p>Subject: Cookie Policy Inquiry</p>
                    </div>
                  </div>
                </section>
              </div>
            </CardContent>
          </Card>

          <div className="text-center text-sm text-muted-foreground mb-8">
            <p>Ticket Safe only uses the strictly necessary storage listed above. No analytics, advertising or tracking cookies are used.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CookiePolicy;
