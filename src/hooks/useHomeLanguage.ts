import { useMemo } from "react";
import { useI18n } from "@/contexts/I18nContext";
import { chosenLanguage, resolveHomeLanguage, type HomeLanguage } from "@/lib/homePage";

const storedLanguage = (): string | null => {
  try {
    return localStorage.getItem("lang");
  } catch {
    return null; // storage can be blocked (private mode); the visitor then simply has no saved choice
  }
};

/**
 * The language the home page copy is shown in: French, unless the visitor picked English or Spanish in the
 * switcher (or arrived with ?lang=). Reading the site language from the context makes the page follow the
 * switcher as soon as it is used.
 */
export function useHomeLanguage(): HomeLanguage {
  const { language } = useI18n();
  return useMemo(
    () => resolveHomeLanguage(chosenLanguage(window.location.search, storedLanguage())),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `language` is the trigger: it changes when the switcher is used
    [language],
  );
}
