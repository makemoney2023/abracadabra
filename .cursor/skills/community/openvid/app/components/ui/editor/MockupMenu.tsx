"use client";

import { useState, useRef, useCallback, useEffect, useMemo } from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@iconify/react";

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { MOCKUPS, MOCKUP_CATEGORIES } from "@/lib/mockup-data";
import {
  IMAGE_DEVICE_TEMPLATES,
  ImageDeviceId,
  MenuPage,
  MockupConfig,
  MockupCategory,
} from "@/types/mockup.types";
import { MockupGridSkeleton } from "../Skeleton";
import { Button } from "@/components/ui/button";
import { useMockup3dContext } from "@/app/contexts/Mockup3dContext";
import { getWallpaperUrl } from "@/lib/wallpaper.utils";
import { Mockup2dMenu } from "./Mockup2dMenu";
import { Mockup3dMenu, type ActiveDeviceTpl } from "./Mockup3dMenu";
import { DeviceCard } from "@/components/ui/DeviceCard";

export interface MockupMenuProps {
  mockupId?: string;
  mockupConfig?: MockupConfig;
  onMockupChange?: (mockupId: string) => void;
  onMockupConfigChange?: (config: Partial<MockupConfig>) => void;
  backgroundUrl?: string | null;
  backgroundColorCss?: string | null;
  backgroundTab?: "wallpaper" | "image" | "color" | "unsplash";
  selectedWallpaper?: number;
  selectedImageUrl?: string;
  initialPage?: MenuPage;
  mediaType?: "video" | "image";
}

