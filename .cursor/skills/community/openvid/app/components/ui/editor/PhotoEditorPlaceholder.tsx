"use client";

import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";
import { useState, useCallback, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { AspectRatioSelect } from "@/app/components/ui/AspectRatioSelect";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { ImageMaskEditor } from "./ImageMaskEditor";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
} from "@/components/ui/popover";
import {
  PhotoEditorPlaceholderProps,
  Preview3DConfig,
  PREVIEW_CONFIGS,
  LAPTOP_IMAGE_PREVIEWS,
  PhoneImagePreviewConfig,
  LaptopImagePreviewConfig,
  getPhoneImagePreviews,
} from "@/types/photo.types";
import { useMockup3dContext } from "@/app/contexts/Mockup3dContext";
import { PositionCustomControls } from "@/components/ui/PositionCustomControls";

const DEFAULT_PHONE_ROTATION = { rx: -58.23, ry: -29.82 };
const DEFAULT_LAPTOP_ROTATION = { rx: 43.23, ry: -37.82 };

function getDefaultRotation(device: string) {
  return device === "laptop" ? DEFAULT_LAPTOP_ROTATION : DEFAULT_PHONE_ROTATION;
}

export function PhotoEditorPlaceholder({
  className = "",
  canvasImageUrl,
  staticImageUrl,
  onSelectPreview,
  selectedPreviewId = "front",
  aspectRatio = "auto",
  onAspectRatioChange,
  customAspectRatio = null,
  onCustomAspectRatioChange,
  onOpenCropper,
  apply3DToBackground = false,
  onToggle3DBackground,
  imageMaskConfig,
  onImageMaskConfigChange,
  onReset,
}: PhotoEditorPlaceholderProps) {
  const previewImageUrl = staticImageUrl ?? canvasImageUrl;
  const t = useTranslations("editor");

  const {
    imagePhoneActive,
    imagePhoneDevice,
    setImagePhoneRotX,
    setImagePhoneRotY,
    setImagePhoneRotZ,
    setImagePhonePerspective,
    setImagePhoneScale,
    setImagePhoneX,
    setImagePhoneY,
    setImagePhonePresetId,
    setImagePhoneOpening
  } = useMockup3dContext();

  const [customConfig, setCustomConfig] = useState<Preview3DConfig>({
    id: "custom",
    label: "Custom",
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    translateY: 0,
    scale: 0.9,
    perspective: 600,
  });

  const [isCustomPopoverOpen, setIsCustomPopoverOpen] = useState(false);

  const isCustomUntouched =
    customConfig.rotateX === 0 &&
    customConfig.rotateY === 0 &&
    customConfig.rotateZ === 0 &&
    customConfig.translateY === 0 &&
    customConfig.scale === 0.9 &&
    customConfig.perspective === 600;

  const updateCustomConfig = useCallback(
    (updates: Partial<Preview3DConfig>) => {
      const newConfig = { ...customConfig, ...updates };
      setCustomConfig(newConfig);
      if (selectedPreviewId === "custom") {
        onSelectPreview?.(newConfig);
      }
    },
    [customConfig, onSelectPreview, selectedPreviewId]
  );

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY !== 0 && !e.shiftKey) {
        e.preventDefault();
        container.scrollLeft += e.deltaY;
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => container.removeEventListener("wheel", handleWheel);
  }, [previewImageUrl]);

  const allPreviews: Preview3DConfig[] = [
    { ...customConfig, label: t("photoPreview.custom.label") },
    ...PREVIEW_CONFIGS.map((config) => ({
      ...config,
      label: t(`photoPreview.configs.${config.id}`),
    })),
  ];

  if (!previewImageUrl) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-background border-t border-border ${className}`}
        style={{ height: "180px" }}
      >
        <div className="flex flex-col items-center gap-3 text-muted-foreground/60">
          <div className="p-3 squircle-element-camera bg-muted border border-border">
            <Icon icon="lucide:image" width={28} height={28} aria-hidden="true" />
          </div>
          <div className="text-center">
            <p className="text-sm font-medium text-muted-foreground">
              {t("photoMode.title") || "No Image"}
            </p>
            <p className="text-xs text-muted-foreground/60 mt-1 max-w-xs">
              {t("photoMode.description") || "Upload or capture an image to get started"}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const renderPreviewCard = (config: Preview3DConfig) => {
    const isSelected = selectedPreviewId === config.id;
    const isCustom = config.id === "custom";
    const showCustomPlaceholder = isCustom && (!isSelected || isCustomUntouched);
    const ButtonCard = (
      <button
        onClick={() => {
          if (isCustom && selectedPreviewId !== "custom") {
            let activePreset: Preview3DConfig | undefined = PREVIEW_CONFIGS.find(
              (p) => p.id === selectedPreviewId
            );

            if (!activePreset && imagePhoneActive) {
              const deviceList = imagePhoneDevice === "laptop" ? LAPTOP_IMAGE_PREVIEWS : getPhoneImagePreviews(imagePhoneDevice);

              const devicePreset = deviceList.find((p) => p.id === selectedPreviewId);

              if (devicePreset) {
                activePreset = {
                  id: devicePreset.id,
                  label: devicePreset.label,
                  rotateX: devicePreset.rotateX,
                  rotateY: devicePreset.rotateY,
                  rotateZ: devicePreset.rotateZ,
                  translateY: devicePreset.y,
                  scale: devicePreset.scale,
                  perspective: 600,
                };
              }
            }

            if (activePreset) {
              const seeded: Preview3DConfig = {
                ...activePreset,
                id: "custom",
                label: t("photoPreview.custom.label"),
              };
              setCustomConfig(seeded);
              onSelectPreview?.(seeded);
              setIsCustomPopoverOpen(true);
              return;
            }
          }

          onSelectPreview?.(config);
          if (isCustom) setIsCustomPopoverOpen(true);
        }}
        className={`group relative shrink-0 w-32 sm:w-62 aspect-video squircle-element p-px transition-all duration-300 ease-out outline-none ${isSelected
          ? "bg-muted/60 shadow-[0_0_20px_rgba(0,163,255,0.15)]"
          : showCustomPlaceholder
            ? "border border-dashed border-border hover:border-muted-foreground/50"
            : "bg-transparent hover:bg-muted/40"
          }`}
        aria-label={config.label}
        aria-pressed={isSelected}
      >
        <div
          className={`relative w-full h-full rounded-[10px] overflow-hidden transition-colors ${showCustomPlaceholder ? "bg-transparent" : ""
            }`}
        >
          {!showCustomPlaceholder && (
            <div
              className="absolute inset-0 opacity-10 pointer-events-none group-hover:opacity-[0.2] transition-opacity duration-300"
              style={{
                backgroundImage: `radial-gradient(circle, var(--foreground) 0.8px, transparent 0.8px)`,
                backgroundSize: "10px 10px",
              }}
            />
          )}

          {showCustomPlaceholder ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background border border-border transition-colors">
              <div className="size-8 rounded-full bg-muted border border-border flex items-center justify-center">
                <Icon
                  icon="mdi:tune-variant"
                  width={16}
                  className="text-muted-foreground group-hover:text-[#00A3EE] transition-colors"
                />
              </div>
              <span className="text-[11px] font-semibold text-muted-foreground group-hover:text-foreground/80 transition-colors">
                {t("photoPreview.custom.customize")}
              </span>
            </div>
          ) : (
            <>
              {isCustom && (
                <div className="absolute top-2 left-2 z-20 flex items-center gap-1 bg-background/70 dark:bg-black/60 backdrop-blur-md border border-border/60 dark:border-white/10 px-1.5 py-0.5 rounded text-[9px] font-bold text-foreground/90 dark:text-white/90 uppercase tracking-wider pointer-events-none shadow-sm dark:shadow-lg transition-colors duration-200">
                  <Icon icon="mdi:tune" width={10} className="text-[#00A3EE]" aria-hidden="true" />
                  {t("photoPreview.custom.customize")}
                </div>
              )}
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <div
                  style={{
                    perspective: `${config.perspective || 600}px`,
                    perspectiveOrigin: "center center",
                  }}
                  className="w-full h-full flex items-center justify-center p-3"
                >
                  <div
                    className="relative w-full h-full max-w-[92%] max-h-[92%] rounded-lg overflow-hidden border border-border shadow-[0_0_25px_rgba(255,255,255,0.15)]" style={{
                      transform: `rotateX(${config.rotateX}deg) rotateY(${config.rotateY}deg) rotateZ(${config.rotateZ}deg) scale(${config.scale}) translateY(${config.translateY}%)`,
                      transformStyle: "preserve-3d",
                      transition: "transform 300ms cubic-bezier(0.25, 0.46, 0.45, 0.94)",
                    }}
                  >
                    {previewImageUrl && (
                      <img
                        src={previewImageUrl}
                        alt={config.label}
                        className="w-full h-full object-cover"
                        draggable={false}
                      />
                    )}
                  </div>
                </div>
              </div>
              <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20" />
              <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0 pointer-events-none flex items-center gap-1.5 z-20">
                {!isCustom && (
                  <Icon icon="mdi:eye-outline" width={12} className="text-white/70" aria-hidden="true" />
                )}
                <span className="text-[11px] font-medium text-white/90 tracking-wide">
                  {config.label}
                </span>
              </div>
            </>
          )}
          {isSelected && (
            <div
              className={`absolute top-2 right-2 z-30 size-5 rounded-full bg-gradient-primary flex items-center justify-center shadow-xl`}
              aria-hidden="true"
            >
              <Icon icon="mdi:check-bold" width={12} className="text-white" aria-hidden="true" />
            </div>
          )}
        </div>
      </button>
    );

    if (isCustom) {
      return (
        <Popover open={isCustomPopoverOpen} onOpenChange={setIsCustomPopoverOpen} key={config.id}>
          <PopoverTrigger asChild>{ButtonCard}</PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={12}
            className="w-64 bg-popover dark:bg-black border-border shadow-2xl p-4 space-y-4 squircle-element-camera z-50"
          >
            <PopoverHeader className="mb-2">
              <PopoverTitle className="text-xs font-semibold text-foreground/80 tracking-wide uppercase flex items-center gap-2">
                <Icon icon="mdi:tune" width={14} className="text-[#00A3EE]" />
                {t("photoPreview.custom.title")}
              </PopoverTitle>
            </PopoverHeader>

            <PositionCustomControls
              scale={customConfig.scale}
              onScaleChange={(v) => {
                updateCustomConfig({ scale: v });
                if (imagePhoneActive) setImagePhoneScale(v);
              }}
              rotateX={customConfig.rotateX}
              rotateY={customConfig.rotateY}
              onRotationXYChange={(rX, rY) => {
                updateCustomConfig({ rotateX: rX, rotateY: rY });
                if (imagePhoneActive) {
                  setImagePhoneRotX(rX);
                  setImagePhoneRotY(rY);
                }
              }}
              rotateZ={customConfig.rotateZ}
              onRotateZChange={(v) => {
                updateCustomConfig({ rotateZ: v });
                if (imagePhoneActive) setImagePhoneRotZ(v);
              }}
              perspective={!imagePhoneActive ? (customConfig.perspective || 600) : undefined}
              onPerspectiveChange={
                !imagePhoneActive ? (v) => updateCustomConfig({ perspective: v }) : undefined
              }
              verticalValue={customConfig.translateY}
              onVerticalChange={(v) => {
                updateCustomConfig({ translateY: v });
                if (imagePhoneActive) setImagePhoneY(v);
              }}
              onReset={() => {
                const resetConfig: Preview3DConfig = {
                  id: "custom",
                  label: t("photoPreview.custom.label"),
                  rotateX: 0,
                  rotateY: 0,
                  rotateZ: 0,
                  translateY: 0,
                  scale: 1.2,
                  perspective: 600,
                };
                setCustomConfig(resetConfig);
                if (selectedPreviewId === "custom") onSelectPreview?.(resetConfig);
                if (imagePhoneActive) {
                  const defaults = getDefaultRotation(imagePhoneDevice);
                  setImagePhoneRotX(defaults.rx);
                  setImagePhoneRotY(defaults.ry);
                  setImagePhoneRotZ(0);
                  setImagePhonePerspective(600);
                  setImagePhoneScale(1.2);
                  setImagePhoneY(0);
                }
              }}
              labels={{
                perspective: t("photoPreview.custom.perspective"),
                scale: t("photoPreview.custom.scale"),
                rotationXY: t("photoPreview.custom.rotationXY"),
                rotationZ: t("photoPreview.custom.rotationZ"),
                vertical: t("photoPreview.custom.vertical"),
                reset: t("photoPreview.custom.reset"),
              }}
            />
          </PopoverContent>
        </Popover>
      );
    }

    return (
      <div key={config.id} className="contents">
        {ButtonCard}
      </div>
    );
  };

  const renderDevicePreviewCard = (preset: PhoneImagePreviewConfig | LaptopImagePreviewConfig) => {
    const isSelected = selectedPreviewId === preset.id;

    return (
      <button
        key={preset.id}
        onClick={() => {
          setImagePhoneX(preset.x);
          setImagePhoneY(preset.y);
          setImagePhoneScale(preset.scale);
          setImagePhoneRotX(preset.rotateX);
          setImagePhoneRotY(preset.rotateY);
          setImagePhoneRotZ(preset.rotateZ);
          setImagePhonePresetId(preset.id);

          if ('imagePhoneOpening' in preset && setImagePhoneOpening) {
            setImagePhoneOpening(preset.imagePhoneOpening);
          }

          onSelectPreview?.({
            id: preset.id,
            label: preset.label,
            rotateX: preset.rotateX,
            rotateY: preset.rotateY,
            rotateZ: preset.rotateZ,
            translateY: preset.y,
            scale: preset.scale,
          });
        }}
        className={`group relative shrink-0 w-32 sm:w-62 aspect-video squircle-element p-px transition-all duration-300 outline-none ${isSelected ? "bg-muted/60 shadow-[0_0_20px_rgba(0,163,255,0.15)]" : "bg-transparent hover:bg-muted/40"
          }`}
        aria-label={preset.label}
        aria-pressed={isSelected}
      >
        <div className="relative w-full h-full rounded-[10px] overflow-hidden bg-muted">
          {preset.imageUrl ? (
            <img
              src={preset.imageUrl}
              alt={preset.label}
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 bg-background/60 border border-dashed border-border">
              <Icon icon="mdi:image-off-outline" width={16} className="text-muted-foreground/60" aria-hidden="true" />
              <span className="text-[9px] text-muted-foreground/60 px-2 text-center">{preset.label}</span>
            </div>
          )}

          <div className="absolute inset-0 bg-linear-to-t from-black/80 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none z-20" />
          <div className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-1 group-hover:translate-y-0 pointer-events-none flex items-center gap-1.5 z-20">
            <Icon icon="mdi:eye-outline" width={12} className="text-white/70" aria-hidden="true" />
            <span className="text-[11px] font-medium text-white/90 tracking-wide">{preset.label}</span>
          </div>

          {isSelected && (
            <div
              className="absolute top-2 right-2 z-30 size-5 rounded-full bg-gradient-primary flex items-center justify-center shadow-xl"
              aria-hidden="true"
            >
              <Icon icon="mdi:check-bold" width={12} className="text-white" aria-hidden="true" />
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className={`flex flex-col bg-background border-t border-border ${className}`}>
      <div className="h-12 shrink-0 flex items-center justify-between px-3 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex items-center gap-2 text-muted-foreground whitespace-nowrap shrink-0">
          <Icon icon="mdi:tune-vertical" width={16} aria-hidden="true" />
          <span className="hidden sm:flex text-xs font-semibold tracking-wide uppercase">
            {t("photoPreview.settings")}
          </span>
          {imageMaskConfig && onImageMaskConfigChange && (
            <ImageMaskEditor
              maskConfig={imageMaskConfig}
              onMaskConfigChange={onImageMaskConfigChange}
              canvasImageUrl={staticImageUrl ?? canvasImageUrl}
            />
          )}

          {onToggle3DBackground && (
            <TooltipAction label={t("photoPreview.apply3D")}>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggle3DBackground(!apply3DToBackground)}
                className={`px-2.5 py-2 text-xs font-medium squircle-element transition-all ${apply3DToBackground
                  ? "text-cyan-500 border border-cyan-500/50!"
                  : "bg-muted/70 text-foreground border border-border hover:bg-muted"
                  }`}
                aria-label={t("photoPreview.apply3D")}
                aria-pressed={apply3DToBackground}
              >
                <Icon icon="mdi:layers" width={12} className="inline" aria-hidden="true" />
                {t("photoPreview.mockup3D")}
              </Button>
            </TooltipAction>
          )}

          <TooltipAction label={t("photoPreview.resetDefaults")}>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                const defaultCustom: Preview3DConfig = {
                  id: "custom",
                  label: t("photoPreview.custom.label"),
                  rotateX: 0,
                  rotateY: 0,
                  rotateZ: 0,
                  translateY: 0,
                  scale: 0.9,
                  perspective: 600,
                };
                setCustomConfig(defaultCustom);

                if (imagePhoneActive) {
                  const defaults = getDefaultRotation(imagePhoneDevice);
                  setImagePhoneRotX(defaults.rx);
                  setImagePhoneRotY(defaults.ry);
                  setImagePhoneRotZ(0);
                  setImagePhonePerspective(600);
                  setImagePhoneScale(0.9);
                  setImagePhoneY(0);
                }
                onReset?.();
              }}
            >
              <Icon icon="material-symbols:refresh-rounded" width={12} aria-hidden="true" />
              {t("photoPreview.reset")}
            </Button>
          </TooltipAction>
        </div>

        <div className="flex items-center justify-end gap-2 whitespace-nowrap shrink-0 ml-4">
          {onOpenCropper && (
            <TooltipAction label={t("cropper.tooltip")}>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 px-3 py-1.5 text-xs bg-transparent border-border hover:bg-muted"
                onClick={onOpenCropper}
                aria-label={t("cropper.tooltip")}
              >
                <Icon icon="mdi:crop" width={14} aria-hidden="true" />
                {t("cropper.button")}
              </Button>
            </TooltipAction>
          )}

          {onAspectRatioChange && (
            <AspectRatioSelect
              value={aspectRatio}
              onChange={onAspectRatioChange}
              customDimensions={customAspectRatio}
              onCustomDimensionsChange={onCustomAspectRatioChange}
            />
          )}
        </div>
      </div>

      <div ref={scrollContainerRef} className="flex gap-1 sm:gap-3 px-3 overflow-x-auto custom-scrollbar mask-r-from-90%">
        {imagePhoneActive ? (
          <>
            {renderPreviewCard(allPreviews[0])}
            {(imagePhoneDevice === "laptop" ? LAPTOP_IMAGE_PREVIEWS : getPhoneImagePreviews(imagePhoneDevice)).map(
              renderDevicePreviewCard
            )}
          </>
        ) : (
          allPreviews.map(renderPreviewCard)
        )}
      </div>
    </div>
  );
}