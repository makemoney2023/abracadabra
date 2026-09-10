"use client";

import type { MockupMotionPresetId } from "@/lib/mockup-motion";

type MotionCategory = "Entrance" | "Continue" | "Exit";

const CATEGORY_ACCENT: Record<MotionCategory, string> = {
  Entrance: "59, 130, 246",
  Continue: "167, 139, 250",
  Exit: "251, 113, 133",
};

interface MotionPresetIconProps {
  presetId: MockupMotionPresetId;
  category: MotionCategory;
  active?: boolean;
  size?: number;
  fill?: boolean;
  className?: string;
  forceAnimate?: boolean; 
}

export function MotionPresetIcon({
  presetId,
  category,
  active = false,
  size = 40,
  fill = false,
  className = "",
  forceAnimate = false,
}: MotionPresetIconProps) {
  const accent = CATEGORY_ACCENT[category];

  return (
    <div
      className={`mp-stage relative overflow-hidden rounded-[10px] border transition-shadow duration-500 ease-out group-hover:shadow-[0_0_18px_-4px_rgba(var(--mp-accent),0.5)] ${
        active ? "border-white/20 shadow-[0_0_14px_-4px_rgba(var(--mp-accent),0.45)]" : "border-white/10"
      } ${fill ? "h-full w-full" : "shrink-0"} ${forceAnimate ? "force-animate" : ""} ${className}`}
      style={
        {
          ...(fill ? {} : { width: size, height: size }),
          background: "linear-gradient(180deg, #17171a 0%, #050505 100%)",
          "--mp-accent": accent,
        } as React.CSSProperties
      }
    >
      <div className="mp-grid pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-white/[0.06] to-transparent" />
      <div className="mp-perspective absolute inset-0 flex items-center justify-center">
        <span className={`mp-card mp-card--${presetId}`} />
      </div>
    </div>
  );
}

