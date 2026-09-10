"use client";
import { useState, useRef } from "react";
import { Icon } from "@iconify/react";
import { motion, AnimatePresence } from "framer-motion";
import { WALLPAPER_CATEGORIES, type WallpaperCategory, type WallpaperItem } from "@/lib/wallpaper.catalog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PhotoPickerPopover } from "./PhotoPickerPopover";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { useTranslations } from "next-intl";

const PREVIEW_LIMIT = 11;

interface WallpaperGridProps {
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  onUnsplashSelect?: (url: string) => void;
  onCustomImageSelect?: (url: string) => void;
  showAll?: boolean;
  onShowAllChange?: (value: boolean) => void;
}

function CustomImagePickerButton({ onSelect }: { onSelect?: (url: string) => void }) {
  const t = useTranslations("wallpapers");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) onSelect?.(dataUrl);
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleChange}
        aria-label={t("options.upload")}
      />
      <TooltipAction label={t("options.upload")}>
        <button
          onClick={() => inputRef.current?.click()}
          className="aspect-square bg-[#F3F4F6] border squircle-element flex items-center justify-center transition-all active:scale-90 group disabled:opacity-50 hover:opacity-80"
          aria-label={t("options.upload")}
        >
          <Icon icon="material-symbols:upload-rounded" width="24" className="text-black transition-colors" aria-hidden="true" />
        </button>
      </TooltipAction>
    </>
  );
}

export function OptionsGrid({ selectedIndex = -1, onSelect, onUnsplashSelect, onCustomImageSelect }: WallpaperGridProps) {
  const t = useTranslations("wallpapers");
  return (
    <div className="grid grid-cols-6 gap-2">
      <TooltipAction label={t("options.none")}>
        <button
          onClick={() => onSelect?.(-1)}
          className={`aspect-square squircle-element cursor-pointer transition-all flex items-center justify-center relative overflow-hidden border ${selectedIndex === -1
            ? "ring-2 ring-foreground/80 shadow-lg shadow-black/40"
            : "hover:ring-2 ring-foreground/60"
            }`}
          style={{
            backgroundImage:
              "linear-gradient(45deg,#444 25%,transparent 25%),linear-gradient(-45deg,#444 25%,transparent 25%),linear-gradient(45deg,transparent 75%,#444 75%),linear-gradient(-45deg,transparent 75%,#444 75%)",
            backgroundSize: "12px 12px",
            backgroundPosition: "0 0,0 6px,6px -6px,-6px 0",
            backgroundColor: "#F3F4F6",
          }}
          aria-label={t("options.none")}
          aria-pressed={selectedIndex === -1}
        />
      </TooltipAction>
      <CustomImagePickerButton onSelect={onCustomImageSelect} />
      <PhotoPickerPopover onSelect={(url) => onUnsplashSelect?.(url)} />
    </div>
  );
}

