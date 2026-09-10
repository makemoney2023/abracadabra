import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/react";
import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { MediaType } from "@/types/editor.types";

interface PlaceholderEditorProps {
  onVideoUpload?: (file: File) => void;
  isUploading?: boolean;
  mediaType?: MediaType;
}

export default function PlaceholderEditor({
  onVideoUpload,
  isUploading = false,
  mediaType = "video",
}: PlaceholderEditorProps) {
  const t = useTranslations("placeholder");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);

  const isImageMode = mediaType === "image";

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onVideoUpload) {
      onVideoUpload(file);
      e.target.value = "";
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    const isValidFile = isImageMode
      ? file?.type.startsWith("image/")
      : file?.type.startsWith("video/");

    if (file && isValidFile && onVideoUpload) {
      onVideoUpload(file);
    }
  };

  const acceptedFormats = isImageMode
    ? "image/jpeg,image/png,image/webp,image/gif"
    : "video/mp4,video/webm,video/quicktime,video/x-matroska";

  return (
    <>
      <div className="bg-muted backdrop-blur-xl flex flex-col justify-center items-center px-4 shrink-0 w-full h-11 border-b border-border shadow-[inset_0_1px_0_rgba(255,255,255,0.05)] rounded-t-xl">
        <div className="flex items-center justify-between w-full">
          <div className="flex items-center gap-4 w-1/3">
            <div className="flex gap-2">
              <div className="size-3 rounded-full bg-muted-foreground/30 hover:bg-[#FF5F56] transition-colors shadow-inner"></div>
              <div className="size-3 rounded-full bg-muted-foreground/30 hover:bg-[#FFBD2E] transition-colors shadow-inner"></div>
              <div className="size-3 rounded-full bg-muted-foreground/30 hover:bg-[#27C93F] transition-colors shadow-inner"></div>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-muted-foreground ml-2">
              <Icon icon="lucide:chevron-left" className="size-4 hover:text-foreground transition-colors cursor-pointer" />
              <Icon icon="lucide:chevron-right" className="size-4 text-muted-foreground/50" />
            </div>
          </div>

          <div className="flex-1 flex justify-center w-1/3">
            <div className="bg-muted/60 rounded-md h-7 w-full max-w-sm flex items-center justify-between px-3 border border-border shadow-[inset_0_1px_3px_rgba(0,0,0,0.2)]">
              <Icon icon="material-symbols:lock-outline" className="size-3.5 text-muted-foreground" />
              <span className="flex-1 text-center text-xs font-medium tracking-wide truncate px-3 text-muted-foreground">
                {t("browserBar.newTab")}
              </span>
              <Icon icon="solar:restart-linear" className="size-3.5 text-muted-foreground hover:text-foreground cursor-pointer transition-colors" />
            </div>
          </div>

          <div className="flex items-center justify-end gap-4 text-muted-foreground w-1/3">
            <Icon icon="solar:upload-linear" className="size-4 hover:text-foreground transition-colors cursor-pointer" />
            <Icon icon="ic:round-plus" className="size-4 hover:text-foreground transition-colors cursor-pointer" />
            <Icon icon="solar:copy-linear" className="size-4 hover:text-foreground transition-colors cursor-pointer" />
          </div>
        </div>
      </div>

      <div
        className="flex-1 flex items-center justify-center p-6 sm:p-12 bg-muted/40"
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div
          onClick={handleUploadClick}
          className={`relative group w-full max-w-2xl squircle-element-camera p-8 sm:p-12 flex flex-col items-center justify-center text-center overflow-hidden cursor-pointer shadow-[0_8px_32px_rgba(0,0,0,0.6)] transition-all duration-[400ms] ease-[cubic-bezier(0.175,0.885,0.32,2.2)] ${isDragging ? "scale-[1.02]" : "hover:scale-[1.01]"
            }`}
        >
          <div
            className="absolute inset-0 z-0 backdrop-blur-[8px] isolate squircle-element-camera"
            style={{ filter: "url(#glass-distortion)" }}
          />

          <div
            className={`absolute inset-0 z-[1] squircle-element-camera transition-colors duration-300 ${isDragging ? "bg-blue-500/20" : "bg-muted/70 group-hover:bg-muted/90"
              }`}
          />

          <div className="absolute inset-0 z-[2] squircle-element-camera bg-[radial-gradient(circle_at_center,rgba(0,0,0,0.25)_0%,transparent_70%)] pointer-events-none" />

          <div className="absolute inset-0 z-[3] shadow-[inset_1px_1px_1px_0_rgba(255,255,255,0.15),_inset_-1px_-1px_1px_0_rgba(255,255,255,0.05)] squircle-element-camera pointer-events-none" />
          {isDragging && (
            <div
              className="absolute inset-0 z-50"
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            />
          )}

          <div className="relative z-10 flex flex-col items-center pointer-events-none">
            <div
              className={`w-16 h-16 rounded-full border flex items-center justify-center mb-6 transition-all duration-[400ms] ease-out shadow-[0_4px_16px_rgba(0,0,0,0.2)] ${isDragging
                ? "bg-blue-500/20 border-blue-400/50 text-blue-500 dark:text-blue-400 scale-110 shadow-[0_0_20px_rgba(59,130,246,0.5)]"
                : "bg-muted/70 border-border text-muted-foreground group-hover:scale-105 group-hover:bg-muted"
                }`}
            >
              <Icon
                icon={
                  isDragging
                    ? "solar:upload-minimalistic-bold"
                    : "solar:upload-minimalistic-linear"
                }
                className="text-3xl"
                strokeWidth="1.5"
              />
            </div>

            <div className="space-y-2 mb-8">
              <p className="text-lg font-semibold text-foreground">
                {isDragging
                  ? isImageMode
                    ? t("upload.draggingImage")
                    : t("upload.dragging")
                  : isImageMode
                    ? t("upload.titleImage")
                    : t("upload.title")}
                <span className="font-normal text-muted-foreground ml-1">
                  {!isDragging &&
                    ` ${isImageMode
                      ? t("upload.subtitleImage")
                      : t("upload.subtitle")
                    }`}
                </span>
              </p>
              <p className="text-sm font-medium text-muted-foreground">
                {isImageMode
                  ? t("upload.formatsImage")
                  : t("upload.formats")}
              </p>
            </div>

            {onVideoUpload && (
              <div className="pointer-events-auto">
                <Button
                  variant="outline"
                  disabled={isUploading}
                  className="bg-muted/60 border-border hover:bg-muted hover:border-foreground/30 hover:text-foreground text-foreground backdrop-blur-md transition-all shadow-[0_4px_16px_rgba(0,0,0,0.2)] rounded-full px-6 font-medium"
                >
                  {isUploading ? (
                    <>
                      <Icon
                        icon="svg-spinners:ring-resize"
                        width="18"
                        height="18"
                        className="mr-2"
                      />
                      <span>{t("upload.uploading")}</span>
                    </>
                  ) : (
                    <>
                      <span>{t("upload.button")}</span>
                    </>
                  )}
                </Button>
              </div>
            )}
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept={acceptedFormats}
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      </div>

      <svg style={{ display: "none" }}>
        <filter
          id="glass-distortion"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          filterUnits="objectBoundingBox"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.01 0.01"
            numOctaves="1"
            seed="5"
            result="turbulence"
          />
          <feComponentTransfer in="turbulence" result="mapped">
            <feFuncR type="gamma" amplitude="1" exponent="10" offset="0.5" />
            <feFuncG type="gamma" amplitude="0" exponent="1" offset="0" />
            <feFuncB type="gamma" amplitude="0" exponent="1" offset="0.5" />
          </feComponentTransfer>
          <feGaussianBlur in="turbulence" stdDeviation="3" result="softMap" />
          <feSpecularLighting
            in="softMap"
            surfaceScale="5"
            specularConstant="1"
            specularExponent="100"
            lightingColor="white"
            result="specLight"
          >
            <fePointLight x="-200" y="-200" z="300" />
          </feSpecularLighting>
          <feComposite
            in="specLight"
            operator="arithmetic"
            k1="0"
            k2="1"
            k3="1"
            k4="0"
            result="litImage"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softMap"
            scale="100"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
    </>
  );
}