import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import enTranslations from '@/locales/en.json';
import frTranslations from '@/locales/fr.json';
import esTranslations from '@/locales/es.json';

type Language = 'en' | 'fr' | 'es';
type Translations = typeof enTranslations;

interface I18nContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

const translations: Record<Language, Translations> = {
  en: enTranslations,
  fr: frTranslations,
  es: esTranslations,
};

const isLanguage = (v: string | null): v is Language => v === 'en' || v === 'fr' || v === 'es';

// EN is the unconditional default — the site no longer auto-switches based
// on browser language. Visitors can still pick FR/ES themselves via the
// language switcher (or a ?lang= URL param), and that explicit choice is
// remembered in localStorage.
const getLanguageFromUrl = (): Language | null => {
  const params = new URLSearchParams(window.location.search);
  const urlLang = params.get('lang');
  return isLanguage(urlLang) ? urlLang : null;
};

export const I18nProvider = ({ children }: { children: ReactNode }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    // Priority: URL param > localStorage > EN default
    const urlLang = getLanguageFromUrl();
    if (urlLang) return urlLang;

    const storedLang = localStorage.getItem('lang');
    if (isLanguage(storedLang)) return storedLang;

    return 'en';
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

  const t = (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: unknown = translations[language];

    // Navigate through nested keys
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = (value as Record<string, unknown>)[k];
      } else {
        // Fallback to English (the default language) if the key is missing
        // in the current language.
        value = translations.en;
        for (const fallbackKey of keys) {
          if (value && typeof value === 'object' && fallbackKey in value) {
            value = (value as Record<string, unknown>)[fallbackKey];
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
