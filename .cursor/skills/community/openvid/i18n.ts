import { getRequestConfig } from 'next-intl/server';

export const locales = ['en', 'es', 'ru', 'ko'] as const;
export const defaultLocale = 'en' as const;
export type Locale = (typeof locales)[number];

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale;

  const baseLocale = (locale && locales.includes(locale as Locale)) 
    ? locale 
    : defaultLocale;

  return {
    locale: baseLocale,
    messages: (await import(`./messages/${baseLocale}.json`)).default
  };
});