function CategoryPopover({ category, selectedIndex, onSelect }: { category: WallpaperCategory; selectedIndex: number; onSelect?: (index: number) => void; }) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("wallpapers");
  const categoryName = t(`categories.${category.id}`);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <TooltipAction label={t("popover.seeMore", { name: categoryName })}>
        <PopoverTrigger asChild>
          <button className="aspect-square rounded-lg border border-border bg-muted flex items-center justify-center hover:bg-muted transition group" aria-label={t("popover.seeMore", { name: categoryName })}>
            <Icon icon="ph:plus-bold" width="16" className="text-blue-600 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </TooltipAction>
      <PopoverContent side="right" align="start" sideOffset={12} className="w-126 p-0 border-0 shadow-2xl">
        <div className="flex flex-col bg-popover dark:bg-black border border-border squircle-element-camera overflow-hidden shadow-2xl">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40">
            <Icon icon={category.icon} width="14" className="text-muted-foreground" aria-hidden="true" />
            <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
              {categoryName}
            </span>
            <span className="ml-auto text-[11px] text-muted-foreground">
              {t("popover.moreCount", { count: category.items.length - PREVIEW_LIMIT })}
            </span>
          </div>
          <div className="p-3 grid grid-cols-8 gap-2 max-h-80 overflow-y-auto custom-scrollbar">
            {category.items.slice(PREVIEW_LIMIT).map((item) => (
              <WallpaperThumbProgressive key={item.index} item={item} isSelected={selectedIndex === item.index} onSelect={onSelect} />
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function PrimaryCategoryGrid({ category, selectedIndex, onSelect }: { category: WallpaperCategory; selectedIndex: number; onSelect?: (index: number) => void; }) {
  const t = useTranslations("wallpapers");
  const visible = category.items.slice(0, PREVIEW_LIMIT);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
        <Icon icon={category.icon} width="12" />
        <span>{t(`categories.${category.id}`)}</span>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {visible.map((item) => (
          <WallpaperThumb key={item.index} item={item} isSelected={selectedIndex === item.index} onSelect={onSelect} />
        ))}
        <CategoryPopover category={category} selectedIndex={selectedIndex} onSelect={onSelect} />
      </div>
    </div>
  );
}

function SecondaryCategoryGrid({ category, selectedIndex, onSelect }: { category: WallpaperCategory; selectedIndex: number; onSelect?: (index: number) => void; }) {
  const t = useTranslations("wallpapers");
  const visible = category.items.slice(0, PREVIEW_LIMIT);
  return (
    <motion.div
      initial={{ opacity: 0, height: 0, marginTop: 0 }}
      animate={{ opacity: 1, height: "auto", marginTop: 20 }}
      exit={{ opacity: 0, height: 0, marginTop: 0 }}
      transition={{ duration: 0.3, ease: "easeInOut" }}
      className="flex flex-col gap-2 overflow-hidden"
    >
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
        <Icon icon={category.icon} width="12" aria-hidden="true" />
        <span>{t(`categories.${category.id}`)}</span>
      </div>
      <div className="grid grid-cols-6 gap-2">
        {visible.map((item) => (
          <WallpaperThumb key={item.index} item={item} isSelected={selectedIndex === item.index} onSelect={onSelect} />
        ))}
        {category.items.length > PREVIEW_LIMIT && (
          <CategoryPopover category={category} selectedIndex={selectedIndex} onSelect={onSelect} />
        )}
      </div>
    </motion.div>
  );
}

export function WallpaperCatalogGrid({
  selectedIndex = -1,
  onSelect,
  showAll = false,
  onShowAllChange,
}: WallpaperGridProps) {
  const t = useTranslations("wallpapers");
  const primary = WALLPAPER_CATEGORIES.filter((c) => c.primary);
  const secondary = WALLPAPER_CATEGORIES.filter((c) => !c.primary);

  return (
    <div className="flex flex-col gap-5">
      {primary.map((cat) => (
        <PrimaryCategoryGrid key={cat.id} category={cat} selectedIndex={selectedIndex} onSelect={onSelect} />
      ))}
      {secondary.length > 0 && (
        <motion.button
          onClick={() => onShowAllChange?.(!showAll)}
          className="flex items-center justify-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground font-bold transition-colors"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
        >
          <motion.div animate={{ rotate: showAll ? 180 : 0 }} transition={{ duration: 0.3, ease: "easeInOut" }}>
            <Icon icon="lucide:chevron-down" width="12" aria-hidden="true" />
          </motion.div>
          <span>{showAll ? t("options.showLess") : t("options.showMore")}</span>
        </motion.button>
      )}
      <AnimatePresence mode="sync">
        {showAll && secondary.map((cat) => (
          <SecondaryCategoryGrid key={cat.id} category={cat} selectedIndex={selectedIndex} onSelect={onSelect} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function WallpaperThumb({ item, isSelected, onSelect }: { item: WallpaperItem; isSelected: boolean; onSelect?: (index: number) => void; }) {
  return (
    <button
      onClick={() => onSelect?.(item.index)}
      className={`aspect-square squircle-element cursor-pointer transition-all bg-cover bg-center border ${isSelected
        ? "ring-2 ring-foreground/80 border-border shadow-md shadow-black/50"
        : "border-border hover:border-muted-foreground/50 hover:ring-1 ring-foreground/20"
        }`}
      style={{ backgroundImage: `url('${item.previewUrl}')` }}
      aria-label={item.filename}
      aria-pressed={isSelected}
    />
  );
}

function WallpaperThumbProgressive({ item, isSelected, onSelect }: { item: WallpaperItem; isSelected: boolean; onSelect?: (index: number) => void; }) {
  const [isLoaded, setIsLoaded] = useState(false);
  return (
    <button
      onClick={() => onSelect?.(item.index)}
      className={`aspect-square squircle-element cursor-pointer transition-all bg-cover bg-center border overflow-hidden relative ${isSelected
        ? "ring-2 ring-foreground/80 border-border shadow-md shadow-black/50"
        : "border-border hover:border-muted-foreground/50 hover:ring-1 ring-foreground/20"
        }`}
      aria-label={item.filename}
      aria-pressed={isSelected}
    >
      <img
        src={item.previewUrl}
        alt={item.filename}
        decoding="async"
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        className={`w-full h-full object-cover transition-all duration-500 ease-out ${isLoaded ? "opacity-100 blur-none scale-100" : "opacity-0 blur-sm scale-105"
          }`}
      />
    </button>
  );
}