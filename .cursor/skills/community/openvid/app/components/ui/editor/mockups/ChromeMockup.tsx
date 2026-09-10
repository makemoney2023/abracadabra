"use client";
import type { MockupRenderProps } from "@/types/mockup.types";
import { hexToRgba } from "@/lib/utils";
import { deriveSearchBg } from "@/lib/color.utils";

interface ChromeMockupProps extends MockupRenderProps {
  shadows?: number;
  roundedCorners?: number;
}

export function ChromeMockup({
  children,
  config,
  className = "",
  shadows = 20,
  roundedCorners,
  maskStyles,
  onConfigChange
}: ChromeMockupProps) {
  const isDark = config.darkMode;
  const frameColor = config.frameColor;
  const url = config.url;
  const cornerRadius = roundedCorners ?? config.cornerRadius;

  const headerOpacity = config.headerOpacity ?? 100;
  const headerScale = (config.headerScale || 100) / 100;
  const bgColor = isDark ? "#1e1e1e" : "#ffffff";
  const tabBarBg = frameColor;
  const addressBg = frameColor;
  const tabActiveBg = deriveSearchBg(frameColor);
  const urlBarBgBase = deriveSearchBg(frameColor);
  const addressBorder = isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)";
  const textColor = isDark ? "#9ca3af" : "#374151";
  const iconColor = isDark ? "rgba(255,255,255,0.5)" : "rgba(55,65,81,0.7)";

  const tabBarH = 32 * headerScale;
  const tabH = 28 * headerScale;
  const tabW = 180 * headerScale;
  const tabPadX = 12 * headerScale;
  const tabFontSz = 10.5 * headerScale;
  const tabIconSz = 12 * headerScale;
  const tabML = 8 * headerScale;
  const tabRadius = 4 * headerScale;
  const plusSize = 14 * headerScale;
  const plusML = 4 * headerScale;
  const winBtnW = 42 * headerScale;
  const addrH = 32 * headerScale;
  const addrPadX = 8 * headerScale;
  const navBtnSize = 14 * headerScale;
  const navGap = 2 * headerScale;
  const urlH = 26 * headerScale;
  const urlFontSz = 11 * headerScale;
  const urlPadX = 12 * headerScale;
  const rightGap = 2 * headerScale;
  const iconSz = 14 * headerScale;

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
          className="w-full h-full flex flex-col overflow-hidden"
          style={{ borderRadius: `${cornerRadius}px` }}
        >
          <div
            className="flex items-end select-none shrink-0"
            style={{
              height: `${tabBarH}px`,
              backgroundColor: hexToRgba(tabBarBg, headerOpacity),
              borderTopLeftRadius: `${cornerRadius}px`,
              borderTopRightRadius: `${cornerRadius}px`,
            }}
          >
            <div
              className="flex items-center shrink-0"
              style={{
                height: `${tabH}px`,
                width: `${tabW}px`,
                padding: `0 ${tabPadX}px`,
                marginLeft: `${tabML}px`,
                backgroundColor: hexToRgba(tabActiveBg, headerOpacity),
                borderRadius: `${tabRadius}px ${tabRadius}px 0 0`,
                borderTop: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)"}`,
                borderLeft: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)"}`,
                borderRight: `1px solid ${isDark ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.15)"}`,
                gap: `${8 * headerScale}px`,
              }}
            >
              <svg style={{ width: `${tabIconSz}px`, height: `${tabIconSz}px`, flexShrink: 0, color: "#2563eb" }} fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
              </svg>
              <input
                type="text"
                value={url || ""}
                onChange={(e) => onConfigChange?.({ url: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                placeholder="New tab"
                className="truncate flex-1 bg-transparent border-none outline-none w-full placeholder:text-inherit/50 cursor-text"
                style={{ fontSize: `${tabFontSz}px`, color: textColor }}
              />
              <svg style={{ width: `${tabIconSz}px`, height: `${tabIconSz}px`, flexShrink: 0, color: iconColor }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M6 18L18 6M6 6l12 12" strokeWidth="2.5" strokeLinecap="round" />
              </svg>
            </div>
            <div
              className="flex items-center justify-center"
              style={{
                marginLeft: `${plusML}px`,
                marginBottom: `${6 * headerScale}px`,
                width: `${plusSize * 1.8}px`,
                height: `${plusSize * 1.8}px`,
                color: iconColor,
              }}
            >
              <svg style={{ width: `${plusSize}px`, height: `${plusSize}px` }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path d="M12 4v16m8-8H4" strokeWidth="3" strokeLinecap="round" />
              </svg>
            </div>
            <div className="ml-auto flex h-full" style={{ color: iconColor }}>
              <div className="flex items-center justify-center" style={{ width: `${winBtnW}px` }}>
                <svg width={10 * headerScale} height={1 * headerScale} viewBox="0 0 10 1" fill="currentColor"><rect width="10" height="1" /></svg>
              </div>
              <div className="flex items-center justify-center" style={{ width: `${winBtnW}px` }}>
                <svg width={9 * headerScale} height={9 * headerScale} viewBox="0 0 9 9" fill="none" stroke="currentColor">
                  <rect x="0.5" y="0.5" width="8" height="8" strokeWidth="1" />
                </svg>
              </div>
              <div className="flex items-center justify-center" style={{ width: `${winBtnW}px`, borderTopRightRadius: `${cornerRadius}px` }}>
                <svg width={10 * headerScale} height={10 * headerScale} viewBox="0 0 10 10" fill="none" stroke="currentColor">
                  <path d="M1 1l8 8M9 1L1 9" strokeWidth="1.2" />
                </svg>
              </div>
            </div>
          </div>
          <div
            className="flex items-center justify-between select-none shrink-0"
            style={{
              height: `${addrH}px`,
              padding: `0 ${addrPadX}px`,
              backgroundColor: hexToRgba(addressBg, headerOpacity),
              borderBottom: `1px solid ${addressBorder}`,
              gap: `${8 * headerScale}px`,
            }}
          >
            <div className="flex items-center shrink-0" style={{ gap: `${navGap}px`, color: iconColor }}>
              <div className="p-1.5">
                <svg width={navBtnSize} height={navBtnSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="p-1.5" style={{ opacity: 0.35 }}>
                <svg width={navBtnSize} height={navBtnSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 12h14m-7 7l7-7-7-7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="p-1.5">
                <svg width={navBtnSize} height={navBtnSize} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 11-2.12-5.88L21 9m0 0V3m0 6h-6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
            <div className="flex-1">
              <div
                className="rounded-full w-full flex items-center"
                style={{
                  height: `${urlH}px`,
                  padding: `0 ${urlPadX}px`,
                  backgroundColor: hexToRgba(urlBarBgBase, headerOpacity),
                  gap: `${8 * headerScale}px`,
                  color: textColor,
                }}
              >
                <svg style={{ width: `${iconSz * 0.75}px`, height: `${iconSz * 0.75}px`, flexShrink: 0, opacity: 0.6 }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" strokeWidth="2" />
                </svg>
                <input
                  type="text"
                  value={url || ""}
                  onChange={(e) => onConfigChange?.({ url: e.target.value })}
                  onMouseDown={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => e.stopPropagation()}
                  className="truncate flex-1 bg-transparent border-none outline-none w-full cursor-text"
                  style={{ fontSize: `${urlFontSz}px`, color: "inherit" }}
                />
              </div>
            </div>
            <div className="flex items-center shrink-0" style={{ gap: `${rightGap}px`, color: iconColor }}>
              <div className="p-1.5">
                <svg style={{ width: `${iconSz * 0.85}px`, height: `${iconSz * 0.85}px` }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" strokeWidth="2" />
                </svg>
              </div>
              <div className="p-1.5">
                <svg style={{ width: `${iconSz * 0.85}px`, height: `${iconSz * 0.85}px` }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" strokeWidth="2.5" />
                </svg>
              </div>
            </div>
          </div>
          <div
            className="flex-1 relative overflow-hidden"
            style={{ backgroundColor: bgColor }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}