"use client";

import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { ExportQuality } from "@/types";
import { useState } from "react";
import { useTranslations } from "next-intl";

interface ExportProgress {
  status: "idle" | "preparing" | "encoding" | "finalizing" | "complete" | "error";
  progress: number;
  message: string;
}

interface ExportDropdownProps {
  onExport: (quality: ExportQuality) => void;
  exportProgress: ExportProgress;
  hasTransparentBackground?: boolean;
}

export function ExportDropdown({ onExport, exportProgress, hasTransparentBackground }: ExportDropdownProps) {
  const t = useTranslations("editor.export");
  const [isOpen, setIsOpen] = useState(false);

  const isExporting = exportProgress.status !== "idle" && 
                      exportProgress.status !== "complete" && 
                      exportProgress.status !== "error";
  
  const isTransparent = !!hasTransparentBackground;

  const handleExport = (quality: ExportQuality) => {
    setIsOpen(false);
    onExport(quality);
  };

  const renderQualityItem = (id: ExportQuality, resolution: string, isRecommended = false) => {
    const isGif = id === "gif";
    
    return (
      <button 
        className={`group flex flex-col items-start gap-1.5 p-4 transition-all text-left border-b border-border ${
          isGif ? (isTransparent ? "opacity-80 hover:bg-orange-500/5" : "hover:bg-orange-500/5") : 
          (isTransparent ? "hover:bg-cyan-500/5" : "hover:bg-muted")
        }`} 
        onClick={() => handleExport(id)}
        aria-label={`Export as ${id.toUpperCase()} ${resolution}`}
      >
        <div className="flex items-center justify-between w-full">
          <span className={`text-sm font-medium transition-colors ${
            isGif ? "text-orange-600 dark:text-orange-400 group-hover:text-orange-300" : 
            "text-foreground group-hover:text-blue-400"
          }`}>
            {isTransparent && !isGif ? (
              <>{id.toUpperCase()} WebM · <span className="text-cyan-600 dark:text-cyan-400 group-hover:text-cyan-300">{t("noBackground")}</span></>
            ) : (
              t(`qualities.${id}.label`)
            )}
          </span>
          {isRecommended && !isTransparent && (
            <span className="border border-blue-500/30 text-blue-600 dark:text-blue-400 text-[9px] px-2 py-0.5 rounded-full font-bold tracking-tight">
              {t("recommended")}
            </span>
          )}
          {isGif && isTransparent && (
            <span className="text-[9px] text-red-600 dark:text-red-400/80 font-bold bg-red-500/10 px-2 py-0.5 rounded-full border border-red-500/20">
              {t("solidBackground")}
            </span>
          )}
        </div>
        <span className={`text-[11px] font-mono ${isGif ? "text-orange-600 dark:text-orange-400/70" : "text-muted-foreground"}`}>
          {isTransparent ? (
            <>{resolution} · <span className="text-cyan-600 dark:text-cyan-400/70">{isGif ? t("gifNotice") : "VP9 Alpha"}</span></>
          ) : (
            t(`qualities.${id}.desc`)
          )}
        </span>
      </button>
    );
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button 
          variant="primary" 
          className="px-3 py-2 text-sm gap-2 min-w-27.5 text-white" 
          size="sm" 
          disabled={isExporting}
          aria-label={t("button")}
        >
          <Icon icon="icon-park-outline:export" width="18" aria-hidden="true" />
          {t("button")}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 bg-popover dark:bg-black border-border text-foreground shadow-2xl p-0 overflow-hidden z-999999">
        <div className="flex flex-col bg-popover dark:bg-black border border-border overflow-hidden shadow-2xl">
          <div className="px-4 py-3 border-b border-border bg-muted">
            <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
              {t("title")}
            </span>
          </div>
          <div className="flex flex-col max-h-120 overflow-y-auto custom-scrollbar">
            {renderQualityItem("4k", "3840 × 2160")}
            {renderQualityItem("2k", "2560 × 1440")}
            {renderQualityItem("1080p", "1920 × 1080", true)}
            {renderQualityItem("720p", "1280 × 720")}
            {renderQualityItem("480p", "854 × 480")}
            {renderQualityItem("gif", "1280 × 720")}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}