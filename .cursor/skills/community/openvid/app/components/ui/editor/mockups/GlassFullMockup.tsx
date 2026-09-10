"use client";
import { Icon } from "@iconify/react";
import type { MockupRenderProps } from "@/types/mockup.types";
import { hexToRgba } from "@/lib/utils";

interface GlassFullMockupProps extends MockupRenderProps {
  shadows?: number;
  roundedCorners?: number;
}

export function GlassFullMockup({
  children,
  config,
  className = "",
  shadows = 30,
  roundedCorners,
  maskStyles,
}: GlassFullMockupProps) {
  const isDark = config.darkMode;
  const frameColor = isDark ? config.frameColor : "#ffffff";
  const cornerRadius = roundedCorners ?? config.cornerRadius;

  const headerOpacity = config.headerOpacity ?? 10;
  const headerScale = (config.headerScale || 100) / 100;

  const framePadding = 12 * headerScale;
  const buttonWidth = 7 * headerScale;
  const notchTop = 8 * headerScale;
  const notchWidth = 104 * headerScale;
  const notchHeight = 24 * headerScale;
  const notchPaddingX = 8 * headerScale;
  const dotSize = 8 * headerScale;
  const statusBarHeight = 32 * headerScale;
  const statusBarPaddingX = 28 * headerScale;
  const timeFontSize = 10 * headerScale;
  const signalBarWidth = 2 * headerScale;
  const iconsGap = 6 * headerScale;
  const wifiSize = 12 * headerScale;
  const batteryWidth = 18 * headerScale;
  const batteryHeight = 10 * headerScale;
  const contentPaddingTop = 40 * headerScale;
  const homeIndicatorWidth = 128 * headerScale;
  const homeIndicatorHeight = 4 * headerScale;
  const homeIndicatorBottom = 8 * headerScale;

  const screenBg = isDark ? "#0a0a0a" : "#f9f9f9";
  const frameBorderColor = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(255, 255, 255, 0.3)";
  const screenBorderColor = isDark ? "rgba(255, 255, 255, 0.05)" : "rgba(0, 0, 0, 0.05)";
  const notchBg = isDark ? "rgba(255, 255, 255, 0.15)" : "rgba(0, 0, 0, 0.05)";
  const statusBarText = isDark ? "rgba(255, 255, 255, 0.8)" : "rgba(0, 0, 0, 0.6)";
  const statusBarTextDim = isDark ? "rgba(255, 255, 255, 0.4)" : "rgba(0, 0, 0, 0.2)";
  const homeIndicatorBg = isDark ? "rgba(255, 255, 255, 0.2)" : "rgba(0, 0, 0, 0.1)";

  const buttonBg = isDark ? "rgba(255, 255, 255, 0.25)" : "#ffffff";
  const buttonBorderColor = isDark ? "rgba(255, 255, 255, 0.4)" : "#e5e5e5";
  const buttonShadow = isDark ? "inset 0px 0px 4px rgba(255,255,255,0.2), 0 1px 3px rgba(0,0,0,0.5)" : "inset 0px 0px 4px rgba(0,0,0,0.1), 0 1px 3px rgba(0,0,0,0.2)";

  return (
    <div className={`relative w-full h-full ${className}`}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: `${cornerRadius * 2.8}px`,
          boxShadow: shadows > 0 ? `0 ${shadows}px ${shadows * 2}px rgba(0,0,0,1)` : 'none',
        }}
      />

      <div
        className="relative w-full h-full"
        style={{
          ...maskStyles,
        }}
      >
        <div
          className="relative flex flex-col w-full h-full backdrop-blur-2xl"
          style={{
            padding: `${framePadding}px`,
            backgroundColor: hexToRgba(frameColor, headerOpacity),
            borderRadius: `${cornerRadius * 2.8}px`,
            border: `1px solid ${frameBorderColor}`,
          }}
        >
          <div
            className="absolute backdrop-blur-md rounded-l-sm z-[-1]"
            style={{
              left: `-${buttonWidth}px`,
              top: '15%',
              width: `${buttonWidth}px`,
              height: '5%',
              backgroundColor: buttonBg,
              borderLeft: `1px solid ${buttonBorderColor}`,
              borderTop: `1px solid ${buttonBorderColor}`,
              borderBottom: `1px solid ${buttonBorderColor}`,
              boxShadow: buttonShadow
            }}
          />
          <div
            className="absolute backdrop-blur-md rounded-l-sm z-[-1]"
            style={{
              left: `-${buttonWidth}px`,
              top: '25%',
              width: `${buttonWidth}px`,
              height: '12%',
              backgroundColor: buttonBg,
              borderLeft: `1px solid ${buttonBorderColor}`,
              borderTop: `1px solid ${buttonBorderColor}`,
              borderBottom: `1px solid ${buttonBorderColor}`,
              boxShadow: buttonShadow
            }}
          />
          <div
            className="absolute backdrop-blur-md rounded-r-sm z-[-1]"
            style={{
              right: `-${buttonWidth}px`,
              top: '28%',
              width: `${buttonWidth}px`,
              height: '14%',
              backgroundColor: buttonBg,
              borderRight: `1px solid ${buttonBorderColor}`,
              borderTop: `1px solid ${buttonBorderColor}`,
              borderBottom: `1px solid ${buttonBorderColor}`,
              boxShadow: buttonShadow
            }}
          />

          <div
            className="relative w-full h-full overflow-hidden flex flex-col shadow-inner"
            style={{
              backgroundColor: screenBg,
              borderRadius: `${cornerRadius * 2.3}px`,
              border: `1px solid ${screenBorderColor}`,
            }}
          >
            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full z-30 flex items-center justify-between shadow-sm"
              style={{
                top: `${notchTop}px`,
                width: `${notchWidth}px`,
                height: `${notchHeight}px`,
                backgroundColor: notchBg,
                padding: `0 ${notchPaddingX}px`
              }}
            >
              <div className="bg-neutral-500 rounded-full border border-neutral-700" style={{ width: `${dotSize}px`, height: `${dotSize}px` }} />
              <div className="bg-indigo-500 rounded-full opacity-80 blur-[1px]" style={{ width: `${dotSize}px`, height: `${dotSize}px` }} />
            </div>

            <div
              className="absolute top-0 w-full flex items-center justify-between z-20"
              style={{
                height: `${statusBarHeight}px`,
                padding: `0 ${statusBarPaddingX}px`,
              }}
            >
              <span className="font-bold tracking-tight" style={{ fontSize: `${timeFontSize}px`, color: statusBarText }}>
                9:41
              </span>
              <div className="flex items-center" style={{ gap: `${iconsGap}px` }}>
                <div className="flex items-end" style={{ gap: '1px', height: `${batteryHeight * 0.8}px` }}>
                  <div className="rounded-[0.5px]" style={{ width: `${signalBarWidth}px`, height: '40%', backgroundColor: statusBarText }} />
                  <div className="rounded-[0.5px]" style={{ width: `${signalBarWidth}px`, height: '60%', backgroundColor: statusBarText }} />
                  <div className="rounded-[0.5px]" style={{ width: `${signalBarWidth}px`, height: '80%', backgroundColor: statusBarText }} />
                  <div className="rounded-[0.5px]" style={{ width: `${signalBarWidth}px`, height: '100%', backgroundColor: statusBarTextDim }} />
                </div>
                <Icon icon="mdi:wifi" style={{ width: `${wifiSize}px`, height: `${wifiSize}px`, color: statusBarText }} />
                <div className="relative rounded-[2px] flex items-center" style={{ width: `${batteryWidth}px`, height: `${batteryHeight}px`, padding: '1px', border: `1px solid ${statusBarTextDim}` }}>
                  <div className="h-full rounded-[0.5px]" style={{ width: '70%', backgroundColor: statusBarText }} />
                  <div className="absolute rounded-r-full" style={{ right: '-2px', width: '1px', height: '40%', backgroundColor: statusBarTextDim }} />
                </div>
              </div>
            </div>

            <div className="relative w-full h-full" style={{ paddingTop: `${contentPaddingTop}px` }}>
              <div className="relative z-10 w-full h-full">
                {children}
              </div>
            </div>

            <div
              className="absolute left-1/2 -translate-x-1/2 rounded-full z-20 pointer-events-none"
              style={{
                bottom: `${homeIndicatorBottom}px`,
                width: `${homeIndicatorWidth}px`,
                height: `${homeIndicatorHeight}px`,
                backgroundColor: homeIndicatorBg
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}