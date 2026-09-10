"use client";

import { useMemo, useState } from "react";

export default function BannerCTA() {
    const [spotlight, setSpotlight] = useState({ x: 50, y: 50 });
    const [isHovered, setIsHovered] = useState(false);

    // Patrón binario en SVG data URI
    const binaryPattern = useMemo(
        () =>
            `data:image/svg+xml,%3Csvg width='40' height='40' viewBox='0 0 40 40' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='rgba(255,255,255,0.14)' font-family='monospace' font-size='10' font-weight='700' letter-spacing='1'%3E%3Ctext x='0' y='10'%3E011010%3C/text%3E%3Ctext x='0' y='20'%3E100101%3C/text%3E%3Ctext x='0' y='30'%3E111000%3C/text%3E%3Ctext x='0' y='40'%3E000111%3C/text%3E%3C/g%3E%3C/svg%3E`,
        []
    );

    const handleMove = (e: React.MouseEvent<HTMLElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        setSpotlight({ x, y });
    };

    return (
        <section
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            onMouseMove={handleMove}
            className="relative w-full overflow-hidden border-t border-white/5 bg-[#050505] py-24 sm:py-32 min-h-[20vh] sm:min-h-[60vh]"
        >
            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(0,163,255,0.1)_0%,transparent_70%)]"
            />

            <div
                aria-hidden="true"
                className="
                        hidden sm:absolute
                        sm:inset-0
                        sm:pointer-events-none
                        sm:bg-[radial-gradient(circle_at_center,transparent_35%,rgba(0,0,0,0.35)_100%)]
                    "
            />

            <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-35">
                <div
                    className="absolute inset-0"
                    style={{
                        backgroundImage: `
              linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)
            `,
                        backgroundSize: "72px 72px",
                        maskImage: "radial-gradient(circle at center, black 0%, black 55%, transparent 100%)",
                        WebkitMaskImage: "radial-gradient(circle at center, black 0%, black 55%, transparent 100%)",
                    }}
                />
                <div
                    className="absolute inset-0 blur-2xl opacity-50"
                    style={{
                        backgroundImage: `
              linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)
            `,
                        backgroundSize: "72px 72px",
                    }}
                />
            </div>

            <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                style={{
                    opacity: isHovered ? 1 : 0,
                    background: `radial-gradient(circle at ${spotlight.x}% ${spotlight.y}%, rgba(255,255,255,0.13) 0%, rgba(0,163,255,0.07) 18%, rgba(255,255,255,0.03) 32%, transparent 58%)`,
                    mixBlendMode: "screen",
                }}
            />

            <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none px-6">
                <div
                    className="relative w-full max-w-[1500px] h-[240px] sm:h-[360px] md:h-[460px] opacity-70"
                    style={{
                        backgroundImage: `url("${binaryPattern}")`,
                        backgroundSize: "40px 40px",
                        WebkitMaskImage: `url("/svg/openvid.svg")`,
                        WebkitMaskSize: "contain",
                        WebkitMaskPosition: "center",
                        WebkitMaskRepeat: "no-repeat",
                        maskImage: `url("/svg/openvid.svg")`,
                        maskSize: "contain",
                        maskPosition: "center",
                        maskRepeat: "no-repeat",
                        filter: isHovered ? "brightness(1.2) contrast(1.05)" : "brightness(0.95) contrast(1)",
                    }}
                />

                <div
                    className="absolute inset-0 mx-auto max-w-[1500px] blur-3xl transition-opacity duration-300"
                    style={{
                        opacity: isHovered ? 0.8 : 0.25,
                        background: `radial-gradient(circle at ${spotlight.x}% ${spotlight.y}%, rgba(255,255,255,0.18) 0%, rgba(0,163,255,0.08) 24%, transparent 60%)`,
                        WebkitMaskImage: `url("/svg/openvid.svg")`,
                        WebkitMaskSize: "contain",
                        WebkitMaskPosition: "center",
                        WebkitMaskRepeat: "no-repeat",
                        maskImage: `url("/svg/openvid.svg")`,
                        maskSize: "contain",
                        maskPosition: "center",
                        maskRepeat: "no-repeat",
                    }}
                />
            </div>

            <div
                aria-hidden="true"
                className="hidden sm:block pointer-events-none absolute inset-x-0 bottom-0 h-[180px] bg-[linear-gradient(to_bottom,transparent,rgba(5,5,5,0.55),#050505)]"
            />
        </section>
    );
}