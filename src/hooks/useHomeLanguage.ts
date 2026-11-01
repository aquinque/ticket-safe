import { useI18n } from "@/contexts/I18nContext";
import { resolveHomeLanguage, type HomeLanguage } from "@/lib/homePage";

/**
 * The language the home page copy is shown in: the site language, so English unless the visitor picked French in
 * the switcher (or arrived with ?lang=fr). The page follows the switcher as soon as it is used.
 */
export function useHomeLanguage(): HomeLanguage {
  return resolveHomeLanguage(useI18n().language);
}
