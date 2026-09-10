"use client";
import type { MockupRenderProps } from "@/types/mockup.types";
import { hexToRgba } from "@/lib/utils";
import { deriveSearchBg } from "@/lib/color.utils";

interface BraveGlassMockupProps extends MockupRenderProps {
    shadows?: number;
    roundedCorners?: number;
}

export function BraveGlassMockup({
    children,
    config,
    className = "",
    shadows = 20,
    roundedCorners,
    maskStyles,
    onConfigChange
}: BraveGlassMockupProps) {
    const isDark = config.darkMode;
    const frameColor = config.frameColor;
    const url = config.url;
    const cornerRadius = roundedCorners ?? config.cornerRadius;

    const headerOpacity = config.headerOpacity ?? 100;
    const headerScale = (config.headerScale || 100) / 100;

    const bgColor = isDark ? "#1e1e1e" : "#f9f9f9";
    const borderColor = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)";
    const textColor = isDark ? "#9ca3af" : "#6b7280";
    const urlBarBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)";
    const urlBarBgBase = deriveSearchBg(frameColor);

    const baseHeight = 32;
    const basePadding = 12;
    const baseGap = 12;
    const baseIconSize = 14;
    const baseUrlBarHeight = 26;
    const baseFontSize = 12;

    const headerHeight = baseHeight * headerScale;
    const headerPadding = basePadding * headerScale;
    const navGap = 12 * headerScale;
    const iconSize = baseIconSize * headerScale;
    const urlBarHeight = baseUrlBarHeight * headerScale;
    const fontSize = baseFontSize * headerScale;
    const urlBarPadding = 10 * headerScale;
    const urlBarMargin = 8 * headerScale;
    const rightGroupGap = 10 * headerScale;
    const winBtnPadding = 12 * headerScale;

    return (
        <div className={`relative w-full h-full ${className}`}>

            <div
                className="absolute inset-0 pointer-events-none"
                style={{
                    borderRadius: `${cornerRadius}px`,
                    boxShadow: shadows > 0 ? `0 ${shadows * 0.3}px ${shadows}px rgba(0,0,0,1)` : "none",
                }}
            />

            <div
                className="relative w-full h-full overflow-hidden"
                style={{
                    ...maskStyles,
                    borderRadius: `${cornerRadius}px`,
                }}
            >
                <div
                    className="glass-border w-full h-full flex flex-col overflow-hidden"
                    style={{
                        borderRadius: `${cornerRadius}px`,
                        borderTop: "1px solid rgba(255,255,255,0.6)",
                        borderLeft: "1px solid rgba(255,255,255,0.6)",
                    }}
                >
                    <div
                        className="flex items-center justify-between select-none shrink-0"
                        style={{
                            height: `${headerHeight}px`,
                            backgroundColor: hexToRgba(frameColor, headerOpacity),
                            borderBottom: `1px solid ${borderColor}`,
                            borderTopLeftRadius: `${cornerRadius}px`,
                            borderTopRightRadius: `${cornerRadius}px`,
                        }}
                    >
                        <div
                            className="flex items-center"
                            style={{
                                gap: `${navGap}px`,
                                paddingLeft: `${headerPadding}px`,
                                color: textColor,
                            }}
                        >
                            <svg
                                style={{ width: `${iconSize * 0.75}px`, height: `${iconSize * 0.75}px` }}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
                            </svg>
                            <svg
                                style={{ width: `${iconSize * 0.75}px`, height: `${iconSize * 0.75}px`, opacity: 0.35 }}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                            </svg>
                            <svg
                                style={{ width: `${iconSize * 0.75}px`, height: `${iconSize * 0.75}px` }}
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                                />
                            </svg>
                        </div>

                        <div className="flex-1 max-w-xl" style={{ margin: `0 ${urlBarMargin}px` }}>
                            <div
                                className="rounded w-full flex items-center justify-between"
                                style={{
                                    height: `${urlBarHeight}px`,
                                    padding: `0 ${urlBarPadding}px`,
                                    backgroundColor: hexToRgba(urlBarBgBase, headerOpacity),
                                    border: `1px solid ${urlBarBorder}`,
                                    color: textColor,
                                }}
                            >
                                <svg
                                    style={{ width: `${iconSize * 0.65}px`, height: `${iconSize * 0.65}px`, opacity: 0.6, flexShrink: 0 }}
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                                    />
                                </svg>
                                <input
                                    type="text"
                                    value={url}
                                    onChange={(e) => onConfigChange?.({ url: e.target.value })}
                                    onMouseDown={(e) => e.stopPropagation()}
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex-1 text-center font-medium truncate bg-transparent border-none outline-none"
                                    style={{
                                        fontSize: `${fontSize}px`,
                                        padding: `0 ${urlBarPadding}px`,
                                        color: "inherit"
                                    }}
                                />
                                <svg
                                    style={{ width: `${iconSize * 0.75}px`, height: `${iconSize * 0.75}px`, flexShrink: 0, color: "rgba(234,179,8,0.8)" }}
                                    fill="currentColor"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                                    />
                                </svg>
                            </div>
                        </div>

                        <div className="flex items-center h-full" style={{ color: textColor }}>
                            <div className="flex items-center" style={{ gap: `${rightGroupGap}px`, paddingRight: `${rightGroupGap}px` }}>
                                <svg style={{ width: `${iconSize * 0.75}px`, height: `${iconSize * 0.75}px` }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                <svg style={{ width: `${iconSize * 0.75}px`, height: `${iconSize * 0.75}px` }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                                </svg>
                            </div>
                            <div className="flex h-full">
                                <div className="flex items-center justify-center" style={{ padding: `0 ${winBtnPadding}px` }}>
                                    <svg width={10 * headerScale} height={1 * headerScale} viewBox="0 0 10 1" fill="currentColor">
                                        <rect width="10" height="1" />
                                    </svg>
                                </div>
                                <div className="flex items-center justify-center" style={{ padding: `0 ${winBtnPadding}px` }}>
                                    <svg width={9 * headerScale} height={9 * headerScale} viewBox="0 0 10 10" fill="none" stroke="currentColor">
                                        <rect x="0.5" y="0.5" width="9" height="9" strokeWidth="1" />
                                    </svg>
                                </div>
                                <div className="flex items-center justify-center" style={{ padding: `0 ${winBtnPadding}px`, borderTopRightRadius: `${cornerRadius}px` }}>
                                    <svg width={9 * headerScale} height={9 * headerScale} viewBox="0 0 10 10" fill="none" stroke="currentColor">
                                        <path d="M1 1l8 8M9 1L1 9" strokeWidth="1.2" />
                                    </svg>
                                </div>
                            </div>
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
            </div>
        </div>
    );
}