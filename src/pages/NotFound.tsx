import { useLocation, Link } from "react-router-dom";
import { useEffect } from "react";
import HeaderNight from "@/components/HeaderNight";
import Footer from "@/components/Footer";
import { useThemeMode } from "@/hooks/useThemeMode";
import { BackButton } from "@/components/BackButton";
import { Button } from "@/components/ui/button";
import { SEOHead } from "@/components/SEOHead";
import { SearchX } from "lucide-react";

const NotFound = () => {
  useThemeMode("night");
  const location = useLocation();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.error("404: no route matches", location.pathname);
    }
  }, [location.pathname]);

  return (
    <div className="theme-night min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="common.appName" descriptionKey="common.appName" />
      <HeaderNight />
      <main className="flex-1 flex items-center justify-center pt-16 pb-16 md:pt-20">
        <div className="container mx-auto px-4 max-w-lg text-center">
          <div className="mb-4 text-left">
            <BackButton fallbackPath="/" />
          </div>
          <div className="w-20 h-20 bg-muted flex items-center justify-center mx-auto mb-6">
            <SearchX className="w-10 h-10 text-muted-foreground" />
          </div>

          <h1 className="text-3xl font-bold mb-4">Page not found</h1>

          <p className="text-muted-foreground mb-8">
            This page doesn't exist or may have moved.
          </p>

          <Button variant="hero" asChild>
            <Link to="/">Back to home</Link>
          </Button>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default NotFound;
