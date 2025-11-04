import { useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { useLocation } from 'react-router-dom';

interface SEOHeadProps {
  titleKey?: string;
  descriptionKey?: string;
}

export const SEOHead = ({ titleKey, descriptionKey }: SEOHeadProps) => {
  const { t, language } = useI18n();
  const location = useLocation();

  useEffect(() => {
    const baseUrl = window.location.origin;
    const currentPath = location.pathname;

    // Update title
    const title = titleKey ? t(titleKey) : t('common.appName');
    document.title = `${title} – ${t('common.appName')}`;

    // Update meta description
    const description = descriptionKey ? t(descriptionKey) : t('hero.subtitle');
    let metaDescription = document.querySelector('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.setAttribute('name', 'description');
      document.head.appendChild(metaDescription);
    }
    metaDescription.setAttribute('content', description);

    // Update OG tags
    let ogTitle = document.querySelector('meta[property="og:title"]');
    if (!ogTitle) {
      ogTitle = document.createElement('meta');
      ogTitle.setAttribute('property', 'og:title');
      document.head.appendChild(ogTitle);
    }
    ogTitle.setAttribute('content', title);

    let ogDescription = document.querySelector('meta[property="og:description"]');
    if (!ogDescription) {
      ogDescription = document.createElement('meta');
      ogDescription.setAttribute('property', 'og:description');
      document.head.appendChild(ogDescription);
    }
    ogDescription.setAttribute('content', description);

    // Update Twitter tags
    let twitterTitle = document.querySelector('meta[name="twitter:title"]');
    if (!twitterTitle) {
      twitterTitle = document.createElement('meta');
      twitterTitle.setAttribute('name', 'twitter:title');
      document.head.appendChild(twitterTitle);
    }
    twitterTitle.setAttribute('content', title);

    let twitterDescription = document.querySelector('meta[name="twitter:description"]');
    if (!twitterDescription) {
      twitterDescription = document.createElement('meta');
      twitterDescription.setAttribute('name', 'twitter:description');
      document.head.appendChild(twitterDescription);
    }
    twitterDescription.setAttribute('content', description);

    // Remove existing hreflang tags
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach(el => el.remove());

    // Add hreflang tags
    const languages = ['en', 'fr'];
    languages.forEach(lang => {
      const link = document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', lang);
      link.setAttribute('href', `${baseUrl}${currentPath}?lang=${lang}`);
      document.head.appendChild(link);
    });

    // Add x-default
    const xDefault = document.createElement('link');
    xDefault.setAttribute('rel', 'alternate');
    xDefault.setAttribute('hreflang', 'x-default');
    xDefault.setAttribute('href', `${baseUrl}${currentPath}`);
    document.head.appendChild(xDefault);

  }, [t, language, location.pathname, titleKey, descriptionKey]);

  return null;
};
