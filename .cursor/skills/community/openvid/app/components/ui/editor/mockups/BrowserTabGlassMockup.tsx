"use client";

import type { MockupRenderProps } from "@/types/mockup.types";

interface BrowserTabGlassMockupProps extends MockupRenderProps {
    shadows?: number;
    roundedCorners?: number;
}

export function BrowserTabGlassMockup({
    children,
    config,
    className = "",
    shadows = 20,
    roundedCorners,
    onConfigChange
}: BrowserTabGlassMockupProps) {
    const isDark = config.darkMode;
    const url = config.url;
    const cornerRadius = roundedCorners ?? config.cornerRadius;

    const headerScale = (config.headerScale || 100) / 100;

    const bgColor = isDark ? "#1e1e1e" : "#f9f9f9";

    const tabBg = isDark ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.8)";
    const tabBorderColor = isDark ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.9)";
    const tabTitleColor = isDark ? "#d1d5db" : "#374151";
    const tabCloseColor = isDark ? "rgba(209,213,219,0.6)" : "rgba(75,85,99,0.8)";
    const tabCloseBg = isDark ? "rgba(255,255,255,0.1)" : "rgba(156,163,175,0.2)";

    const tabBarH = 24 * headerScale;
    const dotSize = 10 * headerScale;
    const dotGap = 6 * headerScale;
    const dotPaddingX = 4 * headerScale;
    const tabH = 28 * headerScale;
    const tabW = 184 * headerScale;
    const tabPaddingX = 12 * headerScale;
    const tabIconSize = 12 * headerScale;
    const tabFontSize = 10 * headerScale;
    const addBtnSize = 24 * headerScale;
    const winIconGap = 24 * headerScale;
    const winIconMB = 10 * headerScale;
    const winIconMR = 4 * headerScale;

    return (
        <div
            className={`glass-border relative w-full h-full flex flex-col overflow-hidden ${className}`}
            style={{
                borderRadius: `${cornerRadius}px`,
                boxShadow: shadows > 0
                    ? `0 ${shadows * 0.3}px ${shadows}px rgba(0,0,0,1)`
                    : "none",
                borderTop: "1px solid rgba(255,255,255,0.6)",
                borderLeft: "1px solid rgba(255,255,255,0.6)",
            }}
        >
            <div
                className="flex items-end justify-between select-none shrink-0 relative z-10"
                style={{
                    height: `${tabBarH}px`,
                    paddingLeft: `${16 * headerScale}px`,
                    paddingRight: `${4 * headerScale}px`,
                    borderTopLeftRadius: `${cornerRadius}px`,
                    borderTopRightRadius: `${cornerRadius}px`,
                }}
            >
                <div className="flex items-end" style={{ gap: `${12 * headerScale}px` }}>
                    <div
                        className="flex"
                        style={{ gap: `${dotGap}px`, paddingLeft: `${dotPaddingX}px`, marginBottom: `${10 * headerScale}px` }}
                    >
                        {[0, 1, 2].map(i => (
                            <div
                                key={i}
                                className="rounded-full"
                                style={{
                                    width: `${dotSize}px`,
                                    height: `${dotSize}px`,
                                    backgroundColor: "rgba(255,255,255,0.2)",
                                    border: "1px solid rgba(255,255,255,0.3)",
                                }}
                            />
                        ))}
                    </div>

                    <div
                        className="flex items-center justify-between"
                        style={{
                            width: `${tabW}px`,
                            height: `${tabH}px`,
                            padding: `0 ${tabPaddingX}px`,
                            backgroundColor: tabBg,
                            backdropFilter: "blur(12px)",
                            borderTop: `1px solid ${tabBorderColor}`,
                            borderLeft: `1px solid ${tabBorderColor}`,
                            borderRight: `1px solid ${tabBorderColor}`,
                            borderRadius: `${8 * headerScale}px ${8 * headerScale}px 0 0`,
                            boxShadow: "-5px 0 15px rgba(0,0,0,0.05)",
                        }}
                    >
                        <div className="flex items-center overflow-hidden" style={{ gap: `${8 * headerScale}px` }}>
                            <div
                                style={{
                                    width: `${tabIconSize}px`,
                                    height: `${tabIconSize}px`,
                                    borderRadius: "50%",
                                    backgroundColor: "#60a5fa",
                                    boxShadow: "0 0 8px rgba(96,165,250,0.8)",
                                    flexShrink: 0,
                                }}
                            />
                            <input
                                type="text"
                                value={url || ""}
                                onChange={(e) => onConfigChange?.({ url: e.target.value })}
                                onMouseDown={(e) => e.stopPropagation()}
                                onPointerDown={(e) => e.stopPropagation()}
                                onClick={(e) => e.stopPropagation()}
                                placeholder="Nueva pestaña"
                                className="font-medium truncate bg-transparent border-none outline-none w-full placeholder:text-inherit/50"
                                style={{ fontSize: `${tabFontSize}px`, letterSpacing: "-0.02em", color: tabTitleColor }}
                            />
                        </div>
                        <div
                            className="flex items-center justify-center relative flex-shrink-0"
                            style={{
                                width: `${8 * headerScale}px`,
                                height: `${8 * headerScale}px`,
                                borderRadius: "50%",
                                backgroundColor: tabCloseBg,
                                marginLeft: `${8 * headerScale}px`,
                            }}
                        >
                            <div style={{ position: "absolute", width: "100%", height: `${1 * headerScale}px`, backgroundColor: tabCloseColor, transform: "rotate(45deg)" }} />
                            <div style={{ position: "absolute", width: "100%", height: `${1 * headerScale}px`, backgroundColor: tabCloseColor, transform: "rotate(-45deg)" }} />
                        </div>
                    </div>

                    <div
                        className="flex items-center justify-center rounded-full"
                        style={{
                            width: `${addBtnSize}px`,
                            height: `${addBtnSize}px`,
                            marginBottom: `${4 * headerScale}px`,
                            backgroundColor: "rgba(255,255,255,0.2)",
                            border: "1px solid rgba(255,255,255,0.3)",
                            color: "rgba(255,255,255,0.8)",
                            fontSize: `${14 * headerScale}px`,
                            lineHeight: 1,
                        }}
                    >
                        +
                    </div>
                </div>

                <div
                    className="flex items-center"
                    style={{ gap: `${winIconGap}px`, marginBottom: `${winIconMB}px`, marginRight: `${winIconMR}px` }}
                >
                    <div style={{ width: `${12 * headerScale}px`, height: `${1.2 * headerScale}px`, backgroundColor: "rgba(255,255,255,0.5)" }} />
                    <div style={{ width: `${9 * headerScale}px`, height: `${9 * headerScale}px`, border: `${2 * headerScale}px solid rgba(255,255,255,0.5)`, borderRadius: `${1 * headerScale}px` }} />
                    <svg style={{ width: `${12 * headerScale}px`, height: `${12 * headerScale}px` }} fill="none" stroke="rgba(255,255,255,0.5)" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </div>
            </div>

            <div
                className="flex-1 relative overflow-hidden"
                style={{
                    backgroundColor: bgColor,
                    borderBottomLeftRadius: `${Math.max(0, cornerRadius - 3)}px`,
                    borderBottomRightRadius: `${Math.max(0, cornerRadius - 3)}px`,
                }}
            >
                {children}
            </div>
        </div>
    );
}