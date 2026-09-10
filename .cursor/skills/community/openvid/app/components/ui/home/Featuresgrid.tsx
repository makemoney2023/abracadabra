"use client";

import { useTranslations } from "next-intl";

export default function FeaturesGrid() {
  const t = useTranslations("featuresGrid");

  return (
    <section className="w-full pt-24 pb-50 bg-black" aria-label={t("ariaLabel")}>
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="max-w-2xl mb-16">
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mb-6">
            {t("titleLine1")} <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-300 to-neutral-600">
              {t("titleLine2")}
            </span>
          </h2>
          <p className="text-xl text-neutral-400 font-light leading-relaxed max-w-xl">
            {t("description")}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-4 auto-rows-[300px]">
          <article className="relative group col-span-1 md:col-span-2 lg:col-span-2 lg:row-span-2 squircle-element-2xl bg-neutral-950 border border-white/10 overflow-hidden hover:border-white/20 transition-colors">
            <div className="absolute inset-0 bg-[url('/images/bento/bg-phone.avif')] bg-cover bg-bottom transition-[transform,opacity] duration-500 group-hover:opacity-50" />

            <div className="absolute inset-0 bg-gradient-to-t from-neutral-950 via-neutral-950/20 to-transparent pointer-events-none z-10" />

            <div className="absolute -top-22 sm:top-0 inset-x-0 flex justify-center z-20 pointer-events-none">
              <img
                src="/images/bento/3d-device.webp"
                alt={t("alts.abstract3dRendering")}
                loading="lazy"
                decoding="async"
                className="w-auto h-auto max-h-[300px] sm:max-h-[550px] object-contain object-bottom transition-transform duration-500 group-hover:scale-105 select-none"
              />
            </div>

            <div className="absolute bottom-0 left-0 p-8 z-30">
              <h3 className="text-xl font-medium text-white mb-2">
                {t("cards.deviceMockups.title")}
              </h3>
              <p className="text-neutral-400 text-sm max-w-sm">
                {t("cards.deviceMockups.description")}
              </p>
            </div>
          </article>

          <article className="relative col-span-1 md:col-span-1 lg:col-span-2 squircle-element-2xl border border-neutral-200 overflow-hidden transition-colors pt-8 px-8 pb-0 flex flex-col justify-between bg-white bg-[linear-gradient(45deg,#e5e5e5_25%,transparent_25%),linear-gradient(-45deg,#e5e5e5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#e5e5e5_75%),linear-gradient(-45deg,transparent_75%,#e5e5e5_75%)] bg-[size:32px_32px] bg-[position:0_0,0_16px,16px_-16px,16px_0px]">
            <div className="relative z-30 pointer-events-none">
              <h2 className="text-4xl sm:text-6xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-neutral-900 to-neutral-300 text-shadow-2xs">
                {t("cards.transparency.title")}
              </h2>
            </div>
            <div className="relative w-full mt-40 sm:mt-24 h-[300px] flex justify-center items-start">
              <img
                src="/images/bento/transparency-3.webp"
                alt={t("alts.backgroundLayer3")}
                loading="lazy"
                decoding="async"
                className="absolute top-0 left-1/2 -translate-x-1/2 w-full aspect-video object-contain object-top scale-[0.80] -translate-y-24 cursor-pointer transition-all duration-300 ease-in-out hover:scale-[0.86] drop-shadow-[0_15px_15px_rgba(0,0,0,0.12)] z-10 select-none"
              />
              <img
                src="/images/bento/transparency-2.webp"
                alt={t("alts.backgroundLayer2")}
                loading="lazy"
                decoding="async"
                className="absolute top-0 left-1/2 -translate-x-1/2 w-full aspect-video object-contain object-top scale-[0.90] -translate-y-12 cursor-pointer transition-all duration-300 ease-in-out hover:scale-[0.96] drop-shadow-[0_20px_20px_rgba(0,0,0,0.15)] z-15 select-none"
              />
              <img
                src="/images/bento/transparency.webp"
                alt={t("alts.transparentPreview")}
                loading="lazy"
                decoding="async"
                className="absolute top-0 left-1/2 -translate-x-1/2 w-full aspect-video object-contain object-top scale-100 cursor-pointer transition-all duration-300 ease-in-out hover:scale-[1.05] drop-shadow-[0_25px_25px_rgba(0,0,0,0.18)] z-20 select-none"
              />
            </div>
          </article>

          <article className="relative group col-span-1 squircle-element-2xl bg-neutral-950 border border-white/10 overflow-hidden hover:border-white/20 transition-colors p-8 flex flex-col justify-between items-start">
            <img
              src="/images/bento/backgrounds.avif"
              alt={t("alts.backgroundPattern")}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover pointer-events-none opacity-100 transition-all duration-500 ease-in-out group-hover:scale-105 group-hover:opacity-50 select-none"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none z-20 transition-all duration-500 ease-in-out group-hover:opacity-0" />
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom_right,_var(--tw-gradient-stops))] from-neutral-800/20 via-neutral-950/0 to-transparent pointer-events-none" />
            <h2 className="text-4xl sm:text-6xl font-bold tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-neutral-100 relative z-30 text-shadow-2xs">
              500+
            </h2>
            <div className="relative z-30 mt-4">
              <h3 className="text-lg font-medium text-white mb-1">
                {t("cards.backgrounds.title")}
              </h3>
            </div>
          </article>

          <article className="relative group col-span-1 squircle-element-2xl bg-neutral-950 border border-white/10 overflow-hidden hover:border-white/20 transition-colors p-8 min-h-[240px] flex flex-col justify-end items-start">
            <div className="absolute inset-0 bg-[url('/images/bento/bg-zoom.avif')] bg-cover bg-center opacity-100 transition-all duration-500 ease-in-out group-hover:scale-105 group-hover:opacity-50" />
            <div className="absolute bottom-0 right-0 z-10 pointer-events-none">
              <img
                src="/images/bento/zoom.webp"
                alt={t("alts.bottomRightAsset")}
                loading="lazy"
                decoding="async"
                className="w-auto h-auto max-h-[360px] object-contain transition-all duration-500 ease-in-out group-hover:scale-105 group-hover:rotate-3 drop-shadow-[0_25px_25px_rgba(0,0,0,0.65)] select-none"
              />
            </div>
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none z-20 transition-all duration-500 ease-in-out group-hover:opacity-0" />
            <div className="relative z-30">
              <h3 className="text-lg font-medium text-white mb-1">
                {t("cards.cinematicZoom.title")}
              </h3>
            </div>
          </article>

          <article className="relative group col-span-1 md:col-span-2 lg:col-span-2 squircle-element-2xl bg-neutral-950 border border-white/10 overflow-hidden hover:border-white/20 transition-colors p-8 flex flex-col justify-between">
            <div className="absolute inset-0 bg-[url('/images/bento/bg-elements2.avif')] bg-cover bg-bottom opacity-100 transition-all duration-500 ease-in-out group-hover:scale-105 group-hover:opacity-50 blur-xs" />

            <div className="absolute -bottom-0 sm:-bottom-10 right-0 z-10 max-w-[100%] sm:max-w-[58%] pointer-events-none">
              <img
                src="/images/bento/phone-elements2.webp"
                alt={t("alts.rightAsset")}
                loading="lazy"
                decoding="async"
                className="w-auto h-auto max-h-[280px] sm:max-h-[580px] object-contain object-bottom transition-all duration-500 ease-in-out group-hover:scale-105 group-hover:rotate-3 drop-shadow-[0_20px_20px_rgba(0,0,0,0.65)] select-none"
              />
            </div>

            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none z-20 transition-all duration-500 ease-in-out group-hover:opacity-0" />

            <div className="relative z-30 mt-auto">
              <h3 className="text-lg font-medium text-white mb-0 sm:mb-3">
                {t("cards.elementsLayers.title")}
              </h3>
              <div className="hidden sm:flex gap-3 flex-wrap">
                {["textOverlay", "svgShapes", "blurEffects"].map((tag) => (
                  <span
                    key={tag}
                    className="px-3 py-1.5 rounded-lg border border-white/10 bg-white/5 text-xs text-neutral-300"
                  >
                    {t(`tags.${tag}`)}
                  </span>
                ))}
              </div>
            </div>
          </article>


          <article className="relative group col-span-1 md:col-span-1 lg:col-span-2 squircle-element-2xl bg-neutral-950 border border-white/10 overflow-hidden hover:border-white/20 transition-colors p-8 flex flex-col justify-end">
            <div className="absolute inset-0 bg-[url('/images/bento/multi-track.avif')] bg-cover bg-bottom transition-all duration-500 ease-in-out group-hover:scale-105 group-hover:opacity-50" />
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent pointer-events-none z-20 transition-all duration-500 ease-in-out group-hover:opacity-0" />
            <div className="relative z-30 mt-auto">
              <h3 className="text-lg font-medium text-white mb-1">
                {t("cards.multiTrackTimeline.title")}
              </h3>
              <p className="text-neutral-400 text-sm max-w-sm">
                {t("cards.multiTrackTimeline.description")}
              </p>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}