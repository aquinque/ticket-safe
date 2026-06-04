import { useEffect } from "react";
import { useLocation, Link } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { SEOHead } from "@/components/SEOHead";
import { Scale } from "lucide-react";

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
 * The page is published in French because the law itself targets a French
 * audience and the wording carries legal weight. A short English summary
 * sits at the top for non-French speakers, then the binding French text
 * follows below.
 */
const MentionsLegales = () => {
  const location = useLocation();

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
        titleKey="Mentions légales - Ticket Safe"
        descriptionKey="Mentions légales de Ticket Safe SAS — éditeur, hébergeur, directeur de publication, RCS, TVA et coordonnées."
      />
      <Header />

      <main className="flex-1 py-12">
        <div className="container mx-auto px-4 max-w-4xl">
          <BackButton />

          <div className="mt-6 mb-8">
            <div className="flex items-center gap-3 mb-4">
              <Scale className="h-8 w-8 text-primary" />
              <h1 className="text-4xl font-bold">Mentions légales</h1>
            </div>
            <p className="text-muted-foreground">
              Dernière mise à jour :{" "}
              {new Date().toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
            <p className="text-sm text-muted-foreground italic mt-3 pt-3 border-t border-border/60">
              <span className="font-semibold not-italic">English summary —</span>{" "}
              This page is the statutory legal notice of Ticket Safe SAS under
              French law (LCEN Art. 19). The legally binding text below is in
              French. For information on personal data, see the{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy Policy
              </Link>
              ; for cookies see the{" "}
              <Link to="/cookie-policy" className="text-primary hover:underline">
                Cookie Policy
              </Link>
              .
            </p>
          </div>

          <Card>
            <CardContent className="p-6 md:p-10 space-y-8">
              {/* 1 — Éditeur */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">
                  1. Éditeur du site
                </h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    Le site{" "}
                    <strong className="text-foreground">ticket-safe.eu</strong>{" "}
                    (ci-après le « Site ») est édité par :
                  </p>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-1 text-sm">
                    <p>
                      <strong className="text-foreground">
                        Ticket Safe SAS
                      </strong>{" "}
                      — Société par actions simplifiée
                    </p>
                    <p>Capital social : 1 000 €</p>
                    <p>Siège social : 2 rue Wilhem, 75016 Paris, France</p>
                    <p>
                      Immatriculée au RCS de Paris sous le numéro{" "}
                      <strong className="text-foreground">105 533 632</strong>
                    </p>
                    <p>Numéro de gestion : 2026B27032</p>
                    <p>
                      N° de TVA intracommunautaire :{" "}
                      <strong className="text-foreground">
                        FR86 105 533 632
                      </strong>
                    </p>
                    <p>Numéro d'identification européen (EUID) : FR7501.105533632</p>
                  </div>
                </div>
              </section>

              <Separator />

              {/* 2 — Direction */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">
                  2. Direction de la publication
                </h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    <strong className="text-foreground">
                      Directeur de la publication :
                    </strong>{" "}
                    Adrien Menard, Président de Ticket Safe SAS.
                  </p>
                  <p>
                    <strong className="text-foreground">
                      Directeur général :
                    </strong>{" "}
                    Achille Quinquenel.
                  </p>
                </div>
              </section>

              <Separator />

              {/* 3 — Hébergeur */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">3. Hébergeur</h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    Le Site est hébergé sur l'infrastructure mondiale de Vercel,
                    avec des nœuds situés dans l'Union européenne pour servir le
                    public français :
                  </p>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-1 text-sm">
                    <p>
                      <strong className="text-foreground">Vercel Inc.</strong>
                    </p>
                    <p>440 N Barranca Ave #4133, Covina, CA 91723, États-Unis</p>
                    <p>
                      Site web :{" "}
                      <a
                        href="https://vercel.com"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        vercel.com
                      </a>
                    </p>
                  </div>
                  <p className="text-sm">
                    La base de données et les fonctions serveur sont opérées par
                    Supabase Inc. (US — région UE de Francfort pour les données
                    de Ticket Safe). La liste complète des sous-traitants et
                    leurs garanties contractuelles figure dans la{" "}
                    <Link
                      to="/privacy"
                      className="text-primary hover:underline"
                    >
                      Politique de confidentialité, section 4.2
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
                  <p>
                    Pour toute question relative au Site ou aux services
                    fournis :
                  </p>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-1 text-sm">
                    <p>
                      Support général :{" "}
                      <a
                        href="mailto:ticketsafe.friendly@gmail.com"
                        className="text-primary hover:underline"
                      >
                        ticketsafe.friendly@gmail.com
                      </a>
                    </p>
                    <p>
                      Données personnelles (DPO) :{" "}
                      <a
                        href="mailto:dpo@ticket-safe.eu"
                        className="text-primary hover:underline"
                      >
                        dpo@ticket-safe.eu
                      </a>
                    </p>
                    <p>Adresse postale : 2 rue Wilhem, 75016 Paris, France</p>
                  </div>
                </div>
              </section>

              <Separator />

              {/* 5 — Propriété intellectuelle */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">
                  5. Propriété intellectuelle
                </h2>
                <div className="space-y-3 text-muted-foreground">
                  <p>
                    L'ensemble des contenus présents sur le Site (textes,
                    graphismes, logos, icônes, images, vidéos, code source,
                    structure de la base de données) est la propriété exclusive
                    de Ticket Safe SAS ou de ses concédants, et est protégé par
                    les législations françaises et internationales relatives au
                    droit d'auteur et à la propriété intellectuelle.
                  </p>
                  <p>
                    Toute reproduction, représentation, modification,
                    publication, transmission, dénaturation, totale ou
                    partielle, du Site ou de son contenu, par quelque procédé
                    que ce soit, et sur quelque support que ce soit, est
                    interdite sans autorisation écrite préalable de Ticket Safe
                    SAS, sous peine de constituer une contrefaçon sanctionnée
                    par les articles L335-2 et suivants du Code de la propriété
                    intellectuelle.
                  </p>
                  <p>
                    La marque « Ticket Safe » ainsi que le logo associé sont la
                    propriété de Ticket Safe SAS.
                  </p>
                </div>
              </section>

              <Separator />

              {/* 6 — Données personnelles */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">
                  6. Données personnelles
                </h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    Le traitement des données personnelles des utilisateurs du
                    Site est régi par notre{" "}
                    <Link
                      to="/privacy"
                      className="text-primary hover:underline font-medium"
                    >
                      Politique de confidentialité
                    </Link>
                    , conformément au Règlement (UE) 2016/679 du 27 avril 2016
                    (RGPD) et à la loi française n° 78-17 du 6 janvier 1978
                    modifiée.
                  </p>
                  <p>
                    Conformément aux articles 15 à 22 du RGPD, vous disposez
                    d'un droit d'accès, de rectification, d'effacement, de
                    portabilité et d'opposition concernant vos données. Vous
                    pouvez exercer ces droits depuis votre espace{" "}
                    <Link
                      to="/settings/privacy"
                      className="text-primary hover:underline"
                    >
                      Settings → My Data &amp; Privacy
                    </Link>
                    , ou en écrivant à{" "}
                    <a
                      href="mailto:dpo@ticket-safe.eu"
                      className="text-primary hover:underline"
                    >
                      dpo@ticket-safe.eu
                    </a>
                    .
                  </p>
                  <p>
                    Vous disposez également du droit de saisir la CNIL (
                    <a
                      href="https://www.cnil.fr"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      cnil.fr
                    </a>
                    ) en cas de désaccord persistant.
                  </p>
                </div>
              </section>

              <Separator />

              {/* 7 — Cookies */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">7. Cookies</h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    L'utilisation des cookies sur le Site est détaillée dans
                    notre{" "}
                    <Link
                      to="/cookie-policy"
                      className="text-primary hover:underline font-medium"
                    >
                      Politique relative aux cookies
                    </Link>
                    . Vous pouvez à tout moment modifier vos préférences depuis
                    le lien « Gérer mes cookies » présent en bas de page.
                  </p>
                </div>
              </section>

              <Separator />

              {/* 8 — Médiation de la consommation */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">
                  8. Médiation de la consommation
                </h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    Conformément aux articles L611-1 et suivants du Code de la
                    consommation, en cas de litige avec un consommateur n'ayant
                    pu être réglé par notre service client, l'utilisateur peut
                    recourir gratuitement à un médiateur de la consommation.
                  </p>
                  <p>
                    Ticket Safe SAS adhère au service de médiation suivant :
                  </p>
                  <div className="bg-muted/50 p-4 rounded-lg space-y-1 text-sm">
                    <p>
                      <strong className="text-foreground">
                        CMAP – Centre de Médiation et d'Arbitrage de Paris
                      </strong>
                    </p>
                    <p>39, avenue Franklin D. Roosevelt, 75008 Paris</p>
                    <p>
                      <a
                        href="https://www.cmap.fr"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-primary hover:underline"
                      >
                        cmap.fr
                      </a>
                    </p>
                  </div>
                  <p className="text-sm">
                    L'utilisateur consommateur peut également recourir à la
                    plateforme européenne de Règlement en Ligne des Litiges
                    (RLL) :{" "}
                    <a
                      href="https://ec.europa.eu/consumers/odr"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary hover:underline"
                    >
                      ec.europa.eu/consumers/odr
                    </a>
                    .
                  </p>
                </div>
              </section>

              <Separator />

              {/* 9 — Droit applicable */}
              <section>
                <h2 className="text-2xl font-semibold mb-4">
                  9. Droit applicable et juridiction
                </h2>
                <div className="space-y-2 text-muted-foreground">
                  <p>
                    Les présentes mentions légales sont régies par le droit
                    français. En cas de litige, et après tentative de
                    résolution amiable, les tribunaux français seront seuls
                    compétents, sous réserve des règles impératives de
                    compétence applicables aux consommateurs.
                  </p>
                </div>
              </section>
            </CardContent>
          </Card>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default MentionsLegales;
