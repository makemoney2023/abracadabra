import type { Metadata } from "next";
import { defaultLocale, locales } from "@/i18n";

export const SEO_BASE_URL = "https://openvid.dev";

export const SEO_OG_IMAGE = {
  url: `${SEO_BASE_URL}/images/metadata/preview-openvid.jpg`,
  width: 1200,
  height: 630,
  type: "image/jpeg",
  alt: "Openvid — free browser video editor with cinematic zooms and 3D mockups",
} as const;

export const SEO_ICONS = {
  tab: "/images/metadata/icon.svg",
  solid: "/images/metadata/icon-solid.svg",
  apple: "/images/metadata/apple.svg",
  favicon48: "/images/metadata/favicon-48.png",
  favicon32: "/images/metadata/favicon-32.png",
  faviconIco: "/images/metadata/favicon-legacy-solid.ico",
  appleTouch: "/images/metadata/apple-touch-icon.png",
  pwa192: "/images/metadata/icon-192.png",
  pwa512: "/images/metadata/icon-512.png",
  logo: "/images/metadata/logo.png",
} as const;

export const SEO_ICON_ABSOLUTE = {
  tab: `${SEO_BASE_URL}${SEO_ICONS.tab}`,
  solid: `${SEO_BASE_URL}${SEO_ICONS.solid}`,
  logo: `${SEO_BASE_URL}${SEO_ICONS.solid}`,
  logoPng: `${SEO_BASE_URL}${SEO_ICONS.logo}`,
  favicon48: `${SEO_BASE_URL}${SEO_ICONS.favicon48}`,
} as const;

export const OG_LOCALE_MAP: Record<string, string> = {
  en: "en_US",
  es: "es_ES",
  ru: "ru_RU",
  ko: "ko_KR",
};

export function getLocaleUrl(locale: string, path: string = ""): string {
  const normalized = path === "/" ? "" : path;
  return `${SEO_BASE_URL}/${locale}${normalized}`;
}

export function getRouteAlternates(locale: string, path: string = "") {
  const languages: Record<string, string> = {};

  for (const loc of locales) {
    languages[loc] = getLocaleUrl(loc, path);
  }

  languages["x-default"] = getLocaleUrl(defaultLocale, path);

  return {
    canonical: getLocaleUrl(locale, path),
    languages,
  };
}

export function getOgLocales(locale: string) {
  const current = OG_LOCALE_MAP[locale] ?? OG_LOCALE_MAP[defaultLocale];
  const alternateLocale = Object.values(OG_LOCALE_MAP).filter(
    (code) => code !== current,
  );
  return { locale: current, alternateLocale };
}

type BuildPageMetadataInput = {
  locale: string;
  path?: string;
  title: string;
  description: string;
  keywords?: string[];
  imageAlt?: string;
  noIndex?: boolean;
};

export function buildPageMetadata({
  locale,
  path = "",
  title,
  description,
  keywords,
  imageAlt,
  noIndex = false,
}: BuildPageMetadataInput): Metadata {
  const alternates = getRouteAlternates(locale, path);
  const { locale: ogLocale, alternateLocale } = getOgLocales(locale);
  const image = {
    url: SEO_OG_IMAGE.url,
    width: SEO_OG_IMAGE.width,
    height: SEO_OG_IMAGE.height,
    type: SEO_OG_IMAGE.type,
    alt: imageAlt ?? SEO_OG_IMAGE.alt,
  };

  return {
    title,
    description,
    keywords,
    alternates,
    robots: noIndex
      ? { index: false, follow: false }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-video-preview": -1,
            "max-image-preview": "large",
            "max-snippet": -1,
          },
        },
    openGraph: {
      type: "website",
      siteName: "Openvid",
      locale: ogLocale,
      alternateLocale,
      url: alternates.canonical,
      title,
      description,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      site: "@openvid",
      creator: "@cristianolivera",
      title,
      description,
      images: {
        url: SEO_OG_IMAGE.url,
        alt: image.alt,
      },
    },
  };
}
