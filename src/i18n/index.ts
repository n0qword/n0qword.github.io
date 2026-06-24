import es from "./es.json";
import en from "./en.json";

export type Locale = "en" | "es";

export const LOCALES: Record<Locale, string> = {
  en: "English",
  es: "Español",
};

export type RawLocale = Record<string, unknown>;

const translations: Record<Locale, RawLocale> = { es, en };

export function t(locale: Locale, key: string): string {
  const parts = key.split(".");
  let value: unknown = translations[locale];
  for (const part of parts) {
    if (value && typeof value === "object") {
      value = (value as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof value === "string" ? value : key;
}

export function useTranslations(locale: Locale) {
  return (key: string) => t(locale, key);
}

const LOCALE_PATTERN = /^\/(en|es)(\/|$)/;

export function getLocaleFromUrl(pathname: string): Locale {
  const match = pathname.match(LOCALE_PATTERN);
  if (match?.[1] === "en" || match?.[1] === "es") return match[1];
  return "es";
}

export const OTHER_LOCALE: Record<Locale, Locale> = {
  en: "es",
  es: "en",
};