export function MockupMenu({
  mockupId = "none",
  mockupConfig,
  onMockupChange,
  onMockupConfigChange,
  backgroundUrl,
  backgroundColorCss,
  backgroundTab,
  selectedWallpaper,
  selectedImageUrl,
  initialPage = "home",
  mediaType = "image",
}: MockupMenuProps) {
  const t = useTranslations("mockupMenu");

  const [page, setPage] = useState<MenuPage>(initialPage);
  const [prevInitialPage, setPrevInitialPage] = useState<MenuPage>(initialPage);

  if (initialPage !== prevInitialPage) {
    setPrevInitialPage(initialPage);
    if (initialPage !== "home") {
      setPage(initialPage);
    }
  }

  const [selectedCategory, setSelectedCategory] = useState<MockupCategory>("all");
  const [gridLoaded, setGridLoaded] = useState(false);

  const {
    imagePhoneActive, setImagePhoneActive,
    imagePhoneX, setImagePhoneX,
    imagePhoneY, setImagePhoneY,
    imagePhoneScale, setImagePhoneScale,
    imagePhoneRotX, imagePhoneRotY, setImagePhoneRotX, setImagePhoneRotY,
    imagePhoneRotZ, setImagePhoneRotZ,
    imagePhoneDevice, setImagePhoneDevice,
    imagePhoneOpening, setImagePhoneOpening,
    imagePhoneShadow, setImagePhoneShadow,
    imagePhoneShadowColor,
    imagePhonePresetId, setImagePhonePresetId,
    setImagePhoneShadowColor,
    viewer3DAutoRotate, setViewer3DAutoRotate,
    viewer3DRotationSpeed, setViewer3DRotationSpeed,
    viewer3DGlow, setViewer3DGlow,
    viewer3DEnvironment, setViewer3DEnvironment,
  } = useMockup3dContext();

  const filteredMockups = useMemo(() => {
    return selectedCategory === "all"
      ? MOCKUPS
      : MOCKUPS.filter((m) => m.category === selectedCategory);
  }, [selectedCategory]);

  const currentMockup = useMemo(() => {
    return MOCKUPS.find((m) => m.id === mockupId);
  }, [mockupId]);

  const activeDeviceId: ImageDeviceId | null = imagePhoneActive
    ? (imagePhoneDevice as ImageDeviceId)
    : null;

  const activeDeviceTpl: ActiveDeviceTpl | null = useMemo(() => {
    if (!imagePhoneActive) return null;
    const tpl = IMAGE_DEVICE_TEMPLATES.find((t) => t.id === activeDeviceId);
    if (!tpl) return null;
    return {
      id: tpl.id,
      title: tpl.title,
      accentColor: tpl.accentColor,
      icon: tpl.icon,
      modelUrl: tpl.modelUrl,
      posterUrl: tpl.posterUrl,
      videoUrl: tpl.videoUrl,
    };
  }, [imagePhoneActive, activeDeviceId]);

  const isLaptop = imagePhoneActive && imagePhoneDevice === "laptop";

  const resolvedBackgroundUrl = useMemo(() => {
    if (backgroundUrl) return backgroundUrl;
    if (backgroundTab === "image" && selectedImageUrl) return selectedImageUrl;
    if (backgroundTab === "wallpaper" && typeof selectedWallpaper === "number" && selectedWallpaper >= 0) {
      return getWallpaperUrl(selectedWallpaper);
    }
    return null;
  }, [backgroundUrl, backgroundTab, selectedImageUrl, selectedWallpaper]);

  const hasActiveFrame = mockupId !== "none" || (mediaType === "image" && imagePhoneActive);

  const handleMockupSelect = useCallback((id: string) => {
    onMockupChange?.(id);
    if (imagePhoneActive) setImagePhoneActive(false);
    if (id !== "none") setPage("detail-2d");
  }, [onMockupChange, imagePhoneActive, setImagePhoneActive]);

  const handleCategoryChange = useCallback((cat: MockupCategory) => {
    setSelectedCategory(cat);
    setGridLoaded(false);
    setTimeout(() => setGridLoaded(true), 250);
  }, []);

  const handleDeviceClick = useCallback((id: ImageDeviceId) => {
    const isSameDevice = imagePhoneDevice === id;
    const isUnposed = imagePhoneRotX === 0 && imagePhoneRotY === 0;

    setImagePhoneDevice(id);

    if (!isSameDevice || isUnposed) {
      setImagePhoneX(0);
      setImagePhoneY(0);
      setImagePhoneScale(0.9);

      if (id === "iphone-13-pro-max") {
        setImagePhoneRotX(-58.23);
        setImagePhoneRotY(-29.82);
        setImagePhoneScale(1.6);
      } else if (id === "double_iphone_13_pro") {
        setImagePhoneRotX(-30.23);
        setImagePhoneRotY(-60.82);
      } else if (id === "laptop") {
        setImagePhoneRotX(43.23);
        setImagePhoneRotY(-37.82);
        setImagePhoneOpening(1);
        setImagePhoneScale(1);
      } else {
        setImagePhoneRotX(-58.23);
        setImagePhoneRotY(-29.82);
      }
    }

    setImagePhoneActive(true);
    if (mockupId !== "none") onMockupChange?.("none");
    setPage("detail-3d");
  }, [
    imagePhoneDevice, imagePhoneRotX, imagePhoneRotY, setImagePhoneDevice,
    setImagePhoneX, setImagePhoneY, setImagePhoneScale, setImagePhoneRotX,
    setImagePhoneRotY, setImagePhoneOpening, setImagePhoneActive, mockupId, onMockupChange
  ]);

  const handleRemoveAll = useCallback(() => {
    onMockupChange?.("none");
    setImagePhoneActive(false);
    setPage("home");
  }, [onMockupChange, setImagePhoneActive]);

  const devicesScrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const devicesScrollLeftRef = useRef(0);

  const updateDevicesScrollState = useCallback(() => {
    const el = devicesScrollRef.current;
    if (!el) return;
    const maxScrollLeft = el.scrollWidth - el.clientWidth;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft < maxScrollLeft - 8);
  }, []);

  const handleDevicesScroll = useCallback(() => {
    const el = devicesScrollRef.current;
    if (!el) return;
    devicesScrollLeftRef.current = el.scrollLeft;

    requestAnimationFrame(() => {
      updateDevicesScrollState();
    });
  }, [updateDevicesScrollState]);

  const restoreDevicesScroll = useCallback(() => {
    const el = devicesScrollRef.current;
    if (!el) return;
    el.scrollLeft = devicesScrollLeftRef.current;
    updateDevicesScrollState();
  }, [updateDevicesScrollState]);

  const scrollDevices = useCallback((direction: "left" | "right") => {
    const el = devicesScrollRef.current;
    if (!el) return;
    const amount = Math.max(220, Math.round(el.clientWidth * 0.78));
    el.scrollBy({
      left: direction === "left" ? -amount : amount,
      behavior: "smooth",
    });
  }, []);

  useEffect(() => {
    if (page !== "home") return;

    const id = requestAnimationFrame(() => {
      restoreDevicesScroll();
    });

    const el = devicesScrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return;
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      el.scrollLeft += e.deltaY;
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("resize", updateDevicesScrollState);

    updateDevicesScrollState();

    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", updateDevicesScrollState);
      cancelAnimationFrame(id);
    };
  }, [page, restoreDevicesScroll, updateDevicesScrollState]);


  if (page === "detail-2d" && mockupId !== "none") {
    return (
      <Mockup2dMenu
        mockupId={mockupId}
        mockupConfig={mockupConfig}
        onMockupChange={onMockupChange}
        onMockupConfigChange={onMockupConfigChange}
        onBack={() => setPage("home")}
      />
    );
  }

  if (page === "detail-3d") {
    return (
      <Mockup3dMenu
        activeDeviceTpl={activeDeviceTpl}
        imagePhoneDevice={imagePhoneDevice}
        isLaptop={isLaptop}
        mediaType={mediaType}
        imagePhoneScale={imagePhoneScale}
        setImagePhoneScale={setImagePhoneScale}
        imagePhoneOpening={imagePhoneOpening}
        setImagePhoneOpening={setImagePhoneOpening}
        imagePhoneShadow={imagePhoneShadow}
        setImagePhoneShadow={setImagePhoneShadow}
        setImagePhoneShadowColor={setImagePhoneShadowColor}
        imagePhoneX={imagePhoneX}
        setImagePhoneX={setImagePhoneX}
        imagePhoneY={imagePhoneY}
        setImagePhoneY={setImagePhoneY}
        setImagePhoneRotX={setImagePhoneRotX}
        setImagePhoneRotY={setImagePhoneRotY}
        backgroundUrl={resolvedBackgroundUrl}
        backgroundColorCss={backgroundColorCss}
        onBack={() => setPage("home")}
        onRemove={handleRemoveAll}
        imagePhoneRotX={imagePhoneRotX}
        imagePhoneRotY={imagePhoneRotY}
        imagePhoneRotZ={imagePhoneRotZ}
        setImagePhoneRotZ={setImagePhoneRotZ}
        imagePhonePresetId={imagePhonePresetId}
        setImagePhonePresetId={setImagePhonePresetId}
        viewer3DAutoRotate={viewer3DAutoRotate}
        setViewer3DAutoRotate={setViewer3DAutoRotate}
        viewer3DRotationSpeed={viewer3DRotationSpeed}
        setViewer3DRotationSpeed={setViewer3DRotationSpeed}
        viewer3DGlow={viewer3DGlow}
        setViewer3DGlow={setViewer3DGlow}
        viewer3DEnvironment={viewer3DEnvironment}
        setViewer3DEnvironment={setViewer3DEnvironment}
      />
    );
  }
  
  return (
    <div className="p-4 flex flex-col gap-6">
      <div className="flex items-center gap-2 text-foreground font-medium">
        <Icon icon="hugeicons:ai-browser" width="20" aria-hidden="true" />
        <span>{t("title")}</span>
      </div>

      <div className="flex flex-col gap-3">
        <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
          {t("frames2D")}
        </p>

        <Popover
          onOpenChange={(open) => {
            if (open && !gridLoaded) {
              setTimeout(() => setGridLoaded(true), 300);
            }
          }}
        >
          <PopoverTrigger asChild>
            <button
              type="button"
              className={`group relative flex items-center gap-3 p-2 squircle-element border transition-all w-full h-35 ${mockupId !== "none"
                ? "bg-blue-500/10 border-blue-500/40 text-blue-600 dark:text-blue-300"
                : "bg-muted/50 border-border text-muted-foreground/60 hover:border-border"
                }`}
              aria-label={t("windowType")}
              aria-haspopup="dialog"
            >
              <div className="flex-1 flex flex-col gap-2 h-full justify-center overflow-hidden">
                <div className="w-full squircle-element overflow-hidden bg-muted relative h-full">
                  {(() => {
                    const categoryConfig = MOCKUP_CATEGORIES.find(
                      (c) => c.id === currentMockup?.category
                    );
                    const bgUrl = categoryConfig?.bgUrl || "https://i.ibb.co/r2JQ3Gcy/minimal-02.jpg";
                    return (
                      <div
                        className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-500 group-hover:scale-110"
                        style={{ backgroundImage: `url('${bgUrl}')` }}
                      />
                    );
                  })()}
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none scale-95">
                    {currentMockup?.preview}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold tracking-wider">
                    {t(`mockups.${currentMockup?.id}`) || t("none")}
                  </span>
                </div>
              </div>
              <div className="flex items-center justify-center px-1 border-l border-border h-full group-hover:text-foreground transition-colors">
                <Icon icon="uil:sort" aria-hidden="true" width="20" />
              </div>
            </button>
          </PopoverTrigger>

          <PopoverContent side="right" align="start" sideOffset={12} className="w-125 p-0 border-0 shadow-2xl">
            <div className="flex flex-col bg-popover dark:bg-black border border-border squircle-element-camera overflow-hidden shadow-2xl max-h-150">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40 flex-wrap">
                {MOCKUP_CATEGORIES.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => handleCategoryChange(cat.id)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium uppercase tracking-wider transition-all ${selectedCategory === cat.id
                      ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/40"
                      : "bg-muted text-muted-foreground hover:text-muted-foreground border border-transparent hover:border-border"
                      }`}
                  >
                    <Icon icon={cat.icon} width="12" />
                    <span>{t(`categories.${cat.id}`)}</span>
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  {t("count", { count: filteredMockups.length })}
                </span>
              </div>

              <div className="relative overflow-y-auto custom-scrollbar overflow-x-hidden min-h-62.5">
                <div
                  className={`absolute inset-0 w-full transition-all duration-300 ease-out z-10 ${gridLoaded ? "opacity-0 blur-md pointer-events-none scale-105" : "opacity-100 blur-0 scale-100"
                    }`}
                >
                  <MockupGridSkeleton />
                </div>
                <div
                  className={`p-3 grid grid-cols-3 gap-2 transition-all duration-300 ease-out ${!gridLoaded ? "opacity-0 scale-95 pointer-events-none" : "opacity-100 scale-100"
                    }`}
                >
                  {filteredMockups.map((mockup) => {
                    const categoryConfig = MOCKUP_CATEGORIES.find((c) => c.id === mockup.category);
                    const isActive = mockupId === mockup.id;

                    return (
                      <button
                        key={mockup.id}
                        onClick={() => handleMockupSelect(mockup.id)}
                        className={`group relative w-full h-28 squircle-element border-2 overflow-hidden shadow-lg transition-all active:scale-95 ${isActive ? "border-blue-500 ring-2 ring-blue-500/50" : "border-border hover:border-muted-foreground/50"
                          }`}
                      >
                        <div
                          className="absolute inset-0 bg-cover bg-center bg-no-repeat transition-transform duration-500 group-hover:scale-105"
                          style={{
                            backgroundImage: `url('${categoryConfig?.bgUrl || "https://i.ibb.co/r2JQ3Gcy/minimal-02.jpg"
                              }')`,
                          }}
                        >
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            {mockup.preview}
                          </div>
                        </div>
                        <div className="absolute inset-0 group-hover:bg-black/5 dark:group-hover:bg-white/5 transition-colors pointer-events-none" />
                        <div className="absolute bottom-0 left-0 bg-black/60 border-t border-r border-border px-1 py-0.5 text-[11px] text-white/80 font-semibold tracking-tight rounded-tr-md rounded-bl-lg z-30">
                          {t(`mockups.${mockup?.id}`) || t("none")}
                        </div>
                        {isActive && (
                          <div className="absolute top-2 right-2 rounded-full shadow-[0_0_10px_rgba(96,165,250,0.8)] z-30">
                            <Icon icon="icon-park-solid:check-one" width="20" className="text-blue-600 dark:text-blue-500" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>

        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            {["none", "outline", "macos", "macos-glass", "brave", "macbook-photo"].map((id) => {
              const mockup = MOCKUPS.find((m) => m.id === id);
              if (!mockup) return null;

              const categoryConfig = MOCKUP_CATEGORIES.find((c) => c.id === mockup.category);
              const isActive = mockupId === mockup.id;

              return (
                <button
                  key={id}
                  onClick={() => handleMockupSelect(id)}
                  className={`group relative w-full h-20 squircle-element border overflow-hidden transition-all active:scale-95 ${isActive ? "border-blue-500/60 ring-1 ring-blue-500/30" : "border-border hover:border-muted-foreground/50"
                    }`}
                >
                  <div
                    className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-105"
                    style={{ backgroundImage: `url('${categoryConfig?.bgUrl || ""}')` }}
                  >
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none scale-90">
                      {mockup.preview}
                    </div>
                  </div>
                  <div className="absolute bottom-0 left-0 bg-black/60 border-t border-r border-border px-1 py-0.5 text-[9px] text-white/80 font-semibold tracking-tight rounded-tr-md rounded-bl-lg z-30">
                    {t(`mockups.${mockup?.id}`) || t("none")}
                  </div>
                  {isActive && (
                    <div className="absolute top-1.5 right-1.5 rounded-full shadow-[0_0_8px_rgba(96,165,250,0.7)] z-30 flex items-center justify-center size-4">
                      <div className="absolute size-2 bg-white rounded-full z-0" />
                      <Icon icon="icon-park-solid:check-one" width="24" height="24" className="text-blue-600 dark:text-blue-500 relative z-10" />
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <>
        <div className="h-px bg-muted" />
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
              {t("devices3D")}
            </p>
            <div className="flex items-center gap-2">
              <div className="flex items-center squircle-element border border-border bg-muted/50 p-0.5">
                <button
                  type="button"
                  onClick={() => scrollDevices("left")}
                  disabled={!canScrollLeft}
                  className="flex size-7 items-center justify-center squircle-element text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <Icon icon="ph:caret-left-bold" width="12" />
                </button>
                <button
                  type="button"
                  onClick={() => scrollDevices("right")}
                  disabled={!canScrollRight}
                  className="flex size-7 items-center justify-center rounded-full text-muted-foreground transition-all hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <Icon icon="ph:caret-right-bold" width="12" />
                </button>
              </div>
            </div>
          </div>

          <div className="relative">
            <div
              className={`pointer-events-none absolute inset-y-0 right-0 z-20 w-12 bg-gradient-to-l from-background to-transparent transition-opacity duration-200 ${canScrollRight ? "opacity-100" : "opacity-0"
                }`}
            />
            <div
              ref={devicesScrollRef}
              className="grid grid-rows-2 grid-flow-col gap-2 overflow-x-auto overflow-y-hidden snap-x snap-mandatory scroll-smooth pb-2 pl-1 pr-12 custom-scrollbar"
              style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
              onScroll={handleDevicesScroll}
            >
              {IMAGE_DEVICE_TEMPLATES.map((tpl) => (
                <DeviceCard
                  key={tpl.id}
                  tpl={tpl}
                  isActive={activeDeviceId === tpl.id}
                  onClick={() => handleDeviceClick(tpl.id)}
                />
              ))}
            </div>
          </div>
        </div>
      </>
      {hasActiveFrame && (
        <Button onClick={handleRemoveAll} variant="outline" className="w-full text-xs" aria-label={t("remove")}>
          <Icon icon="ph:trash-bold" width="13" aria-hidden="true" />
          {t("remove")}
        </Button>
      )}
    </div>
  );
}