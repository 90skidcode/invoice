import commonEn from './en/common.json' assert { type: 'json' };
import formsEn from './en/forms.json' assert { type: 'json' };

export const en = {
  ...commonEn,
  ...formsEn,
};

export type TranslationKey = keyof typeof en;
export type Translations = typeof en;

export type SupportedLocale = 'en';

const locales: Record<SupportedLocale, Translations> = { en };

export function getTranslations(locale: SupportedLocale = 'en'): Translations {
  return locales[locale] ?? locales['en'];
}

export function t(key: TranslationKey, locale: SupportedLocale = 'en'): string {
  const translations = getTranslations(locale);
  return translations[key] ?? key;
}
