"use client";

import { useState } from "react";
import { Icon } from "@iconify/react";
import * as Dialog from "@radix-ui/react-dialog";
import { useTranslations } from "next-intl";
import type { Tool } from "@/types";
import { ElementsIcon } from "@/components/ui/ElementsIcon";

interface ToolButtonProps {
  label: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  ariaLabel?: string;
}

const ToolButton = ({ label, icon, isActive, onClick, ariaLabel }: ToolButtonProps) => {
  return (
    <button
      onClick={onClick}
      className={`flex items-center justify-center p-4 squircle-element transition-all duration-200 group relative flex-col gap-1 active:scale-95 ${isActive
        ? "text-white border-transparent"
        : "bg-muted border border-border shadow-sm text-muted-foreground/60"
        }`}
      style={
        isActive
          ? {
            background: "radial-gradient(circle at 50% 0%, #555555 0%, #121212 100%)",
            transform: "transform-gpu",
            boxShadow: "inset 0 1rem 0.2rem -1rem #fff, 0 0 0 1px #ffffff33, 0 4px 4px 0 #00000033, 0 0 0 1px #333333",
          }
          : {}
      }
      aria-label={ariaLabel || label}
      aria-pressed={isActive}
    >
      <div className={`transition-transform duration-300 ${isActive ? "scale-110" : "group-hover:scale-105"}`}>
        {icon}
      </div>
      <span className={`text-sm font-medium transition-colors ${isActive ? "text-white" : ""}`}>
        {label}
      </span>
      {isActive && (
        <div className="absolute -top-3 -left-1 size-12 bg-white rounded-full blur-[12px] rotate-45 opacity-50 pointer-events-none" />
      )}
    </button>
  );
};

interface MobileToolsMenuProps {
  activeTool: Tool;
  onToolChange: (tool: Tool) => void;
  onVideoUpload?: (file: File) => void;
  isUploading?: boolean;
  onOpenToolPanel?: () => void;
}

export function MobileToolsMenu({
  activeTool,
  onToolChange,
  onVideoUpload,
  isUploading = false,
  onOpenToolPanel,
}: MobileToolsMenuProps) {
  const t = useTranslations("MobileTools");
  const [isOpen, setIsOpen] = useState(false);

  const handleToolChange = (tool: Tool) => {
    onToolChange(tool);
    setIsOpen(false);
    if (onOpenToolPanel) {
      setTimeout(() => onOpenToolPanel(), 100);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onVideoUpload) {
      onVideoUpload(file);
      e.target.value = "";
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={setIsOpen}>
      <Dialog.Trigger asChild>
        <button
          className="fixed bottom-4 left-4 z-50 size-10 rounded-full shadow-lg shadow-blue-500/50 bg-gradient-primary flex items-center justify-center hover:scale-105 transition-transform active:scale-95 lg:hidden"
          aria-label={t("openMenu")}
        >
          <Icon icon="solar:widget-2-bold-duotone" width="18" className="text-white" aria-hidden="true" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-100 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed bottom-0 left-0 right-0 bg-popover dark:bg-black border-t border-border rounded-t-2xl z-101 p-6 animate-in slide-in-from-bottom duration-300 max-h-[80vh] overflow-y-auto">
          <div className="flex items-center justify-between mb-6">
            <Dialog.Title className="text-lg font-semibold text-foreground" id="tools-dialog-title">
              {t("title")}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                className="h-8 w-8 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
                aria-label={t("close")}
              >
                <Icon icon="mdi:close" width="20" className="text-muted-foreground" />
              </button>
            </Dialog.Close>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <ToolButton
              label={t("background")}
              isActive={activeTool === "screenshot"}
              onClick={() => handleToolChange("screenshot")}
              icon={<Icon icon="solar:gallery-wide-linear" width="24" className={activeTool === "screenshot" ? "text-foreground" : "text-muted-foreground"} />}
            />

            <ToolButton
              label={t("mockup")}
              isActive={activeTool === "mockup"}
              onClick={() => handleToolChange("mockup")}
              icon={<Icon icon="hugeicons:ai-browser" width="24" className={activeTool === "mockup" ? "text-foreground" : "text-muted-foreground"} />}
            />

            <ToolButton
              label={t("motion")}
              isActive={activeTool === "motion"}
              onClick={() => handleToolChange("motion")}
              icon={<Icon icon="hugeicons:ai-browser" width="24" className={activeTool === "motion" ? "text-foreground" : "text-muted-foreground"} />}
            />

            <ToolButton
              label={t("zoom")}
              isActive={activeTool === "zoom"}
              onClick={() => handleToolChange("zoom")}
              icon={<Icon icon="iconamoon:zoom-in-bold" width="24" className={activeTool === "zoom" ? "text-foreground" : "text-muted-foreground"} />}
            />

            <ToolButton
              label={t("videos")}
              isActive={activeTool === "video"}
              onClick={() => handleToolChange("video")}
              icon={<Icon icon="iconamoon:zoom-in-bold" width="24" className={activeTool === "video" ? "text-foreground" : "text-muted-foreground"} />}
            />

            <ToolButton
              label={t("elements")}
              isActive={activeTool === "elements"}
              onClick={() => handleToolChange("elements")}
              icon={
                <ElementsIcon
                  width={24}
                  height={24}
                  className={activeTool === "elements" ? "text-foreground" : "text-muted-foreground"}
                />
              }
            />

            <ToolButton
              label={t("audio")}
              isActive={activeTool === "audio"}
              onClick={() => handleToolChange("audio")}
              icon={<Icon icon="mdi:volume-high" width="24" className={activeTool === "audio" ? "text-foreground" : "text-muted-foreground"} />}
            />

            <label
              className={`flex items-center justify-center p-4 squircle-element transition-all duration-200 group relative flex-col gap-1 active:scale-95 cursor-pointer bg-muted border border-border shadow-sm ${isUploading ? "opacity-50 cursor-not-allowed" : ""
                }`}
            >
              <div className={`transition-transform duration-300 ${isUploading ? "animate-pulse" : "group-hover:scale-105"}`}>
                <Icon icon={isUploading ? "svg-spinners:ring-resize" : "solar:cloud-upload-bold-duotone"} width="24" className="text-foreground" />
              </div>
              <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                {isUploading ? t("uploading") : t("uploadVideo")}
              </span>
              {!isUploading && (
                <div className="absolute left-2 w-16 h-4 top-1/4 -translate-y-1/2 bg-white rounded-full blur-md rotate-45 opacity-20 pointer-events-none" />
              )}
              <input type="file" accept="video/mp4,video/webm,video/quicktime,video/x-matroska" className="hidden" onChange={handleFileChange} disabled={isUploading} />
            </label>

          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}