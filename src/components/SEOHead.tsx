import { useEffect } from 'react';
import { useI18n } from '@/contexts/I18nContext';
import { useLocation } from 'react-router-dom';

interface SEOHeadProps {
  /** Direct title string (preferred). Falls back to titleKey via i18n. */
  title?: string;
  /** i18n key for the title. Used when `title` is not provided. */
  titleKey?: string;
  /** Direct description string (preferred). */
  description?: string;
  /** i18n key for the description. */
  descriptionKey?: string;
  /** Absolute or root-relative URL for the social preview image. */
  image?: string | null;
  /** Open Graph type. Defaults to "website"; pass "event" / "article" when relevant. */
  type?: string;
  /** Canonical URL override. Defaults to the current pathname. */
  url?: string;
}

/** Ensures an HTMLMetaElement exists for the given selector, creating it if missing. */
function ensureMeta(selector: string, attrName: 'name' | 'property', attrValue: string): HTMLMetaElement {
  let el = document.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  return el;
}

function ensureLink(rel: string): HTMLLinkElement {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  return el;
}

export const SEOHead = ({
  title,
  titleKey,
  description,
  descriptionKey,
  image,
  type = 'website',
  url,
}: SEOHeadProps) => {
  const { t, language } = useI18n();
  const location = useLocation();

  useEffect(() => {
    const baseUrl = window.location.origin;
    const currentPath = location.pathname;
    const canonical = url ?? `${baseUrl}${currentPath}`;

    const appName = t('common.appName');
    const finalTitle = title ?? (titleKey ? t(titleKey) : appName);
    const finalDescription = description ?? (descriptionKey ? t(descriptionKey) : t('hero.subtitle'));
    // Default branded share image — used when no event banner is provided.
    const finalImage = image ?? `${baseUrl}/og-default.png`;

    document.title = finalTitle.includes(appName) ? finalTitle : `${finalTitle} – ${appName}`;

    // Primary description.
    ensureMeta('meta[name="description"]', 'name', 'description').setAttribute('content', finalDescription);

    // Open Graph.
    ensureMeta('meta[property="og:title"]', 'property', 'og:title').setAttribute('content', finalTitle);
    ensureMeta('meta[property="og:description"]', 'property', 'og:description').setAttribute('content', finalDescription);
    ensureMeta('meta[property="og:type"]', 'property', 'og:type').setAttribute('content', type);
    ensureMeta('meta[property="og:url"]', 'property', 'og:url').setAttribute('content', canonical);
    ensureMeta('meta[property="og:image"]', 'property', 'og:image').setAttribute('content', finalImage);
    ensureMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt').setAttribute('content', finalTitle);
    ensureMeta('meta[property="og:site_name"]', 'property', 'og:site_name').setAttribute('content', appName);

    // Twitter card.
    ensureMeta('meta[name="twitter:card"]', 'name', 'twitter:card').setAttribute('content', 'summary_large_image');
    ensureMeta('meta[name="twitter:title"]', 'name', 'twitter:title').setAttribute('content', finalTitle);
    ensureMeta('meta[name="twitter:description"]', 'name', 'twitter:description').setAttribute('content', finalDescription);
    ensureMeta('meta[name="twitter:image"]', 'name', 'twitter:image').setAttribute('content', finalImage);

    // Canonical link.
    ensureLink('canonical').setAttribute('href', canonical);

    // hreflang alternates.
    document.querySelectorAll('link[rel="alternate"][hreflang]').forEach((el) => el.remove());
    ['en', 'fr'].forEach((lang) => {
      const link = document.createElement('link');
      link.setAttribute('rel', 'alternate');
      link.setAttribute('hreflang', lang);
      link.setAttribute('href', `${baseUrl}${currentPath}?lang=${lang}`);
      document.head.appendChild(link);
    });
    const xDefault = document.createElement('link');
    xDefault.setAttribute('rel', 'alternate');
    xDefault.setAttribute('hreflang', 'x-default');
    xDefault.setAttribute('href', `${baseUrl}${currentPath}`);
    document.head.appendChild(xDefault);
  }, [t, language, location.pathname, title, titleKey, description, descriptionKey, image, type, url]);

  return null;
};
