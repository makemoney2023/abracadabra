"use client";

import React, { useRef, MouseEvent, useState, useEffect } from "react";
import { useTranslations } from "next-intl";

const videosData = [
  { id: "v1", src: "/videos/showcase/demo1.mp4", poster: "/images/showcase/poster/demo1.avif", aspectRatio: "16/9" },
  { id: "v2", src: "/videos/showcase/demo2.mp4", poster: "/images/showcase/poster/demo2.avif", aspectRatio: "4/3" },
  { id: "v3", src: "/videos/showcase/demo3.mp4", poster: "/images/showcase/poster/demo3.avif", aspectRatio: "16/9" },
  { id: "v4", src: "/videos/showcase/demo4.mp4", poster: "/images/showcase/poster/demo4.avif", aspectRatio: "4/3" },
  { id: "v5", src: "/videos/showcase/demo5.mp4", poster: "/images/showcase/poster/demo5.avif", aspectRatio: "16/9" },
];

const imagesData = [
  { id: "i1", src: "/images/showcase/data/shot1.avif", alt: "Laptop", aspectRatio: "4/3" },
  { id: "i2", src: "/images/showcase/data/shot2.avif", alt: "iPhone", aspectRatio: "3/4" },
  { id: "i3", src: "/images/showcase/data/shot3.avif", alt: "iPhone", aspectRatio: "4/3" },
  { id: "i4", src: "/images/showcase/data/shot4.avif", alt: "Browser", aspectRatio: "16/9" },
  { id: "i5", src: "/images/showcase/data/shot5.avif", alt: "Browser", aspectRatio: "1/1" },
  { id: "i6", src: "/images/showcase/data/shot6.avif", alt: "Browser", aspectRatio: "4/3" },
];

const LazyVideo = ({ src, poster }: { src: string; poster: string }) => {
  const t = useTranslations("featuresShowcase");
  const containerRef = useRef<HTMLDivElement>(null);
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsIntersecting(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px", threshold: 0 }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} className="w-full h-full relative bg-neutral-900">
      {!isIntersecting && (
        <img
          src={poster}
          alt={t("common.videoThumbnail")}
          onDragStart={(e) => e.preventDefault()}
          className="w-full h-full object-cover pointer-events-none select-none [-webkit-user-drag:none]"
        />
      )}

      {isIntersecting && (
        <video
          src={src}
          poster={poster}
          autoPlay
          muted
          loop
          playsInline
          draggable={false}
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        />
      )}
    </div>
  );
};

const DraggableCarousel = ({ children }: { children: React.ReactNode }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = (e: MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    scrollRef.current.classList.add("cursor-grabbing");
    scrollRef.current.classList.remove("cursor-grab");
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
    if (scrollRef.current) {
      scrollRef.current.classList.add("cursor-grab");
      scrollRef.current.classList.remove("cursor-grabbing");
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging || !scrollRef.current) return;
    e.preventDefault();
    const x = e.pageX - scrollRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    scrollRef.current.scrollLeft = scrollLeft.current - walk;
  };

  return (
    <div className="w-full">
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseUpOrLeave}
        onMouseUp={handleMouseUpOrLeave}
        onMouseMove={handleMouseMove}
        className="flex gap-4 sm:gap-5 overflow-x-auto hide-scroll cursor-grab select-none -ml-5 w-[calc(100%+1.25rem)] sm:ml-0"
      >
        <div
          className="flex-shrink-0 pointer-events-none"
          style={{ width: "max(1.5rem, calc((100vw - 1280px) / 2))" }}
        />
        {children}
        <div
          className="flex-shrink-0 pointer-events-none"
          style={{ width: "max(1.5rem, calc((100vw - 1280px) / 2))" }}
        />
      </div>
    </div>
  );
};

export default function FeaturesShowcase() {
  const t = useTranslations("featuresShowcase");

  return (
    <div className="w-full bg-black">
      <style>{`
        .hide-scroll::-webkit-scrollbar {
          display: none;
        }
        .hide-scroll {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>

      <section className="w-full py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 mb-16">
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mb-6">
            {t("videos.titleLine1")} <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-300 to-neutral-600">
              {t("videos.titleLine2")}
            </span>
          </h2>
          <p className="text-xl text-neutral-400 font-light leading-relaxed max-w-xl">
            {t("videos.description")}
          </p>
        </div>
        <DraggableCarousel>
          {videosData.map((feature) => (
            <article key={feature.id} className="flex-shrink-0 h-[200px] sm:h-[350px] md:h-[470px]">
              <div
                className="relative h-full squircle-element-xl overflow-hidden border border-white/10 group shadow-2xl"
                style={{ aspectRatio: feature.aspectRatio || "16/9" }}
              >
                <LazyVideo src={feature.src} poster={feature.poster} />
              </div>
            </article>
          ))}
        </DraggableCarousel>
      </section>

      <section className="w-full py-24 overflow-hidden">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 mb-16">
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mb-6">
            {t("images.titleLine1")} <br className="hidden sm:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-neutral-300 to-neutral-600">
              {t("images.titleLine2")}
            </span>
          </h2>
          <p className="text-xl text-neutral-400 font-light leading-relaxed max-w-xl">
            {t("images.description")}
          </p>
        </div>
        <DraggableCarousel>
          {imagesData.map((feature) => (
            <article key={feature.id} className="flex-shrink-0 h-[200px] sm:h-[350px] md:h-[470px]">
              <div
                className="relative h-full squircle-element-xl overflow-hidden bg-neutral-900 border border-white/10 group shadow-2xl"
                style={{ aspectRatio: feature.aspectRatio || "16/9" }}
              >
                <img
                  src={feature.src}
                  alt={t(`alts.${feature.alt.toLowerCase()}`)}
                  draggable={false}
                  onDragStart={(e) => e.preventDefault()}
                  loading="lazy"
                  decoding="async"
                  className="w-full h-full object-cover pointer-events-none select-none [-webkit-user-drag:none]"
                />
              </div>
            </article>
          ))}
        </DraggableCarousel>
      </section>
    </div>
  );
}