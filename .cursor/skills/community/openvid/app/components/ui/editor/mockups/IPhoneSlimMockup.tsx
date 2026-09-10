"use client";
import { Icon } from "@iconify/react";
import type { MockupRenderProps } from "@/types/mockup.types";
import { hexToRgba } from "@/lib/utils";

interface IPhoneSlimMockupProps extends MockupRenderProps {
  shadows?: number;
  roundedCorners?: number;
}

export function IPhoneSlimMockup({
  children,
  config,
  className = "",
  shadows = 30,
  roundedCorners,
  maskStyles,
}: IPhoneSlimMockupProps) {
  const isDark = config.darkMode;
  const frameColor = isDark ? config.frameColor : "#e5e5e5";
  const cornerRadius = roundedCorners ?? config.cornerRadius;

  const headerOpacity = config.headerOpacity ?? 100;
  const headerScale = (config.headerScale || 100) / 100;

  const statusBarHeight = 32 * headerScale;
  const statusBarPaddingX = 24 * headerScale;
  const timeFontSize = 12 * headerScale;
  const signalBarWidth = 3 * headerScale;
  const wifiSize = 13 * headerScale;
  const batteryWidth = 22 * headerScale;
  const batteryHeight = 11 * headerScale;
  const iconsGap = 6 * headerScale;

  const dynamicIslandTop = 6 * headerScale;
  const dynamicIslandMinHeight = 18 * headerScale;
  const dynamicIslandPaddingX = 8 * headerScale;
  const dynamicIslandGap = 4 * headerScale;
  const dotSize = 5 * headerScale;

  const homeIndicatorBottom = 6 * headerScale;
  const homeIndicatorHeight = 3 * headerScale;
  const framePadding = 6 * headerScale;

  const screenBg = isDark ? "#0a0a0a" : "#fafafa";
  const statusBarText = isDark ? "#ffffff" : "#000000";
  const borderColor = isDark ? "#404040" : "#525252";

  return (
    <div className={`relative w-full h-full flex flex-col ${className}`}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: `${cornerRadius * 2.5}px`,
          boxShadow: shadows > 0 ? `0 ${shadows}px ${shadows * 2}px rgba(0,0,0,1)` : "none",
        }}
      />

      <div
        className="relative w-full h-full flex flex-col"
        style={{
          ...maskStyles,
          borderRadius: `${cornerRadius * 2.5}px`,
        }}
      >
        <div
          className="relative w-full h-full flex flex-col"
          style={{
            padding: `${framePadding}px`,
            backgroundColor: hexToRgba(frameColor, headerOpacity),
            borderRadius: `${cornerRadius * 2.5}px`,
            border: `1px solid ${borderColor}`,
          }}
        >
          <div
            className="absolute -left-1.25 top-[15%] w-1 h-[6%] rounded-l-sm"
            style={{
              backgroundColor: hexToRgba(frameColor, headerOpacity),
              borderLeft: `1px solid ${borderColor}`,
              borderTop: `1px solid ${borderColor}`,
              borderBottom: `1px solid ${borderColor}`,
            }}
          />
          <div
            className="absolute -left-1.25 top-[24%] w-1 h-[12%] rounded-l-sm"
            style={{
              backgroundColor: hexToRgba(frameColor, headerOpacity),
              borderLeft: `1px solid ${borderColor}`,
              borderTop: `1px solid ${borderColor}`,
              borderBottom: `1px solid ${borderColor}`,
            }}
          />
          <div
            className="absolute -right-1.25 top-[28%] w-1 h-[14%] rounded-r-sm"
            style={{
              backgroundColor: hexToRgba(frameColor, headerOpacity),
              borderRight: `1px solid ${borderColor}`,
              borderTop: `1px solid ${borderColor}`,
              borderBottom: `1px solid ${borderColor}`,
            }}
          />

          <div
            className="relative w-full h-full overflow-hidden flex flex-col border border-black"
            style={{
              backgroundColor: "#000000",
              borderRadius: `${cornerRadius * 2.2}px`,
            }}
          >
            <div
              className="absolute left-1/2 -translate-x-1/2 w-[28%] bg-black rounded-full z-30 flex items-center justify-center"
              style={{
                top: `${dynamicIslandTop}px`,
                minHeight: `${dynamicIslandMinHeight}px`,
                height: "4%",
                padding: `0 ${dynamicIslandPaddingX}px`,
                gap: `${dynamicIslandGap}px`,
                boxShadow: "0 2px 8px rgba(0,0,0,0.3)",
              }}
            >
              <div
                className="bg-indigo-500/40 rounded-full blur-[1px]"
                style={{ width: `${dotSize}px`, height: `${dotSize}px` }}
              />
              <div
                className="bg-neutral-800 rounded-full border border-white/10"
                style={{ width: `${dotSize}px`, height: `${dotSize}px` }}
              />
            </div>

            <div
              className="absolute -top-2 w-full flex items-center justify-between z-20"
              style={{
                height: `max(${statusBarHeight}px, 7%)`,
                padding: `0 ${statusBarPaddingX}px`,
              }}
            >
              <span
                className="font-bold tracking-tight leading-none flex items-center"
                style={{ fontSize: `${timeFontSize}px`, color: statusBarText }}
              >
                9:41
              </span>
              <div className="flex items-center opacity-90" style={{ gap: `${iconsGap}px` }}>
                <div className="flex items-end" style={{ gap: "1.5px", height: `${batteryHeight}px` }}>
                  <div className="rounded-full" style={{ width: `${signalBarWidth}px`, height: "30%", backgroundColor: statusBarText }} />
                  <div className="rounded-full" style={{ width: `${signalBarWidth}px`, height: "55%", backgroundColor: statusBarText }} />
                  <div className="rounded-full" style={{ width: `${signalBarWidth}px`, height: "80%", backgroundColor: statusBarText }} />
                  <div className="rounded-full" style={{ width: `${signalBarWidth}px`, height: "100%", backgroundColor: statusBarText }} />
                </div>
                <Icon
                  icon="mdi:wifi"
                  style={{ width: `${wifiSize}px`, height: `${wifiSize}px`, color: statusBarText, display: "block" }}
                />
                <div
                  className="border rounded-[3px] p-px flex items-center relative"
                  style={{ width: `${batteryWidth}px`, height: `${batteryHeight}px`, borderColor: `${statusBarText}50` }}
                >
                  <div className="h-full w-[85%] rounded-[1px]" style={{ backgroundColor: statusBarText }} />
                  <div className="absolute -right-[3px] w-[2px] h-[40%] rounded-r-[1px]" style={{ backgroundColor: `${statusBarText}50` }} />
                </div>
              </div>
            </div>

            <div className="w-full h-full relative overflow-hidden" style={{ paddingTop: `max(${statusBarHeight}px, 8%)` }}>
              <div
                className="absolute inset-0"
                style={{ backgroundColor: screenBg, top: `max(${statusBarHeight}px, 8%)` }}
              />
              <div className="relative z-10 w-full h-full">{children}</div>
            </div>

            <div
              className="absolute left-1/2 -translate-x-1/2 w-[35%] rounded-full z-20"
              style={{ bottom: `${homeIndicatorBottom}px`, height: `${homeIndicatorHeight}px`, backgroundColor: `${statusBarText}15` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}