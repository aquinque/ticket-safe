import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { useI18n } from '@/contexts/I18nContext';
import { supabase } from '@/integrations/supabase/client';
import { useNavigate } from 'react-router-dom';
import { toast } from '@/hooks/use-toast';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import {
  User,
  Bell,
  Moon,
  Sun,
  Languages,
  LogOut,
  Save,
  ChevronRight,
} from 'lucide-react';

interface SettingsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const SettingsPanel = ({ open, onOpenChange }: SettingsPanelProps) => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { language, setLanguage, t } = useI18n();
  const navigate = useNavigate();

  const [profileName, setProfileName] = useState(user?.user_metadata?.full_name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [newPassword, setNewPassword] = useState('');
  const [notifications, setNotifications] = useState(() => {
    const stored = localStorage.getItem('notifications');
    return stored ? JSON.parse(stored) : true;
  });
  const [activeSection, setActiveSection] = useState<'main' | 'profile'>('main');

  const handleSaveProfile = async () => {
    try {
      if (profileName !== user?.user_metadata?.full_name) {
        const { error: metaError } = await supabase.auth.updateUser({
          data: { full_name: profileName }
        });
        if (metaError) throw metaError;
      }

      if (profileEmail !== user?.email) {
        const { error: emailError } = await supabase.auth.updateUser({
          email: profileEmail
        });
        if (emailError) throw emailError;
      }

      if (newPassword) {
        const { error: passwordError } = await supabase.auth.updateUser({
          password: newPassword
        });
        if (passwordError) throw passwordError;
        setNewPassword('');
      }

      toast({
        title: t('toast.profileUpdated'),
        description: t('toast.profileUpdateSuccess'),
      });
      setActiveSection('main');
    } catch (error) {
      toast({
        title: t('toast.error'),
        description: error instanceof Error ? error.message : t('toast.profileUpdateFailed'),
        variant: "destructive",
      });
    }
  };

  const handleNotificationToggle = (checked: boolean) => {
    setNotifications(checked);
    localStorage.setItem('notifications', JSON.stringify(checked));
    toast({
      title: t('toast.settingsSaved'),
      description: checked ? t('toast.notificationsEnabled') : t('toast.notificationsDisabled'),
    });
  };

  const handleThemeToggle = () => {
    const newTheme = theme === 'light' ? 'dark' : 'light';
    toggleTheme();
    toast({
      title: t('toast.themeChanged'),
      description: newTheme === 'dark' ? t('toast.switchedToDark') : t('toast.switchedToLight'),
    });
  };

  const handleLanguageChange = (lang: 'en' | 'fr') => {
    setLanguage(lang);
    const langName = lang === 'en' ? t('settings.languageEnglish') : t('settings.languageFrench');
    toast({
      title: t('toast.languageUpdated'),
      description: t('toast.languageChanged', { language: langName }),
    });
  };

  const handleLogout = async () => {
    await signOut();
    onOpenChange(false);
    navigate('/auth');
    toast({
      title: t('toast.loggedOut'),
      description: t('toast.loggedOutSuccess'),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-2xl font-bold">{t('settings.title')}</SheetTitle>
          <SheetDescription>
            {t('settings.description')}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {activeSection === 'main' ? (
            <>
              {/* Profile & Account */}
              <div className="space-y-4">
                <button
                  onClick={() => setActiveSection('profile')}
                  className="w-full flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="text-left">
                      <h3 className="font-medium">{t('settings.profileTitle')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.profileDescription')}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              </div>

              <Separator />

              {/* Notifications */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Bell className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t('settings.notificationsTitle')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.notificationsDescription')}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={notifications}
                    onCheckedChange={handleNotificationToggle}
                  />
                </div>
              </div>

              <Separator />

              {/* Dark Mode */}
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 rounded-lg border border-border">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      {theme === 'light' ? (
                        <Sun className="h-5 w-5 text-primary" />
                      ) : (
                        <Moon className="h-5 w-5 text-primary" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium">{t('settings.darkModeTitle')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.darkModeDescription')}
                      </p>
                    </div>
                  </div>
                  <Switch
                    checked={theme === 'dark'}
                    onCheckedChange={handleThemeToggle}
                  />
                </div>
              </div>

              <Separator />

              {/* Language */}
              <div className="space-y-4">
                <div className="p-4 rounded-lg border border-border">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="p-2 rounded-lg bg-primary/10">
                      <Languages className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">{t('settings.languageTitle')}</h3>
                      <p className="text-sm text-muted-foreground">
                        {t('settings.languageDescription')}
                      </p>
                    </div>
                  </div>
                  <Select value={language} onValueChange={handleLanguageChange}>
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en">{t('settings.languageEnglish')}</SelectItem>
                      <SelectItem value="fr">{t('settings.languageFrench')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              {/* Logout */}
              <div className="space-y-4">
                <Button
                  onClick={handleLogout}
                  variant="destructive"
                  className="w-full"
                >
                  <LogOut className="h-4 w-4 mr-2" />
                  {t('settings.logoutTitle')}
                </Button>
              </div>
            </>
          ) : (
            // Profile Edit Section
            <div className="space-y-6">
              <Button
                variant="ghost"
                onClick={() => setActiveSection('main')}
                className="pl-0"
              >
                {t('settings.backToSettings')}
              </Button>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">{t('settings.fullName')}</Label>
                  <Input
                    id="name"
                    value={profileName}
                    onChange={(e) => setProfileName(e.target.value)}
                    placeholder={t('settings.fullNamePlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="email">{t('settings.email')}</Label>
                  <Input
                    id="email"
                    type="email"
                    value={profileEmail}
                    onChange={(e) => setProfileEmail(e.target.value)}
                    placeholder={t('settings.emailPlaceholder')}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">{t('settings.newPassword')}</Label>
                  <Input
                    id="password"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder={t('settings.newPasswordPlaceholder')}
                  />
                </div>

                <Button onClick={handleSaveProfile} className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  {t('settings.saveChanges')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
};
