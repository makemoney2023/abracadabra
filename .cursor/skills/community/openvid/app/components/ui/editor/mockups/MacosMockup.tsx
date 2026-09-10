"use client";

import { Icon } from "@iconify/react";
import { DEFAULT_MOCKUP_CONFIG, type MockupRenderProps } from "@/types/mockup.types";
import { hexToRgba } from "@/lib/utils";
import { deriveSearchBg } from "@/lib/color.utils";

interface MacosMockupProps extends MockupRenderProps {
  shadows?: number;
  roundedCorners?: number;
}

export function MacosMockup({ children, config, className = "", shadows = 20, roundedCorners, maskStyles, onConfigChange  }: MacosMockupProps) {
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

  const baseHeight = 36;
  const basePadding = 12;
  const baseGap = 12;
  const baseButtonSize = 10;
  const baseIconSize = 14;
  const baseUrlBarHeight = 24;
  const baseFontSize = 12;

  const headerHeight = baseHeight * headerScale;
  const headerPadding = basePadding * headerScale;
  const buttonGroupGap = 6 * headerScale;
  const navGap = 6 * headerScale;
  const buttonSize = baseButtonSize * headerScale;
  const iconSize = baseIconSize * headerScale;
  const urlBarHeight = baseUrlBarHeight * headerScale;
  const fontSize = baseFontSize * headerScale;
  const urlBarPadding = 8 * headerScale;
  const urlBarMargin = 16 * headerScale;
  const rightGroupGap = 10 * headerScale;

  return (
    <div
      className={`relative w-full h-full overflow-hidden ${className}`}
      style={{
        borderRadius: `${cornerRadius}px`,
        boxShadow: shadows > 0 ? `0 ${shadows * 0.3}px ${shadows}px rgba(0,0,0,1)` : 'none',
      }}
    >
      <div className="w-full h-full flex flex-col" style={maskStyles}>
        <div className="flex items-center justify-between select-none shrink-0 overflow-hidden"
          style={{
            height: `${headerHeight}px`,
            padding: `0 ${headerPadding}px`,
            backgroundColor: hexToRgba(frameColor, headerOpacity),
            borderBottom: `1px solid ${borderColor}`,
            borderTopLeftRadius: `${cornerRadius}px`,
            borderTopRightRadius: `${cornerRadius}px`,
          }}
        >
          <div className="flex items-center shrink-0" style={{ gap: `${baseGap * headerScale}px` }}>
            <div className="flex shrink-0" style={{ gap: `${buttonGroupGap}px` }}>
              <div className="rounded-full bg-[#FF5F56] border border-[#E0443E]" style={{ width: `${buttonSize}px`, height: `${buttonSize}px` }} />
              <div className="rounded-full bg-[#FFBD2E] border border-[#DEA123]" style={{ width: `${buttonSize}px`, height: `${buttonSize}px` }} />
              <div className="rounded-full bg-[#27C93F] border border-[#1AAB29]" style={{ width: `${buttonSize}px`, height: `${buttonSize}px` }} />
            </div>
            <div className="flex items-center shrink-0" style={{ gap: `${navGap}px`, color: textColor }}>
              <Icon icon="mdi:menu" style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
              <Icon icon="mdi:chevron-left" style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
              <Icon icon="mdi:chevron-right" className="opacity-40" style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
            </div>
          </div>

          <div className="flex-1 max-w-xl min-w-[60px] shrink" style={{ margin: `0 ${urlBarMargin}px` }}>
            <div
              className="rounded w-full flex items-center justify-between min-w-0"
              style={{
                height: `${urlBarHeight}px`,
                padding: `0 ${urlBarPadding}px`,
                backgroundColor: hexToRgba(urlBarBgBase, headerOpacity),
                border: `1px solid ${urlBarBorder}`,
                color: textColor,
              }}
            >
              <Icon icon="mdi:lock" className="opacity-60 shrink-0" style={{ width: `${buttonSize}px`, height: `${buttonSize}px` }} />
              <input
                type="text"
                value={url}
                onChange={(e) => onConfigChange?.({ url: e.target.value })}
                onMouseDown={(e) => e.stopPropagation()}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={(e) => e.stopPropagation()}
                placeholder={DEFAULT_MOCKUP_CONFIG.url}
                className="flex-1 text-center font-medium truncate min-w-0 mt-0.5 bg-transparent border-none outline-none"
                style={{ fontSize: `${fontSize}px`, padding: `0 ${urlBarPadding}px`, color: textColor }}
              />
              <Icon icon="mdi:refresh" className="opacity-60 shrink-0" style={{ width: `${buttonSize}px`, height: `${buttonSize}px` }} />
            </div>
          </div>

          <div className="flex items-center shrink-0" style={{ gap: `${rightGroupGap}px`, color: textColor }}>
            <Icon icon="mdi:download" style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
            <Icon icon="mdi:upload" style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
            <Icon icon="mdi:plus" style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
            <Icon icon="mdi:content-copy" style={{ width: `${iconSize}px`, height: `${iconSize}px` }} />
          </div>
        </div>

        <div className="flex-1 relative overflow-hidden" style={{ backgroundColor: bgColor }}>
          {children}
        </div>
      </div>
    </div>

  );
}