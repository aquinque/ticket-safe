import HeaderNight from "@/components/HeaderNight";
import Footer from "@/components/Footer";
import { SEOHead } from "@/components/SEOHead";
import { HomeSlider } from "@/components/home/HomeSlider";
import { HOME_CONTENT, HOME_LINKS, type Cta } from "@/content/home";
import { useHomeLanguage } from "@/hooks/useHomeLanguage";
import { useOrganizer } from "@/hooks/useOrganizer";
import { useThemeMode } from "@/hooks/useThemeMode";

/**
 * The home page: one screen with the three main functions of the site sliding in by themselves over a picture,
 * then the site's own footer. Every text, call to action and picture path lives in src/content/home.ts; the
 * pictures to drop in are listed in public/media/home/README.md. The header and footer are the site's own.
 */
const Home = () => {
  useThemeMode("night");

  const lang = useHomeLanguage();
  const copy = HOME_CONTENT[lang];
  const { organizer } = useOrganizer();

  // An approved organizer goes straight into Ticket Studio, like the "Organizers" link of the header.
  const studioHref = organizer?.status === "approved" ? HOME_LINKS.studioOpen : HOME_LINKS.studio;
  const hrefFor = (cta: Cta) => (cta.target === "events" ? HOME_LINKS.events : studioHref);

  return (
    <div className="theme-night min-h-screen flex flex-col bg-background">
      <SEOHead
        title="TicketSafe — Your nights."
        description="Buy tickets directly from your student union, or organization, or resell yours quickly."
      />

      <HeaderNight />

      <main lang={lang} className="flex-1">
        <HomeSlider copy={copy} hrefFor={hrefFor} />
      </main>

      <Footer />
    </div>
  );
};

export default Home;
