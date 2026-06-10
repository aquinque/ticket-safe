import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { SEOHead } from "@/components/SEOHead";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  Monitor,
  User,
  ShoppingBag,
  ArrowRight,
  ShieldCheck,
  Tag,
  Banknote,
  Settings as SettingsIcon,
} from "lucide-react";

const Settings = () => {
  const navigate = useNavigate();
  const { user } = useAuth();

  // Live seller wallet balance, shown right on the hub so it's as obvious as
  // a Vinted balance — even before opening "My Listings".
  const [walletCents, setWalletCents] = useState<number | null>(null);
  useEffect(() => {
    if (!user) return;
    let active = true;
    supabase
      .from("seller_earnings")
      .select("available_cents")
      .eq("seller_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (active) setWalletCents((data as { available_cents?: number } | null)?.available_cents ?? 0);
      });
    return () => {
      active = false;
    };
  }, [user]);

  const settingsSections = [
    {
      id: "interface",
      title: "Interface",
      description: "Customize theme, brightness, and display settings",
      icon: Monitor,
      path: "/settings/interface",
      color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30"
    },
    {
      id: "personal",
      title: "Personal Information",
      description: "View your identity, change your password",
      icon: User,
      path: "/settings/personal",
      color: "text-purple-600 bg-purple-50 dark:bg-purple-950/30"
    },
    {
      id: "purchases",
      title: "Purchase History",
      description: "View all your ticket purchases and transactions",
      icon: ShoppingBag,
      path: "/settings/purchases",
      color: "text-green-600 bg-green-50 dark:bg-green-950/30"
    },
    {
      id: "listings",
      title: "My Listings",
      description: "Resale listings, earnings, and SEPA payouts",
      icon: Tag,
      path: "/settings/listings",
      color: "text-rose-600 bg-rose-50 dark:bg-rose-950/30"
    },
    {
      id: "privacy",
      title: "My Data & Privacy",
      description: "Download, anonymize, or permanently delete your account",
      icon: ShieldCheck,
      path: "/settings/privacy",
      color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30"
    }
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.settings" descriptionKey="settings.description" />
      <Header />
      <main className="py-6 md:py-10 flex-1">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-5">
            <BackButton />
          </div>

          <PageHeader
            icon={SettingsIcon}
            title="Settings"
            description="Manage your account preferences and view your activity."
          />

          {/* Seller wallet — Vinted-style balance, front and centre. Tap to open
              My Listings where you withdraw to your IBAN. */}
          <button
            type="button"
            onClick={() => navigate("/settings/listings")}
            className="w-full text-left mb-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-card p-5 md:p-6 hover:shadow-md transition-all group"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                  <Banknote className="w-6 h-6 text-emerald-700" />
                </div>
                <div className="min-w-0">
                  <div className="text-xs font-bold uppercase tracking-wider text-emerald-800/80">Your wallet</div>
                  <div className="text-2xl md:text-3xl font-black tabular-nums leading-tight text-emerald-900">
                    {walletCents === null ? "€—" : `€${(walletCents / 100).toFixed(2)}`}
                  </div>
                  <div className="text-xs text-emerald-800/80">
                    {walletCents && walletCents > 0 ? "available to withdraw — tap to get paid" : "from your resale sales — tap to view"}
                  </div>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-emerald-700 group-hover:translate-x-0.5 transition-transform shrink-0" />
            </div>
          </button>

          {/* Settings sections — uniform card with hover arrow that mirrors
              the rest of the app's primary-action affordance. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              return (
                <Card
                  key={section.id}
                  className="group hover:shadow-md hover:border-primary/40 transition-all cursor-pointer"
                  onClick={() => navigate(section.path)}
                >
                  <CardContent className="p-5 md:p-6">
                    <div className="flex items-start gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${section.color}`}>
                        <Icon className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <h3 className="text-base md:text-lg font-bold leading-tight">{section.title}</h3>
                          <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all shrink-0" />
                        </div>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          {section.description}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default Settings;
