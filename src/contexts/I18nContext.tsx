import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import enTranslations from '@/locales/en.json';
import frTranslations from '@/locales/fr.json';

type Language = 'en' | 'fr';
type Translations = typeof enTranslations;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, any>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const translations: Record<Language, Translations> = {
  en: enTranslations,
  fr: frTranslations,
};

const detectBrowserLanguage = (): Language => {
  const browserLang = navigator.language.toLowerCase();
  return browserLang.startsWith('fr') ? 'fr' : 'en';
};

const getLanguageFromUrl = (): Language | null => {
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang');
  if (urlLang === 'en' || urlLang === 'fr') {
    return urlLang;
  }
  return null;
};

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    // Priority: URL param > localStorage > default to English
    const urlLang = getLanguageFromUrl();
    if (urlLang) return urlLang;
    
    const storedLang = localStorage.getItem('lang') as Language;
    if (storedLang === 'en' || storedLang === 'fr') return storedLang;
    
    return 'en'; // Default to English
  });

  useEffect(() => {
    // Update HTML lang attribute
    document.documentElement.lang = language;
  }, [language]);

  useEffect(() => {
    // Listen for URL changes
    const urlLang = getLanguageFromUrl();
    if (urlLang && urlLang !== language) {
      setLanguageState(urlLang);
      localStorage.setItem('lang', urlLang);
    }
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('lang', lang);
    document.documentElement.lang = lang;
  };

  const t = (key: string, params?: Record<string, any>): string => {
    const keys = key.split('.');
    let value: any = translations[language];

    // Navigate through nested keys
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        // Fallback to English if key not found in current language
        value = translations.en;
        for (const fallbackKey of keys) {
          if (value && typeof value === 'object' && fallbackKey in value) {
            value = value[fallbackKey];
          } else {
            if (import.meta.env.DEV) {
              console.warn(`Translation key not found: ${key}`);
            }
            return key;
          }
        }
        break;
      }
    }

    if (typeof value !== 'string') {
      if (import.meta.env.DEV) {
        console.warn(`Translation key is not a string: ${key}`);
      }
      return key;
    }

    // Simple interpolation
    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, paramKey) => {
        return params[paramKey]?.toString() || `{${paramKey}}`;
      });
    }

    return value;
  };

  return (
    <I18nContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
};
