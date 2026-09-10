import { useEffect, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { IMAGE_DEVICE_TEMPLATES } from "@/types";
import { useTranslations } from "next-intl";

export function DeviceCard({
    tpl,
    isActive,
    onClick,
}: {
    tpl: (typeof IMAGE_DEVICE_TEMPLATES)[number];
    isActive: boolean;
    onClick: () => void;
}) {
    const t = useTranslations("mockupMenu");
    const videoRef = useRef<HTMLVideoElement | null>(null);
    const [isHovering, setIsHovering] = useState(false);
    const [videoReady, setVideoReady] = useState(false);

    useEffect(() => {
        const video = videoRef.current;
        if (!video) return;

        let isMounted = true;

        if (isHovering) {
            const play = async () => {
                try {
                    await video.play();
                } catch {
                }
            };
            if (isMounted) play();
        } else {
            video.pause();
            video.currentTime = 0;
        }

        return () => {
            isMounted = false;
        };
    }, [isHovering]);

    return (
        <div className="relative w-40 shrink-0 snap-start">
            <button
                type="button"
                onClick={onClick}
                onMouseEnter={() => setIsHovering(true)}
                onMouseLeave={() => setIsHovering(false)}
                className={`group flex h-full w-full overflow-hidden rounded-2xl border text-left transition-all duration-300 active:scale-[0.98] ${
                    isActive ? "border-foreground/30 bg-card" : "border-border bg-card/60 hover:border-foreground/30"
                }`}
            >
                <div className="relative aspect-3/4 w-full overflow-hidden bg-[#0d0d10]">
                    <div
                        className="absolute inset-0 z-10"
                        style={{
                            background: isActive
                                ? `linear-gradient(135deg, ${tpl.accentColor}22 0%, transparent 70%)`
                                : `linear-gradient(135deg, ${tpl.accentColor}10 0%, transparent 70%)`,
                        }}
                    />
                    <img
                        src={tpl.posterUrl}
                        alt={tpl.title}
                        draggable={false}
                        className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ${
                            isHovering ? "scale-105 opacity-0" : "scale-100 opacity-100"
                        }`}
                    />
                    <video
                        ref={videoRef}
                        src={tpl.videoUrl}
                        poster={tpl.posterUrl}
                        muted
                        loop
                        playsInline
                        preload="metadata"
                        onLoadedData={() => setVideoReady(true)}
                        className={`absolute inset-0 h-full w-full object-cover transition-all duration-500 ${
                            isHovering && videoReady ? "scale-105 opacity-100" : "scale-100 opacity-0"
                        }`}
                    />
                    <div
                        className={`absolute inset-0 z-20 bg-black/20 transition-opacity duration-300 ${
                            isHovering ? "opacity-100" : "opacity-0"
                        }`}
                    />
                    <div className="absolute inset-x-0 bottom-0 z-30 transition-all duration-300">
                        <div className="absolute inset-0 h-24 bg-gradient-to-t from-black via-black/70 to-transparent" />
                        <div className="relative flex items-center gap-2 p-3">
                            <Icon icon={tpl.icon} width={10} />
                            <span className="truncate text-[11px] text-white">{t(`devices.${tpl.id}`)}</span>
                        </div>
                    </div>
                    {isActive && (
                        <div
                            className="absolute top-2 right-2 z-40 flex size-4 items-center justify-center rounded-full"
                            style={{ background: tpl.accentColor }}
                        >
                            <Icon icon="mdi:check-bold" width={8} className="text-white" />
                        </div>
                    )}
                </div>
            </button>
            {isActive && (
                <div
                    className="pointer-events-none absolute inset-0 rounded-2xl"
                    style={{ boxShadow: `inset 0 0 0 1.5px ${tpl.accentColor}88` }}
                />
            )}
        </div>
    );
}