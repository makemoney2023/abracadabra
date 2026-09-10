"use client";

import { useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";

export type ExportSuccessMediaType = "video" | "photo";

interface ExportSuccessModalProps {
  isOpen: boolean;
  onClose: () => void;
  mediaType?: ExportSuccessMediaType;
  fileName?: string;
  donateUrl?: string;
  githubUrl?: string;
}

const emptySubscribe = () => () => { };

function useIsClient() {
  return useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );
}

interface ActionCardProps {
  href: string;
  icon: string;
  title: string;
  glowClassName: string;
  showStar?: boolean;
}

function ActionCard({ href, icon, title, glowClassName, showStar }: ActionCardProps) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="relative group flex items-center justify-between w-full overflow-hidden squircle-element border border-border dark:border-white/10 bg-card dark:bg-[#0E0E12] p-5 transition-all hover:border-foreground/20 dark:hover:border-white/20 hover:bg-accent/50 dark:hover:bg-white/4 active:scale-[0.99]"
      aria-label={title}
    >
      <div
        className={`absolute -right-16 -top-16 h-48 w-48 rounded-full blur-[70px] pointer-events-none transition-opacity group-hover:opacity-100 opacity-30 dark:opacity-50 ${glowClassName}`}
      />
      <div className="relative z-10 flex items-center gap-4 min-w-0">
        <div className="relative flex h-12 w-12 items-center justify-center squircle-element bg-muted dark:bg-white/5 text-foreground dark:text-white border border-border dark:border-white/10 group-hover:bg-accent dark:group-hover:bg-white/10 transition-colors shrink-0">
          <Icon icon={icon} width="22" height="22" aria-hidden="true" />
          {showStar && (
            <div className="absolute -top-1 -right-1 flex text-amber-400 drop-shadow-[0_2px_4px_rgba(0,0,0,0.5)]">
              <Icon
                icon="streamline-stickies-color:star"
                width="18"
                height="18"
                aria-hidden="true"
              />
            </div>
          )}
        </div>
        <div className="flex flex-col text-left min-w-0">
          <h4 className="text-base font-medium text-foreground dark:text-white tracking-tight truncate">
            {title}
          </h4>
        </div>
      </div>
      <Icon
        icon="carbon:arrow-right"
        width="20"
        className="relative z-10 text-muted-foreground dark:text-neutral-600 group-hover:text-foreground dark:group-hover:text-white transition-all transform group-hover:translate-x-1 shrink-0 ml-2"
        aria-hidden="true"
      />
    </a>
  );
}

export function ExportSuccessModal({
  isOpen,
  onClose,
  mediaType = "video",
  fileName,
  donateUrl = "/donate",
  githubUrl = "https://github.com/CristianOlivera1/openvid",
}: ExportSuccessModalProps) {
  const t = useTranslations("exportSuccess");
  const isClient = useIsClient();

  if (!isOpen || !isClient) return null;

  const subtitle = mediaType === "photo" ? t("photoSuccess") : t("videoSuccess");

  const modalContent = (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-success-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/20 backdrop-blur-md transition-all duration-500"
    >
      <div className="relative p-10 bg-popover dark:bg-black border border-border squircle-element-camera shadow-[0_0_80px_-15px_rgba(0,0,0,0.15)] dark:shadow-[0_0_80px_-15px_rgba(0,0,0,1)] w-full max-w-lg mx-4">
        <button
          onClick={onClose}
          aria-label={t("close")}
          className="absolute top-5 right-5 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-all duration-200"
        >
          <Icon icon="lucide:x" width="18" />
        </button>

        <div className="flex justify-center mb-6">
          <div className="flex items-center justify-center h-16 w-16 rounded-full bg-green-500/10 border border-green-500/20 shadow-[0_0_20px_rgba(34,197,94,0.1)]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="30"
              height="30"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-green-500 dark:text-green-400 svg-check-animated"
            >
              <path
                d="M4.5 12.75l6 6 9-13.5"
                className="svg-check-path"
              />
            </svg>
          </div>
        </div>

        <div className="text-center mb-8">
          <h2
            id="export-success-title"
            className="text-2xl font-bold tracking-tight text-foreground mb-2"
          >
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {subtitle}
          </p>
          {fileName && (
            <p className="text-xs text-muted-foreground/60 font-mono italic mt-2 tracking-wide truncate">
              {fileName}
            </p>
          )}
        </div>

        <div className="space-y-3 mb-8">
          <ActionCard
            href={donateUrl}
            icon="carbon:cafe"
            title={t("supportCoffee")}
            glowClassName="bg-blue-500/15"
          />
          <ActionCard
            href={githubUrl}
            icon="mdi:github"
            title={t("starGithub")}
            glowClassName="bg-amber-400/15"
            showStar={true}
          />
        </div>

        <Button onClick={onClose} variant="outline" className="w-full h-12">
          <Icon icon="iconoir:cancel" width="16" className="mr-2" />
          {t("close")}
        </Button>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}