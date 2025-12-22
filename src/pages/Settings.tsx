import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/contexts/I18nContext";
import { SEOHead } from "@/components/SEOHead";
import {
  Monitor,
  User,
  ShoppingBag,
  ChevronRight
} from "lucide-react";

const Settings = () => {
  const { t } = useI18n();
  const navigate = useNavigate();

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
      description: "Manage your name, email, and account details",
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
    }
  ];

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.settings" descriptionKey="settings.description" />
      <Header />
      <main className="py-16 flex-1">
        <div className="container mx-auto px-4 max-w-4xl">
          <div className="mb-6">
            <BackButton />
          </div>

          {/* Page Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">Settings</h1>
            <p className="text-muted-foreground">
              Manage your account preferences and view your activity
            </p>
          </div>

          {/* Settings Sections */}
          <div className="space-y-4">
            {settingsSections.map((section) => {
              const Icon = section.icon;
              return (
                <Card
                  key={section.id}
                  className="hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => navigate(section.path)}
                >
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4 flex-1">
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${section.color}`}>
                          <Icon className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold mb-1">{section.title}</h3>
                          <p className="text-sm text-muted-foreground">
                            {section.description}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground flex-shrink-0" />
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