export function MotionPresetIconStyles() {
  return (
    <style jsx global>{`
      .mp-grid {
        opacity: 0.05;
        background-image: linear-gradient(
            rgba(255, 255, 255, 0.7) 1px,
            transparent 1px
          ),
          linear-gradient(90deg, rgba(255, 255, 255, 0.7) 1px, transparent 1px);
        background-size: 8px 8px;
      }
      .mp-perspective {
        perspective: 260px;
        transform-style: preserve-3d;
      }
      .mp-card {
        display: block;
        width: 42%;
        height: 37%;
        border-radius: 4px;
        background: linear-gradient(
          135deg,
          rgba(255, 255, 255, 0.95),
          rgba(255, 255, 255, 0.55)
        );
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.35);
        transform-origin: 50% 50%;
        backface-visibility: hidden;
      }

      /* 2. Añadimos la clase .force-animate junto a .group:hover a todos los selectores */
      @media (prefers-reduced-motion: no-preference) {
        .group:hover .mp-card,
        .force-animate .mp-card {
          will-change: transform, filter, opacity;
        }
        .group:hover .mp-card--focus-in,
        .force-animate .mp-card--focus-in {
          animation: mp-focus-in 1.1s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--depth-emerge,
        .force-animate .mp-card--depth-emerge {
          animation: mp-depth-emerge 1.5s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--z-spin-reveal,
        .force-animate .mp-card--z-spin-reveal {
          animation: mp-z-spin-reveal 1.3s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--cinematic-showcase,
        .force-animate .mp-card--cinematic-showcase {
          animation: mp-cinematic-showcase 2.6s ease-in-out infinite alternate;
        }
        .group:hover .mp-card--macro-track,
        .force-animate .mp-card--macro-track {
          animation: mp-macro-track 2.4s ease-in-out infinite alternate;
        }
        .group:hover .mp-card--exit-fade-down,
        .force-animate .mp-card--exit-fade-down {
          animation: mp-exit-fade-down 1s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--exit-scale-blur,
        .force-animate .mp-card--exit-scale-blur {
          animation: mp-exit-scale-blur 1s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--whip-showcase,
        .force-animate .mp-card--whip-showcase {
          animation: mp-whip-showcase 3s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--spatial-roam,
        .force-animate .mp-card--spatial-roam {
          animation: mp-spatial-roam 3.2s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--rise-crash,
        .force-animate .mp-card--rise-crash {
          animation: mp-rise-crash 2.8s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--crane-sweep,
        .force-animate .mp-card--crane-sweep {
          animation: mp-crane-sweep 3.2s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--orbit-entrance,
        .force-animate .mp-card--orbit-entrance {
          animation: mp-orbit-entrance 1.6s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--flick-exit,
        .force-animate .mp-card--flick-exit {
          animation: mp-flick-exit 1s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--hero-reveal,
        .force-animate .mp-card--hero-reveal {
          animation: mp-hero-reveal 1.8s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
        .group:hover .mp-card--macro-pan,
        .force-animate .mp-card--macro-pan {
          animation: mp-macro-pan 2.6s ease-in-out infinite alternate;
        }
        .group:hover .mp-card--screen-glide,
        .force-animate .mp-card--screen-glide {
          animation: mp-screen-glide 2.8s ease-in-out infinite alternate;
        }
        .group:hover .mp-card--float-hold,
        .force-animate .mp-card--float-hold {
          animation: mp-float-hold 3.2s ease-in-out infinite;
        }
        .group:hover .mp-card--spiral-drop,
        .force-animate .mp-card--spiral-drop {
          animation: mp-spiral-drop 1.2s cubic-bezier(0.65, 0, 0.35, 1) infinite alternate;
        }
      }
      @keyframes mp-focus-in {
        0% { transform: scale(1.22); filter: blur(3.5px); opacity: 0.45; }
        100% { transform: scale(1); filter: blur(0); opacity: 1; }
      }
      @keyframes mp-depth-emerge {
        0% { transform: scale(0.45) rotateX(22deg) rotateY(-20deg); filter: blur(5px); opacity: 0; }
        100% { transform: scale(1) rotateX(0) rotateY(0); filter: blur(0); opacity: 1; }
      }
      @keyframes mp-z-spin-reveal {
        0% { transform: scale(0.62) rotateZ(-78deg) rotateX(38deg); opacity: 0.5; }
        100% { transform: scale(1) rotateZ(0) rotateX(0); opacity: 1; }
      }
      @keyframes mp-cinematic-showcase {
        0% { transform: scale(1.4) translate(8%, 6%) rotateX(5deg) rotateY(8deg); filter: blur(1.5px); }
        100% { transform: scale(1) translate(0, 0) rotateX(0) rotateY(0); filter: blur(0); }
      }
      @keyframes mp-macro-track {
        0% { transform: scale(1.7) translate(10%, 10%) rotateX(32deg); }
        100% { transform: scale(1) translate(-6%, -6%) rotateX(0deg); }
      }
      @keyframes mp-exit-fade-down {
        0% { transform: translateY(0); opacity: 1; }
        100% { transform: translateY(30%); opacity: 0; }
      }
      @keyframes mp-exit-scale-blur {
        0% { transform: scale(1); filter: blur(0); opacity: 1; }
        100% { transform: scale(1.3); filter: blur(4.5px); opacity: 0; }
      }
      @keyframes mp-whip-showcase {
        0% { transform: scale(1.12) rotateX(14deg) rotateY(-18deg); }
        40% { transform: scale(1.3) translate(-8%, 3%) rotateX(3deg) rotateY(5deg); }
        52% { transform: scale(1.06) rotateZ(24deg) rotateX(-16deg) rotateY(38deg); }
        64% { transform: scale(1.34) translate(9%, -4%) rotateX(5deg) rotateY(-6deg); }
        100% { transform: scale(1.1) rotateX(12deg) rotateY(16deg); }
      }
      @keyframes mp-spatial-roam {
        0% { transform: scale(1.4) translate(-8%, -8%) rotateX(-26deg) rotateY(24deg); }
        30% { transform: scale(1.55) translate(9%, -9%) rotateX(26deg) rotateY(-28deg); }
        55% { transform: scale(1.18) translate(0, 0) rotateX(-12deg) rotateY(8deg); }
        80% { transform: scale(1.5) translate(-9%, 8%) rotateX(30deg) rotateY(12deg); }
        100% { transform: scale(1.4) translate(8%, 8%) rotateX(-22deg) rotateY(-18deg); }
      }
      @keyframes mp-rise-crash {
        0% { transform: scale(1.14) rotateX(34deg); }
        38% { transform: scale(1.46) translate(0, -8%) rotateX(6deg); }
        54% { transform: scale(1.08) translate(0, 11%) rotateX(-30deg) rotateZ(-15deg); }
        72% { transform: scale(1.3) translate(0, 5%) rotateX(-6deg) rotateZ(5deg); }
        100% { transform: scale(1.1) rotateX(28deg); }
      }
      @keyframes mp-crane-sweep {
        0% { transform: scale(0.96) rotateX(-68deg); }
        36% { transform: scale(1.12) rotateX(-36deg) rotateY(12deg) translate(-5%, 2%); }
        60% { transform: scale(1.34) rotateX(4deg) rotateY(-18deg) translate(6%, -3%); }
        82% { transform: scale(1.14) rotateX(12deg) rotateY(16deg) translate(-3%, 2%); }
        100% { transform: scale(1) rotateX(-58deg); }
      }
      @keyframes mp-orbit-entrance {
        0% { transform: scale(0.55) rotateY(180deg) rotateX(30deg) translateY(20%); opacity: 0; }
        60% { transform: scale(0.9) rotateY(40deg) rotateX(10deg) translateY(5%); opacity: 0.8; }
        100% { transform: scale(1) rotateY(0) rotateX(0) translateY(0); opacity: 1; }
      }
      @keyframes mp-flick-exit {
        0% { transform: rotateY(0) translateX(0) scale(1); opacity: 1; }
        50% { transform: rotateY(40deg) translateX(10%) scale(0.95); opacity: 0.7; }
        100% { transform: rotateY(100deg) translateX(35%) scale(0.8); opacity: 0; }
      }
      @keyframes mp-hero-reveal {
        0% { transform: rotateY(190deg) rotateX(-22deg) scale(1.35); opacity: 0.4; }
        70% { transform: rotateY(12deg) rotateX(0deg) scale(1.02); opacity: 1; }
        100% { transform: rotateY(0) rotateX(0) scale(1); opacity: 1; }
      }
      @keyframes mp-macro-pan {
        0% { transform: scale(1.55) translate(-9%, 7%) rotateY(14deg) rotateX(4deg); }
        100% { transform: scale(1.55) translate(9%, -7%) rotateY(-14deg) rotateX(-4deg); }
      }
      @keyframes mp-screen-glide {
        0% { transform: scale(1.28) translate(2%, -11%) rotateY(6deg) rotateX(-2deg); }
        100% { transform: scale(1.28) translate(-2%, 11%) rotateY(-6deg) rotateX(2deg); }
      }
      @keyframes mp-float-hold {
        0% { transform: translate(0, 0) rotateY(0deg) rotateX(0deg) scale(1); }
        25% { transform: translate(2.5%, -2%) rotateY(6deg) rotateX(-2.5deg) scale(1.03); }
        50% { transform: translate(0, -3.5%) rotateY(0deg) rotateX(-4deg) scale(1.06); }
        75% { transform: translate(-2.5%, -2%) rotateY(-6deg) rotateX(-2.5deg) scale(1.11); }
        100% { transform: translate(0, 0) rotateY(0deg) rotateX(0deg) scale(1.15); }
      }
      @keyframes mp-spiral-drop {
        0% { transform: translateY(0) rotateZ(0) rotateY(0) scale(1); opacity: 1; }
        100% { transform: translateY(38%) rotateZ(85deg) rotateY(38deg) scale(0.55); opacity: 0; }
      }
    `}</style>
  );
}