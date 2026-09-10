"use client";
import type { MockupRenderProps } from "@/types/mockup.types";

interface HardShellMockupProps extends MockupRenderProps {
  shadows?: number;
  roundedCorners?: number;
}

export function HardShellMockup({
  children,
  config,
  className = "",
  shadows = 50,
  roundedCorners,
  maskStyles, 
}: HardShellMockupProps) {
  const isDark = config.darkMode;
  const frameColor = isDark ? config.frameColor : "#ffffff";
  const cornerRadius = roundedCorners ?? config.cornerRadius ?? 12;

  const headerScale = (config.headerScale || 100) / 100;

  const buttonWidth = 7 * headerScale;
  const outerPadding = 6 * headerScale;
  const bezelPadding = 4 * headerScale;

  const cameraTop = 10 * headerScale;
  const cameraSize = 14 * headerScale;
  const cameraLensSize = 5 * headerScale;

  const statusBarHeight = 32 * headerScale;
  const statusBarPaddingX = 16 * headerScale;
  const timeFontSize = 12 * headerScale;
  const networkFontSize = 10 * headerScale;
  const signalBarWidth = 3 * headerScale;
  const batteryWidth = 22 * headerScale;
  const batteryHeight = 11 * headerScale;

  const contentPaddingTop = 44 * headerScale;
  const homeIndicatorWidth = 112 * headerScale;
  const homeIndicatorHeight = 6 * headerScale;
  const homeIndicatorBottom = 8 * headerScale;

  const screenBg = isDark ? "#000000" : "#f8fafc";
  const textColor = isDark ? "#ffffff" : "#000000";
  const frameBorderColor = isDark ? "rgba(255, 255, 255, 0.1)" : "rgba(0, 0, 0, 0.2)";
  const homeIndicatorBg = isDark ? "rgba(255, 255, 255, 0.3)" : "rgba(0, 0, 0, 0.2)";

  const buttonBgColor = isDark ? "rgba(255, 255, 255, 0.15)" : "#ffffff";
  const buttonBorderColor = isDark ? "rgba(255, 255, 255, 0.2)" : "#e5e5e5";

  return (
    <div className={`relative w-full h-full flex flex-col items-center justify-center ${className}`}>
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          borderRadius: `${cornerRadius * 1.5}px`,
          boxShadow: shadows > 0 ? `0 ${shadows / 2}px ${shadows}px -12px rgba(0,0,0,1)` : 'none',
        }}
      />

      <div
        className="relative w-full h-full flex items-center justify-center"
        style={{
          ...maskStyles,
          borderRadius: `${cornerRadius * 1.5}px`,
        }}
      >
        <div
          className="relative w-full h-full flex items-center justify-center"
          style={{
            padding: `${outerPadding}px`,
            backgroundColor: frameColor,
            borderRadius: `${cornerRadius * 1.5}px`,
            border: `1px solid ${frameBorderColor}`,
          }}
        >
          <div
            className="absolute shadow-inner rounded-r-md"
            style={{
              right: `-${buttonWidth}px`,
              top: '18%',
              width: `${buttonWidth}px`,
              height: '9%',
              backgroundColor: buttonBgColor,
              borderTop: `1px solid ${buttonBorderColor}`,
              borderRight: `1px solid ${buttonBorderColor}`,
              borderBottom: `1px solid ${buttonBorderColor}`,
            }}
          />
          <div
            className="absolute shadow-inner rounded-r-md"
            style={{
              right: `-${buttonWidth}px`,
              top: '31%',
              width: `${buttonWidth}px`,
              height: '5%',
              backgroundColor: buttonBgColor,
              borderTop: `1px solid ${buttonBorderColor}`,
              borderRight: `1px solid ${buttonBorderColor}`,
              borderBottom: `1px solid ${buttonBorderColor}`,
            }}
          />

          <div
            className="relative w-full h-full overflow-hidden flex flex-col"
            style={{
              backgroundColor: "#000000",
              padding: `${bezelPadding}px`,
              borderRadius: `${cornerRadius * 1.2}px`,
              boxShadow: 'inset 0 0 4px rgba(0,0,0,1)',
            }}
          >
            <div
              className="relative w-full h-full flex flex-col overflow-hidden"
              style={{ backgroundColor: screenBg, borderRadius: `${cornerRadius * 0.8}px` }}
            >
              <div
                className="absolute left-1/2 -translate-x-1/2 bg-black rounded-full z-30 flex items-center justify-center"
                style={{ top: `${cameraTop}px`, width: `${cameraSize}px`, height: `${cameraSize}px`, boxShadow: 'inset 0 0 2px rgba(255,255,255,0.15)' }}
              >
                <div
                  className="rounded-full blur-[0.5px]"
                  style={{ width: `${cameraLensSize}px`, height: `${cameraLensSize}px`, backgroundColor: 'rgba(30, 58, 138, 0.6)' }}
                />
              </div>

              <div
                className="absolute top-0 w-full flex items-center justify-between z-20"
                style={{ height: `${statusBarHeight}px`, padding: `0 ${statusBarPaddingX}px`, color: textColor }}
              >
                <span className="font-medium tracking-tight mt-1" style={{ fontSize: `${timeFontSize}px` }}>
                  11:43
                </span>
                <div className="flex items-center mt-1" style={{ gap: `${6 * headerScale}px` }}>
                  <div className="font-bold" style={{ fontSize: `${networkFontSize}px` }}>5G</div>
                  <div className="flex items-end" style={{ gap: '1px', height: `${12 * headerScale}px` }}>
                    <div className="rounded-sm" style={{ width: `${signalBarWidth}px`, height: '50%', backgroundColor: textColor }} />
                    <div className="rounded-sm" style={{ width: `${signalBarWidth}px`, height: '65%', backgroundColor: textColor }} />
                    <div className="rounded-sm" style={{ width: `${signalBarWidth}px`, height: '80%', backgroundColor: textColor }} />
                    <div className="rounded-sm" style={{ width: `${signalBarWidth}px`, height: '100%', backgroundColor: textColor }} />
                  </div>
                  <div className="flex items-center" style={{ marginLeft: `${2 * headerScale}px` }}>
                    <div
                      className="flex items-center rounded-[3px]"
                      style={{ width: `${batteryWidth}px`, height: `${batteryHeight}px`, border: `1px solid ${textColor}`, padding: `${1.5 * headerScale}px` }}
                    >
                      <div className="h-full rounded-[1px]" style={{ width: '80%', backgroundColor: textColor }} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="relative w-full h-full" style={{ paddingTop: `${contentPaddingTop}px` }}>
                <div className="relative z-10 w-full h-full">{children}</div>
              </div>

              <div
                className="absolute left-1/2 -translate-x-1/2 rounded-full z-20"
                style={{ bottom: `${homeIndicatorBottom}px`, width: `${homeIndicatorWidth}px`, height: `${homeIndicatorHeight}px`, backgroundColor: homeIndicatorBg }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}