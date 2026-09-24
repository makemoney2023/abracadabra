"use client";

import { useEffect, useRef } from "react";

export function OrbitalVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      const video = videoRef.current;
      if (!video) return;

      if (reducedMotion.matches) {
        video.pause();
        return;
      }

      void video.play().catch(() => undefined);
    };

    syncPlayback();
    reducedMotion.addEventListener("change", syncPlayback);
    return () => reducedMotion.removeEventListener("change", syncPlayback);
  }, []);

  return (
    <video
      ref={videoRef}
      autoPlay
      loop
      muted
      playsInline
      preload="metadata"
      aria-hidden="true"
      className="h-full w-full scale-110 object-cover opacity-90 contrast-125 saturate-150"
    >
      <source src="/orbital-horizon/video.mp4" type="video/mp4" />
    </video>
  );
}
