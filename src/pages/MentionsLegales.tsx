import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SEOHead } from "@/components/SEOHead";
import { Scale } from "lucide-react";
import { LEGAL_UPDATED, formatLegalDate } from "@/lib/legalDates";
import { useI18n } from "@/contexts/I18nContext";
import { LegalNoticeBodyFr } from "./MentionsLegales.fr";

/**
 * /mentions-legales — French statutory legal notice page (LCEN Art. 19 +
 * Code de la consommation Art. L111-1 + R123-237 du Code de commerce).
 *
 * Required content for any French commercial website:
 *   1. Identité de l'éditeur (forme, dénomination, capital, RCS, siège, TVA)
 *   2. Directeur de la publication
 *   3. Hébergeur (nom, adresse, téléphone)
 *   4. Coordonnées de contact
 *   5. Propriété intellectuelle
 *   6. Données personnelles (renvoi vers la Privacy Policy)
 *   7. Cookies (renvoi vers la Cookie Policy)
 *   8. Médiation de la consommation (obligation pour le e-commerce B2C)
 *
 * The binding French text (MentionsLegales.fr.tsx) is shown when the visitor
 * has chosen French. Every other language gets the English translation below,
 * which says that the French version is the binding one.
 */
const MentionsLegales = () => {
  const location = useLocation();
  const { language } = useI18n();
  const isFrench = language === "fr";

  useEffect(() => {
    if (location.hash) {
      const element = document.querySelector(location.hash);
      if (element) element.scrollIntoView({ behavior: "smooth" });
    } else {
      window.scrollTo(0, 0);
    }
  }, [location]);

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead
        title={isFrench ? "Mentions légales - Ticket Safe" : "Legal Notice - Ticket Safe"}
        description={
          isFrench
            ? "Mentions légales de Ticket Safe SAS — éditeur, hébergeur, directeur de publication, RCS, TVA et coordonnées."
            : "Legal notice of Ticket Safe SAS — publisher, host, publication director, company registration, VAT and contact details."
        }
      />
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <BackButton />

          <div className="mt-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Scale className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold">{isFrench ? "Mentions légales" : "Legal Notice"}</h1>
            </div>
            <p className="text-muted-foreground">
              {isFrench
                ? `Dernière mise à jour : ${formatLegalDate(LEGAL_UPDATED.legalNotice, "fr-FR")}`
                : `Last updated: ${formatLegalDate(LEGAL_UPDATED.legalNotice)}`}
            </p>
            {!isFrench && (
              <p className="text-sm text-muted-foreground italic mt-3 pt-3 border-t border-border/60">
                This page is the statutory legal notice of Ticket Safe SAS under
                French law (LCEN Art. 19). It is an English translation provided
                for convenience; the French version, shown when the site
                language is set to French, is the legally binding text. Users in
                the United Kingdom are also covered by the UK GDPR and the Data
                Protection Act 2018, and may complain to the Information
                Commissioner's Office (ico.org.uk). For information on personal
                data, see the{" "}
                <Link to="/privacy" className="text-primary hover:underline">
                  Privacy Policy
                </Link>
                ; for cookies see the{" "}
                <Link to="/cookie-policy" className="text-primary hover:underline">
                  Cookie Policy
                </Link>
                .
              </p>
            )}
          </div>

          {isFrench ? (
            <LegalNoticeBodyFr />
          ) : (
          <Card>
            <CardContent className="p-6 md:p-10 space-y-8">
              {/* 1 — Publisher */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">1. Website publisher</h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    The website{" "}
                    <strong className="text-foreground">ticket-safe.eu</strong>{" "}
                    (the "Site") is published by:
                  </p>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-1 text-sm">
                    <p>
                      <strong className="text-foreground">Ticket Safe SAS</strong>{" "}
                      — French simplified joint-stock company (SAS)
                    </p>
                    <p>Share capital: €1,000</p>
                    <p>Registered office: 2 rue Wilhem, 75016 Paris, France</p>
                    <p>
                      Registered with the Paris Trade and Companies Register (RCS) under number{" "}
                      <strong className="text-foreground">105 533 632</strong>
                    </p>
                    <p>Management number: 2026B27032</p>
                    <p>
                      VAT:{" "}
                      <strong className="text-foreground">
                        not applicable, article 293 B of the French General Tax Code
                      </strong>
                    </p>
                    <p>European Unique Identifier (EUID): FR7501.105533632</p>
                  </div>
                </div>
              </section>

              <Separator />

              {/* 2 — Publication */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">2. Publication director</h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    <strong className="text-foreground">Publication director:</strong>{" "}
                    Adrien Menard, President of Ticket Safe SAS.
                  </p>
                  <p>
                    <strong className="text-foreground">Managing director:</strong>{" "}
                    Achille Quinquenel.
                  </p>
                </div>
              </section>

              <Separator />

              {/* 3 — Host */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">3. Hosting provider</h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    The Site is hosted by GitHub Pages:
                  </p>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-1 text-sm">
                    <p>
                      <strong className="text-foreground">GitHub, Inc.</strong>
                    </p>
                    <p>88 Colin P. Kelly Jr. Street, San Francisco, CA 94107, United States</p>
                    <p>
                      Website:{" "}
                      <a
                        href="https://github.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        github.com
                      </a>
                    </p>
                  </div>
                  <p className="text-sm">
                    The database and server functions are operated by Supabase
                    Inc. (US — EU Frankfurt region for Ticket Safe's data). The
                    full list of sub-processors and their contractual safeguards
                    is in the{" "}
                    <Link to="/privacy" className="text-primary hover:underline">
                      Privacy Policy, section 4.2
                    </Link>
                    .
                  </p>
                </div>
              </section>

              <Separator />

              {/* 4 — Contact */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">4. Contact</h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>For any question about the Site or the services provided:</p>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-1 text-sm">
                    <p>
                      General support:{" "}
                      <a href="mailto:ticketsafe.friendly@gmail.com" className="text-primary hover:underline">
                        ticketsafe.friendly@gmail.com
                      </a>
                    </p>
                    <p>
                      Personal data (DPO):{" "}
                      <a href="mailto:dpo@ticket-safe.eu" className="text-primary hover:underline">
                        dpo@ticket-safe.eu
                      </a>
                    </p>
                    <p>Postal address: 2 rue Wilhem, 75016 Paris, France</p>
                  </div>
                </div>
              </section>

              <Separator />

              {/* 5 — Intellectual property */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">5. Intellectual property</h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>
                    All content on the Site (text, graphics, logos, icons,
                    images, videos, source code, database structure) is the
                    exclusive property of Ticket Safe SAS or its licensors, and
                    is protected by French and international copyright and
                    intellectual property law.
                  </p>
                  <p>
                    Any reproduction, representation, modification, publication,
                    transmission or distortion of all or part of the Site or its
                    content, by any means and on any medium, is prohibited
                    without the prior written consent of Ticket Safe SAS, and
                    constitutes an infringement punishable under articles L335-2
                    et seq. of the French Intellectual Property Code.
                  </p>
                  <p>
                    The "Ticket Safe" trade mark and its logo are the property of
                    Ticket Safe SAS.
                  </p>
                </div>
              </section>

              <Separator />

              {/* 6 — Personal data */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">6. Personal data</h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    The processing of Site users' personal data is governed by
                    our{" "}
                    <Link to="/privacy" className="text-primary hover:underline font-medium">
                      Privacy Policy
                    </Link>
                    , in accordance with Regulation (EU) 2016/679 of 27 April
                    2016 (GDPR) and the amended French Data Protection Act No.
                    78-17 of 6 January 1978. For users in the United Kingdom,
                    this processing is also subject to the UK GDPR and the Data
                    Protection Act 2018.
                  </p>
                  <p>
                    Under articles 15 to 22 of the GDPR, you have the right to
                    access, rectify, erase and port your data, and to object to
                    its processing. You can exercise these rights from{" "}
                    <Link to="/settings/privacy" className="text-primary hover:underline">
                      Settings → My Data &amp; Privacy
                    </Link>
                    , or by writing to{" "}
                    <a href="mailto:dpo@ticket-safe.eu" className="text-primary hover:underline">
                      dpo@ticket-safe.eu
                    </a>
                    .
                  </p>
                  <p>
                    You may also complain to the CNIL, the French data
                    protection authority (
                    <a href="https://www.cnil.fr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      cnil.fr
                    </a>
                    ), if a disagreement persists. Users in the United Kingdom
                    may complain to the Information Commissioner's Office (
                    <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      ico.org.uk
                    </a>
                    ).
                  </p>
                </div>
              </section>

              <Separator />

              {/* 7 — Cookies */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">7. Cookies</h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    The use of cookies on the Site is described in our{" "}
                    <Link to="/cookie-policy" className="text-primary hover:underline font-medium">
                      Cookie Policy
                    </Link>
                    . You can change your preferences at any time from the
                    "Manage cookies" link at the bottom of the page.
                  </p>
                </div>
              </section>

              <Separator />

              {/* 8 — Consumer mediation */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">8. Consumer mediation</h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    Under articles L611-1 et seq. of the French Consumer Code,
                    if a dispute with a consumer cannot be settled by our
                    customer service, the user may use a consumer mediator free
                    of charge.
                  </p>
                  <p>Ticket Safe SAS is a member of the following mediation service:</p>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-1 text-sm">
                    <p>
                      <strong className="text-foreground">
                        CMAP – Paris Mediation and Arbitration Centre
                      </strong>
                    </p>
                    <p>39 avenue Franklin D. Roosevelt, 75008 Paris</p>
                    <p>
                      <a href="https://www.cmap.fr" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                        cmap.fr
                      </a>
                    </p>
                  </div>
                </div>
              </section>

              <Separator />

              {/* 9 — Governing law */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">9. Governing law and jurisdiction</h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    This legal notice is governed by French law. In the event of
                    a dispute, and after an attempt at amicable resolution, the
                    French courts alone have jurisdiction, subject to the
                    mandatory jurisdiction rules that apply to consumers.
                    Consumers living in the United Kingdom keep the protection
                    of the mandatory provisions of UK consumer law and may bring
                    proceedings in the courts of the part of the United Kingdom
                    where they live.
                  </p>
                </div>
              </section>
            </CardContent>
          </Card>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default MentionsLegales;
