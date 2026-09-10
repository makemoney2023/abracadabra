"use client";
import type { MockupRenderProps } from "@/types/mockup.types";

interface S24UltraMockupProps extends MockupRenderProps {
  shadows?: number;
  roundedCorners?: number;
}

export function S24UltraMockup({
  children,
  config,
  className = "",
  shadows = 50,
  roundedCorners,
  maskStyles,
}: S24UltraMockupProps) {
  const isDark = config.darkMode;
  const frameColor = isDark ? (config.frameColor || "#171717") : "#e5e5e5";
  const cornerRadius = roundedCorners ?? config.cornerRadius ?? 12;

  const headerScale = (config.headerScale || 100) / 100;

  const framePadding = 10 * headerScale;
  const buttonWidth = 8 * headerScale;
  const buttonRadius = 2 * headerScale;

  const cameraTop = 12 * headerScale;
  const cameraSize = 14 * headerScale;
  const cameraLensSize = 4 * headerScale;

  const statusBarHeight = 40 * headerScale;
  const statusBarPaddingX = 20 * headerScale;
  const timeFontSize = 10 * headerScale;

  const navBarHeight = 40 * headerScale;
  const navIconSize = 12 * headerScale;
  const navGap = 48 * headerScale;

  const screenBg = isDark ? "#000000" : "#ffffff";
  const frameBorderColor = isDark ? "#404040" : "#d4d4d4";
  const screenBorderColor = isDark ? "rgba(255,255,255,0.1)" : "#000000";
  const buttonBgColor = isDark ? "#737373" : "#a3a3a3";
  const buttonBorderColor = isDark ? "#262626" : "#737373";

  const textAndIconColor = isDark ? "rgba(255,255,255,0.9)" : "rgba(0,0,0,0.9)";
  const navIconColor = isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.2)";
  const iconBoxBg = isDark ? "#ffffff" : "#000000";
  const iconBoxText = isDark ? "#000000" : "#ffffff";

  return (
    <div className={`relative w-full h-full flex flex-col items-center justify-center ${className}`}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: `${cornerRadius * 1.2}px`,
          boxShadow: shadows > 0 ? `0 ${shadows / 2}px ${shadows}px -12px rgba(0,0,0,1)` : 'none',
        }}
      />

      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{
          ...maskStyles,
          borderRadius: `${cornerRadius * 1.2}px`,
        }}
      >
        <div
          className="relative w-full h-full flex items-center justify-center shadow-2xl"
          style={{
            padding: `${framePadding}px`,
            backgroundColor: frameColor,
            borderRadius: `${cornerRadius * 1.2}px`,
            border: `1px solid ${frameBorderColor}`,
          }}
        >
          <div
            className="absolute shadow-sm"
            style={{
              right: `-${buttonWidth}px`,
              top: '20%',
              width: `${buttonWidth}px`,
              height: '10%',
              backgroundColor: buttonBgColor,
              borderTopRightRadius: `${buttonRadius}px`,
              borderBottomRightRadius: `${buttonRadius}px`,
              borderTop: `1px solid ${buttonBorderColor}`,
              borderRight: `1px solid ${buttonBorderColor}`,
              borderBottom: `1px solid ${buttonBorderColor}`,
              zIndex: 0
            }}
          />
          <div
            className="absolute shadow-sm"
            style={{
              right: `-${buttonWidth}px`,
              top: '32%',
              width: `${buttonWidth}px`,
              height: '12%',
              backgroundColor: buttonBgColor,
              borderTopRightRadius: `${buttonRadius}px`,
              borderBottomRightRadius: `${buttonRadius}px`,
              borderTop: `1px solid ${buttonBorderColor}`,
              borderRight: `1px solid ${buttonBorderColor}`,
              borderBottom: `1px solid ${buttonBorderColor}`,
              zIndex: 0
            }}
          />

          <div
            className="relative w-full h-full overflow-hidden flex flex-col"
            style={{
              backgroundColor: screenBg,
              borderRadius: `${Math.max(0, (cornerRadius * 1.2) - framePadding)}px`,
              border: `1px solid ${screenBorderColor}`
            }}
          >
            <div
              className="absolute bg-black rounded-full z-20 flex items-center justify-center"
              style={{
                top: `${cameraTop}px`,
                left: '50%',
                transform: 'translateX(-50%)',
                width: `${cameraSize}px`,
                height: `${cameraSize}px`,
              }}
            >
              <div
                className="rounded-full blur-[0.5px]"
                style={{ width: `${cameraLensSize}px`, height: `${cameraLensSize}px`, backgroundColor: 'rgba(99, 102, 241, 0.3)' }}
              />
            </div>

            <div
              className="absolute top-0 w-full flex items-center justify-between z-10"
              style={{
                height: `${statusBarHeight}px`,
                padding: `0 ${statusBarPaddingX}px`,
              }}
            >
              <span
                className="font-medium tracking-tight"
                style={{ fontSize: `${timeFontSize}px`, color: textAndIconColor }}
              >
                12:30
              </span>
              <div className="flex items-center" style={{ gap: `${6 * headerScale}px`, opacity: 0.8 }}>
                <svg
                  style={{ width: `${12 * headerScale}px`, height: `${12 * headerScale}px`, color: textAndIconColor }}
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M12 21l-12-12c5.5-5.5 14.5-5.5 20 0l-8 12z" />
                </svg>
                <div
                  className="flex items-center justify-center font-bold"
                  style={{ width: `${14 * headerScale}px`, height: `${14 * headerScale}px`, backgroundColor: iconBoxBg, color: iconBoxText, borderRadius: `${2 * headerScale}px`, fontSize: `${7 * headerScale}px` }}
                >
                  5G
                </div>
                <div
                  className="relative flex items-center"
                  style={{ width: `${20 * headerScale}px`, height: `${10 * headerScale}px`, border: `1px solid ${isDark ? "rgba(255,255,255,0.4)" : "rgba(0,0,0,0.4)"}`, borderRadius: `${2 * headerScale}px`, padding: `${1 * headerScale}px` }}
                >
                  <div className="h-full w-full" style={{ backgroundColor: iconBoxBg, borderRadius: `${1 * headerScale}px` }} />
                </div>
              </div>
            </div>

            <div
              className="relative w-full h-full flex flex-col"
              style={{ paddingTop: `${statusBarHeight}px`, paddingBottom: `${navBarHeight}px` }}
            >
              <div className="relative z-10 w-full h-full">
                {children}
              </div>
            </div>

            <div
              className="absolute bottom-0 w-full flex items-center justify-center z-10"
              style={{ height: `${navBarHeight}px`, gap: `${navGap}px` }}
            >
              <div style={{ width: `${navIconSize}px`, height: `${navIconSize}px`, border: `${2 * headerScale}px solid ${navIconColor}`, borderRadius: `${2 * headerScale}px` }} />
              <div style={{ width: `${navIconSize}px`, height: `${navIconSize}px`, border: `${2 * headerScale}px solid ${navIconColor}`, borderRadius: '50%' }} />
              <div style={{ width: `${navIconSize}px`, height: `${navIconSize}px`, borderLeft: `${2 * headerScale}px solid ${navIconColor}`, borderBottom: `${2 * headerScale}px solid ${navIconColor}`, transform: 'rotate(45deg)', marginLeft: `${4 * headerScale}px` }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}