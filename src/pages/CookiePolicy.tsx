import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SEOHead } from "@/components/SEOHead";
import { Cookie, Shield, Settings, Info } from "lucide-react";
import { Button } from "@/components/ui/button";

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

  const handleManageCookies = () => {
    // This will trigger the cookie consent banner to reappear
    localStorage.removeItem('ticketsafe_cookie_consent');
    window.location.reload();
  };

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
              Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
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
                      TicketSafe uses cookies and similar technologies (such as local storage, session storage, and pixels) to enhance your experience, improve our services, and understand how our platform is used.
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
                      We use cookies for the following purposes:
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                      <li><strong>Essential functionality:</strong> To enable core features like authentication, security, and payment processing</li>
                      <li><strong>User preferences:</strong> To remember your settings, language preferences, and theme choices</li>
                      <li><strong>Analytics:</strong> To understand how users interact with our platform and improve our services</li>
                      <li><strong>Security:</strong> To detect and prevent fraudulent activity and protect user accounts</li>
                      <li><strong>Performance:</strong> To optimize page load times and user experience</li>
                    </ul>
                  </div>
                </section>

                <Separator />

                {/* Types of Cookies */}
                <section id="types">
                  <h2 className="text-2xl font-semibold mb-4">3. Types of Cookies We Use</h2>

                  <div className="space-y-6">
                    {/* Strictly Necessary */}
                    <div className="border-l-4 border-red-500 pl-4">
                      <h3 className="font-semibold text-foreground text-lg mb-2">
                        3.1 Strictly Necessary Cookies (Always Active)
                      </h3>
                      <p className="text-muted-foreground mb-3">
                        These cookies are essential for the website to function and cannot be disabled. Without these cookies, services you have requested (like authentication or payment processing) cannot be provided.
                      </p>
                      <div className="bg-muted/50 rounded-lg p-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 font-semibold">Cookie Name</th>
                              <th className="text-left py-2 font-semibold">Purpose</th>
                              <th className="text-left py-2 font-semibold">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="text-muted-foreground">
                            <tr className="border-b">
                              <td className="py-2 font-mono text-xs">auth_token</td>
                              <td className="py-2">User authentication & session management</td>
                              <td className="py-2">Session</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-2 font-mono text-xs">sb-*-auth-token</td>
                              <td className="py-2">Supabase authentication (database access)</td>
                              <td className="py-2">7 days</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-2 font-mono text-xs">csrf_token</td>
                              <td className="py-2">Security - prevents cross-site request forgery</td>
                              <td className="py-2">Session</td>
                            </tr>
                            <tr>
                              <td className="py-2 font-mono text-xs">cookie_consent</td>
                              <td className="py-2">Stores your cookie preferences</td>
                              <td className="py-2">1 year</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Functional Cookies */}
                    <div className="border-l-4 border-blue-500 pl-4">
                      <h3 className="font-semibold text-foreground text-lg mb-2">
                        3.2 Functional Cookies
                      </h3>
                      <p className="text-muted-foreground mb-3">
                        These cookies enable enhanced functionality and personalization, such as remembering your preferences and settings.
                      </p>
                      <div className="bg-muted/50 rounded-lg p-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 font-semibold">Cookie Name</th>
                              <th className="text-left py-2 font-semibold">Purpose</th>
                              <th className="text-left py-2 font-semibold">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="text-muted-foreground">
                            <tr className="border-b">
                              <td className="py-2 font-mono text-xs">theme_preference</td>
                              <td className="py-2">Remembers dark/light mode setting</td>
                              <td className="py-2">1 year</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-2 font-mono text-xs">language</td>
                              <td className="py-2">Stores language preference (EN/FR)</td>
                              <td className="py-2">1 year</td>
                            </tr>
                            <tr>
                              <td className="py-2 font-mono text-xs">viewed_listings</td>
                              <td className="py-2">Tracks recently viewed tickets</td>
                              <td className="py-2">30 days</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Analytics Cookies */}
                    <div className="border-l-4 border-green-500 pl-4">
                      <h3 className="font-semibold text-foreground text-lg mb-2">
                        3.3 Analytics & Performance Cookies
                      </h3>
                      <p className="text-muted-foreground mb-3">
                        These cookies help us understand how visitors use our platform, which pages are most popular, and how we can improve user experience. All data collected is anonymized.
                      </p>
                      <div className="bg-muted/50 rounded-lg p-4">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left py-2 font-semibold">Cookie Name</th>
                              <th className="text-left py-2 font-semibold">Purpose</th>
                              <th className="text-left py-2 font-semibold">Duration</th>
                            </tr>
                          </thead>
                          <tbody className="text-muted-foreground">
                            <tr className="border-b">
                              <td className="py-2 font-mono text-xs">_ga</td>
                              <td className="py-2">Google Analytics - distinguishes users</td>
                              <td className="py-2">2 years</td>
                            </tr>
                            <tr className="border-b">
                              <td className="py-2 font-mono text-xs">_gid</td>
                              <td className="py-2">Google Analytics - distinguishes users</td>
                              <td className="py-2">24 hours</td>
                            </tr>
                            <tr>
                              <td className="py-2 font-mono text-xs">_gat</td>
                              <td className="py-2">Google Analytics - throttle request rate</td>
                              <td className="py-2">1 minute</td>
                            </tr>
                          </tbody>
                        </table>
                        <p className="text-xs text-muted-foreground mt-3">
                          Note: You can opt out of analytics cookies via our cookie settings.
                        </p>
                      </div>
                    </div>

                    {/* Marketing Cookies */}
                    <div className="border-l-4 border-purple-500 pl-4">
                      <h3 className="font-semibold text-foreground text-lg mb-2">
                        3.4 Marketing & Advertising Cookies
                      </h3>
                      <p className="text-muted-foreground mb-3">
                        Currently, TicketSafe does not use marketing or advertising cookies. We do not track you across other websites or display targeted ads.
                      </p>
                      <div className="bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                        <p className="text-sm text-green-900 dark:text-green-100">
                          <Shield className="w-4 h-4 inline mr-1" />
                          We respect your privacy and do not sell your data to third parties for advertising purposes.
                        </p>
                      </div>
                    </div>
                  </div>
                </section>

                <Separator />

                {/* Third-Party Cookies */}
                <section id="third-party">
                  <h2 className="text-2xl font-semibold mb-4">4. Third-Party Cookies</h2>
                  <div className="space-y-3 text-muted-foreground">
                    <p>
                      Some cookies are placed by third-party services that appear on our pages. We use the following trusted third-party services:
                    </p>
                    <div className="space-y-4">
                      <div className="bg-muted/50 p-4 rounded-lg">
                        <h4 className="font-semibold text-foreground mb-2">Supabase (Database & Authentication)</h4>
                        <p className="text-sm mb-2">Purpose: User authentication, data storage, and real-time features</p>
                        <p className="text-xs">Privacy Policy: <a href="https://supabase.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">https://supabase.com/privacy</a></p>
                      </div>

                      <div className="bg-muted/50 p-4 rounded-lg">
                        <h4 className="font-semibold text-foreground mb-2">Revolut Business / Stripe (Payment Processing)</h4>
                        <p className="text-sm mb-2">Purpose: Secure payment processing and transaction handling</p>
                        <p className="text-xs">
                          Revolut Privacy: <a href="https://www.revolut.com/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">revolut.com/legal/privacy</a><br/>
                          Stripe Privacy: <a href="https://stripe.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">stripe.com/privacy</a>
                        </p>
                      </div>

                      <div className="bg-muted/50 p-4 rounded-lg">
                        <h4 className="font-semibold text-foreground mb-2">Google Analytics (Optional)</h4>
                        <p className="text-sm mb-2">Purpose: Website analytics and user behavior insights (anonymized)</p>
                        <p className="text-xs">Privacy Policy: <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">policies.google.com/privacy</a></p>
                        <p className="text-xs mt-2 text-foreground">You can opt out of Google Analytics via our cookie settings.</p>
                      </div>
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
                      You can manage your cookie preferences using our Cookie Settings tool. Click the button at the top of this page to adjust your preferences.
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
            <p>By continuing to use TicketSafe, you consent to our use of cookies as described in this policy.</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default CookiePolicy;
