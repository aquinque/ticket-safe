import { useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { BackButton } from "@/components/BackButton";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/contexts/ThemeContext";
import { useI18n } from "@/contexts/I18nContext";
import { toast } from "@/hooks/use-toast";
import { SEOHead } from "@/components/SEOHead";
import {
  Moon,
  Sun,
  Monitor,
  Lightbulb,
  Save
} from "lucide-react";

const InterfaceSettings = () => {
  const { t } = useI18n();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [brightness, setBrightness] = useState(() => {
    const stored = localStorage.getItem('brightness');
    return stored ? parseInt(stored) : 100;
  });

  const handleThemeToggle = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    toggleTheme();
    toast({
      title: t('toast.themeChanged'),
      description: newTheme === 'dark' ? t('toast.switchedToDark') : t('toast.switchedToLight'),
    });
  };

  const handleBrightnessChange = (value: number[]) => {
    const newBrightness = value[0];
    setBrightness(newBrightness);
    localStorage.setItem('brightness', newBrightness.toString());

    // Apply brightness filter to the document
    document.documentElement.style.filter = `brightness(${newBrightness}%)`;
  };

  const handleSave = () => {
    toast({
      title: t('toast.settingsSaved'),
      description: 'Your interface preferences have been saved',
    });
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <SEOHead titleKey="nav.settings" descriptionKey="settings.description" />
      <Header />
      <main className="py-16 flex-1">
        <div className="container mx-auto px-4 max-w-3xl">
          <div className="mb-6">
            <BackButton />
          </div>

          {/* Page Header */}
          <div className="mb-8">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/30 flex items-center justify-center">
                <Monitor className="w-5 h-5 text-blue-600" />
              </div>
              <h1 className="text-4xl font-bold">Interface</h1>
            </div>
            <p className="text-muted-foreground">
              Customize your visual preferences and display settings
            </p>
          </div>

          {/* Settings Cards */}
          <div className="space-y-6">
            {/* Dark Mode */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  {theme === 'light' ? (
                    <Sun className="w-5 h-5 text-primary" />
                  ) : (
                    <Moon className="w-5 h-5 text-primary" />
                  )}
                  Dark Mode
                </CardTitle>
                <CardDescription>
                  Switch between light and dark theme
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="space-y-1">
                      <p className="text-sm font-medium">
                        {theme === 'dark' ? 'Dark theme enabled' : 'Light theme enabled'}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {theme === 'dark'
                          ? 'Easier on your eyes in low-light conditions'
                          : 'Better visibility in bright environments'}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={theme === 'dark'}
                    onCheckedChange={handleThemeToggle}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Brightness Control */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lightbulb className="w-5 h-5 text-primary" />
                  Brightness
                </CardTitle>
                <CardDescription>
                  Adjust screen brightness to your preference
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Brightness Level</span>
                    <span className="text-sm text-muted-foreground">{brightness}%</span>
                  </div>
                  <Slider
                    value={[brightness]}
                    onValueChange={handleBrightnessChange}
                    min={30}
                    max={100}
                    step={5}
                    className="w-full"
                  />
                  <p className="text-xs text-muted-foreground">
                    Adjust the brightness to reduce eye strain. Changes are applied immediately.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Save Button */}
            <div className="flex gap-3">
              <Button onClick={handleSave} className="w-full">
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
};

export default InterfaceSettings;
