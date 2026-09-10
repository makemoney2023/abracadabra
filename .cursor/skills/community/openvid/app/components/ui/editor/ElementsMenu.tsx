"use client";

import { Icon } from "@iconify/react";
import { useState, useEffect, useRef, startTransition, useCallback, useLayoutEffect } from "react";
import { useTranslations } from "next-intl";
import { SliderControl } from "../../../../components/ui/SliderControl";
import { SVG_CATEGORIES, IMAGE_CATEGORIES, PINNED_SVG_ITEMS, PINNED_IMAGE_ITEMS, getImagePreviewPath } from "@/lib/canvas-elements.config";
import { SvgElement, TextElement, ImageElement, ElementsMenuProps, PRESET_COLORS, TEXT_PRESETS, FONT_FAMILIES, FONT_WEIGHTS, ACCEPTED_FORMATS, MAX_FILE_SIZE } from "@/types/canvas-elements.types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { SVG_COMPONENTS } from "@/components/canvas-svg";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { ProgressiveImg } from "@/components/ui/ProgressiveImg";
import { ElementsIcon } from "@/components/ui/ElementsIcon";

interface ExtendedElementsMenuProps extends ElementsMenuProps {
    textTabTrigger?: number;
}

const DEFAULT_SHAPE_SIZE = 20;
const DEFAULT_IMAGE_SIZE = 30;

export function ElementsMenu({
    onAddElement,
    selectedElement,
    onUpdateElement,
    onDeleteElement,
    textTabTrigger = 0,
}: ExtendedElementsMenuProps) {
    const t = useTranslations("elementsMenu");

    const [mode, setMode] = useState<"text" | "elements">("elements");
    const [shapeColor, setShapeColor] = useState("#FFFFFF");
    const [shapeOpacity, setShapeOpacity] = useState(100);
    const [textContent, setTextContent] = useState("Texto");
    const [textFontSize, setTextFontSize] = useState(48);
    const [textColor, setTextColor] = useState("#FFFFFF");
    const [textOpacity, setTextOpacity] = useState(100);
    const [textFontFamily, setTextFontFamily] = useState("Inter");
    const [textFontWeight, setTextFontWeight] = useState<"normal" | "medium" | "bold">("bold");
    const [imageOpacity, setImageOpacity] = useState(100);
    const [selectedSvgCategory, setSelectedSvgCategory] = useState<string>("all");
    const [selectedImageCategory, setSelectedImageCategory] = useState<string>("all");
    const onUpdateElementRef = useRef(onUpdateElement);
    useLayoutEffect(() => {
        onUpdateElementRef.current = onUpdateElement;
    });

    const [isUploading, setIsUploading] = useState(false);
    const isSyncing = useRef(false);
    const lastSelectedId = useRef<string | null>(null);

    useEffect(() => {
        if (textTabTrigger > 0) {
            startTransition(() => {
                setMode("text");
            });
        }
    }, [textTabTrigger]);

    useEffect(() => {
        const currentId = selectedElement?.id || null;
        if (lastSelectedId.current === currentId) return;
        lastSelectedId.current = currentId;
        isSyncing.current = true;
        startTransition(() => {
            if (selectedElement) {
                if (selectedElement.type === "svg") {
                    setShapeColor(selectedElement.color || "#FFFFFF");
                    setShapeOpacity(Math.round(selectedElement.opacity * 100));
                    setMode("elements");
                } else if (selectedElement.type === "image") {
                    setImageOpacity(Math.round(selectedElement.opacity * 100));
                    setMode("elements");
                } else if (selectedElement.type === "text") {
                    setTextContent(selectedElement.content);
                    setTextFontSize(selectedElement.fontSize);
                    setTextColor(selectedElement.color);
                    setTextOpacity(Math.round(selectedElement.opacity * 100));
                    setTextFontFamily(selectedElement.fontFamily);
                    setTextFontWeight(selectedElement.fontWeight);
                    setMode("text");
                }
            } else {
                setShapeColor("#FFFFFF"); setShapeOpacity(100);
                setImageOpacity(100);
                setTextContent("Texto"); setTextFontSize(48); setTextColor("#FFFFFF");
                setTextOpacity(100); setTextFontFamily("Inter"); setTextFontWeight("bold");
            }
            setTimeout(() => { isSyncing.current = false; }, 0);
        });
    }, [selectedElement]);

    useEffect(() => {
        if (!isSyncing.current && selectedElement?.type === "svg") {
            onUpdateElementRef.current?.(selectedElement.id, {
                color: shapeColor, opacity: shapeOpacity / 100
            });
        }
    }, [shapeColor, shapeOpacity, selectedElement?.id, selectedElement?.type]);

    useEffect(() => {
        if (!isSyncing.current && selectedElement?.type === "image") {
            onUpdateElementRef.current?.(selectedElement.id, {
                opacity: imageOpacity / 100
            });
        }
    }, [imageOpacity, selectedElement?.id, selectedElement?.type]);

    useEffect(() => {
        if (!isSyncing.current && selectedElement?.type === "text") {
            onUpdateElementRef.current?.(selectedElement.id, {
                content: textContent, fontSize: textFontSize, color: textColor,
                opacity: textOpacity / 100, fontFamily: textFontFamily, fontWeight: textFontWeight
            });
        }
    }, [textContent, textFontSize, textColor, textOpacity, textFontFamily,
        textFontWeight, selectedElement?.id, selectedElement?.type]);

    const handleImageUpload = useCallback(async (files: FileList | null) => {
        if (!files || files.length === 0) return;
        setIsUploading(true);
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            if (!ACCEPTED_FORMATS.includes(file.type)) continue;
            if (file.size > MAX_FILE_SIZE) continue;
            try {
                const dataUrl = await new Promise<string>((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = () => resolve(reader.result as string);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                let width = DEFAULT_IMAGE_SIZE;
                let height = DEFAULT_IMAGE_SIZE;
                await new Promise<void>((resolve) => {
                    const img = new Image();
                    img.onload = () => {
                        if (img.naturalWidth && img.naturalHeight) {
                            const ar = img.naturalWidth / img.naturalHeight;
                            if (ar >= 1) { height = DEFAULT_IMAGE_SIZE / ar; } else { width = DEFAULT_IMAGE_SIZE * ar; }
                        }
                        resolve();
                    };
                    img.onerror = () => resolve();
                    img.src = dataUrl;
                });

                const timestamp = Date.now() + i;
                const newElement: ImageElement = {
                    id: `image-${timestamp}-${Math.random().toString(36).substring(2, 9)}`,
                    type: "image",
                    category: "uploads",
                    x: 50,
                    y: 50,
                    width,
                    height,
                    rotation: 0,
                    opacity: imageOpacity / 100,
                    zIndex: timestamp,
                    imagePath: dataUrl,
                };
                onAddElement(newElement);
            } catch (error) {
                console.error(`Error uploading ${file.name}:`, error);
            }
        }
        setIsUploading(false);
    }, [imageOpacity, onAddElement]);

    const filteredSvgItems = selectedSvgCategory === "all"
        ? SVG_CATEGORIES.flatMap(cat => cat.items.map(item => ({ ...item, category: cat.id })))
        : SVG_CATEGORIES.find(cat => cat.id === selectedSvgCategory)?.items.map(item => ({ ...item, category: selectedSvgCategory })) || [];

    const filteredImageItems = selectedImageCategory === "all"
        ? IMAGE_CATEGORIES.flatMap(cat => cat.items.map(item => ({ ...item, category: cat.id })))
        : IMAGE_CATEGORIES.find(cat => cat.id === selectedImageCategory)?.items.map(item => ({ ...item, category: selectedImageCategory })) || [];

    const handleAddSvg = useCallback((item: { id: string; name: string; icon?: string }, categoryId?: string) => {
        const timestamp = Date.now();
        const newElement: SvgElement = {
            id: `svg-${timestamp}-${Math.random().toString(36).substring(2, 9)}`,
            type: "svg", category: categoryId || "shapes", x: 50, y: 50,
            width: DEFAULT_SHAPE_SIZE, height: DEFAULT_SHAPE_SIZE, rotation: 0,
            opacity: shapeOpacity / 100, zIndex: timestamp, svgId: item.id, color: shapeColor,
        };
        onAddElement(newElement);
    }, [shapeOpacity, shapeColor, onAddElement]);

    const handleAddImage = useCallback(async (item: { id: string; name: string; imagePath: string }, categoryId?: string) => {
        const timestamp = Date.now();
        let width = DEFAULT_IMAGE_SIZE;
        let height = DEFAULT_IMAGE_SIZE;
        await new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = () => {
                if (img.naturalWidth && img.naturalHeight) {
                    const ar = img.naturalWidth / img.naturalHeight;
                    if (ar >= 1) { height = DEFAULT_IMAGE_SIZE / ar; }
                    else { width = DEFAULT_IMAGE_SIZE * ar; }
                }
                resolve();
            };
            img.onerror = () => resolve();
            img.src = item.imagePath;
        });
        const newElement: ImageElement = {
            id: `image-${timestamp}-${Math.random().toString(36).substring(2, 9)}`,
            type: "image", category: categoryId || "overlays", x: 50, y: 50,
            width, height, rotation: 0,
            opacity: imageOpacity / 100, zIndex: timestamp, imagePath: item.imagePath,
        };
        onAddElement(newElement);
    }, [imageOpacity, onAddElement]);

    return (
        <div className="p-4 flex flex-col gap-5">

            <div className="flex items-center gap-2 text-foreground font-medium">
                <ElementsIcon
                    width={20}
                    height={20}
                    className="transition-colors duration-200"
                    aria-hidden="true"
                />
                <span>{t("title")}</span>
            </div>

            <div className="grid grid-cols-2 bg-muted squircle-element p-1 text-xs font-medium border border-border" role="tablist" aria-label={t("title")}>
                <button className={`flex justify-center items-center gap-1.5 py-1.5 squircle-element transition ${mode === "elements" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground/80"}`} onClick={() => setMode("elements")} role="tab" aria-selected={mode === "elements"} aria-controls="elements-panel">
                    <Icon icon="iconoir:hexagon" width="14" aria-hidden="true" />
                    {t("tabs.elements")}
                </button>
                <button className={`flex justify-center items-center gap-1.5 py-1.5 squircle-element transition ${mode === "text" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground/80"}`} onClick={() => setMode("text")} role="tab" aria-selected={mode === "text"} aria-controls="text-panel">
                    <Icon icon="iconoir:text-size" width="14" aria-hidden="true" />
                    {t("tabs.text")}
                </button>
            </div>

            {mode === "elements" && (
                <div className="flex flex-col gap-5 animate-in fade-in duration-150" role="tabpanel" id="elements-panel">

                    <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{t("sections.shapes")}</div>
                        <div className="grid grid-cols-6 gap-2">
                            {PINNED_SVG_ITEMS.map((item) => (
                                <TooltipAction label={item.name} key={item.id}>
                                    <button onClick={() => handleAddSvg(item)} className="aspect-square bg-muted/50 hover:bg-muted border border-border hover:border-muted-foreground/50 squircle-element flex items-center justify-center transition-all active:scale-90 group" aria-label={`Add ${item.name}`}>
                                        {item.icon ? (
                                            <Icon icon={item.icon} width="18" className="text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden="true" />
                                        ) : (() => {
                                            const SvgComponent = SVG_COMPONENTS[item.id];
                                            return SvgComponent
                                                ? <SvgComponent color="currentColor" className="w-4 h-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                                                : <span className="text-[9px] text-muted-foreground/60">{item.name}</span>;
                                        })()}
                                    </button>
                                </TooltipAction>
                            ))}

                            <Popover>
                                <TooltipAction label={t("tooltips.allShapes")}>
                                    <PopoverTrigger asChild>
                                        <button className="aspect-square squircle-element border border-dashed border-border bg-muted flex items-center justify-center hover:bg-muted transition group">
                                            <Icon icon="ph:plus-bold" width="16" className="text-blue-600 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors" />
                                        </button>
                                    </PopoverTrigger>
                                </TooltipAction>
                                <PopoverContent side="right" align="start" sideOffset={12} className="w-120 p-0 border-0 shadow-2xl">
                                    <div className="flex flex-col bg-popover dark:bg-black border border-border squircle-element-camera overflow-hidden shadow-2xl max-h-125">
                                        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40 flex-wrap">
                                            <button onClick={() => setSelectedSvgCategory("all")} className={`flex items-center gap-1.5 px-3 py-1.5 squircle-element text-[11px] font-medium uppercase tracking-wider transition-all ${selectedSvgCategory === "all" ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/40" : "bg-muted text-muted-foreground hover:text-muted-foreground border border-transparent hover:border-border"}`}>
                                                <Icon icon="ph:grid-four-bold" width="12" />
                                                <span>{t("filters.all")}</span>
                                            </button>
                                            {SVG_CATEGORIES.map((cat) => (
                                                <button key={cat.id} onClick={() => setSelectedSvgCategory(cat.id)} className={`flex items-center gap-1.5 px-3 py-1.5 squircle-element text-[11px] font-medium uppercase tracking-wider transition-all ${selectedSvgCategory === cat.id ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/40" : "bg-muted text-muted-foreground hover:text-muted-foreground border border-transparent hover:border-border"}`}>
                                                    <span>{cat.title}</span>
                                                </button>
                                            ))}
                                            <span className="ml-auto text-[11px] text-muted-foreground">{t("counts.shapes", { count: filteredSvgItems.length })}</span>
                                        </div>
                                        <div className="p-3 grid grid-cols-6 gap-2 overflow-y-auto custom-scrollbar">
                                            {filteredSvgItems.map((item) => (
                                                <TooltipAction label={item.name} key={`${item.category}-${item.id}`}>
                                                    <button onClick={() => handleAddSvg(item, item.category)} className="aspect-square bg-muted/50 hover:bg-muted border border-border hover:border-muted-foreground/50 squircle-element flex items-center justify-center transition-all active:scale-90 group">
                                                        {item.icon ? (
                                                            <Icon icon={item.icon} width="18" className="text-muted-foreground group-hover:text-foreground transition-colors" />
                                                        ) : (() => {
                                                            const SvgComponent = SVG_COMPONENTS[item.id];
                                                            return SvgComponent
                                                                ? <SvgComponent color="currentColor" className="w-4 h-4 text-muted-foreground scale-200 group-hover:text-foreground transition-colors" />
                                                                : <span className="text-[9px] text-muted-foreground/60">{item.name}</span>;
                                                        })()}
                                                    </button>
                                                </TooltipAction>
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{t("sections.images")}</div>
                        <div className="grid grid-cols-6 gap-1.5">
                            <UploadImageButton onUpload={handleImageUpload} isUploading={isUploading} />
                            {PINNED_IMAGE_ITEMS.map((item) => (
                                <button key={item.id} onClick={() => handleAddImage(item)} className="aspect-square bg-muted/50 hover:bg-muted border border-border hover:border-muted-foreground/50 squircle-element flex items-center justify-center transition-all active:scale-90 overflow-hidden group">
                                    <ProgressiveImg src={getImagePreviewPath(item)} alt={item.name} className="w-full h-full object-cover group-hover:scale-110" />
                                </button>
                            ))}
                            {Array.from({ length: Math.max(0, 10 - PINNED_IMAGE_ITEMS.length) }).map((_, i) => (
                                <div key={`empty-${i}`} className="aspect-square" />
                            ))}
                            <Popover>
                                <TooltipAction label={t("tooltips.allImages")}>
                                    <PopoverTrigger asChild>
                                        <button className="aspect-square squircle-element border border-dashed border-border bg-muted flex items-center justify-center hover:bg-muted transition group">
                                            <Icon icon="ph:plus-bold" width="16" className="text-blue-600 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors" />
                                        </button>
                                    </PopoverTrigger>
                                </TooltipAction>
                                <PopoverContent side="right" align="start" sideOffset={12} className="w-130 p-0 border-0 shadow-2xl">
                                    <div className="flex flex-col bg-popover dark:bg-black border border-border squircle-element-camera overflow-hidden shadow-2xl max-h-125">
                                        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40 flex-wrap">
                                            <button onClick={() => setSelectedImageCategory("all")} className={`flex items-center gap-1.5 px-3 py-1.5 squircle-element text-[11px] font-medium uppercase tracking-wider transition-all ${selectedImageCategory === "all" ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/40" : "bg-muted text-muted-foreground hover:text-muted-foreground border border-transparent hover:border-border"}`}>
                                                <Icon icon="ph:grid-four-bold" width="12" />
                                                <span>{t("filters.all")}</span>
                                            </button>
                                            {IMAGE_CATEGORIES.map((cat) => (
                                                <button key={cat.id} onClick={() => setSelectedImageCategory(cat.id)} className={`flex items-center gap-1.5 px-3 py-1.5 squircle-element text-[11px] font-medium uppercase tracking-wider transition-all ${selectedImageCategory === cat.id ? "bg-blue-500/20 text-blue-600 dark:text-blue-400 border border-blue-500/40" : "bg-muted text-muted-foreground hover:text-muted-foreground border border-transparent hover:border-border"}`}>
                                                    <span>{cat.title}</span>
                                                </button>
                                            ))}
                                            <span className="ml-auto text-[11px] text-muted-foreground">{t("counts.images", { count: filteredImageItems.length })}</span>
                                        </div>
                                        <div className="p-3 grid grid-cols-8 gap-2 overflow-y-auto custom-scrollbar">
                                            {filteredImageItems.map((item) => (
                                                <div key={`${item.category}-${item.id}`} className="w-full" style={{ paddingBottom: "100%", position: "relative" }}>
                                                    <button
                                                        onClick={() => handleAddImage(item, item.category)}
                                                        className="absolute inset-0 bg-muted/50 hover:bg-muted border border-border hover:border-muted-foreground/50 squircle-element transition-all active:scale-90 overflow-hidden group"
                                                    >
                                                        <ProgressiveImg
                                                            src={getImagePreviewPath(item)}
                                                            alt={item.name}
                                                            className="w-full h-full object-contain group-hover:scale-110"
                                                        />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    {selectedElement && (selectedElement.type === "svg" || selectedElement.type === "image") && (
                        <>
                            {selectedElement.type === "svg" && (
                                <div className="space-y-2">
                                    <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{t("properties.color")}</div>
                                    <div className="flex gap-2">
                                        <div className="grid grid-cols-5 gap-2 flex-1">
                                            {PRESET_COLORS.map((color) => (
                                                <TooltipAction label={color} key={color}>
                                                    <button onClick={() => setShapeColor(color)} className={`aspect-square squircle-element cursor-pointer transition-all border border-border ${shapeColor === color ? "ring-2 ring-foreground/80 border-border shadow-md shadow-black/50" : "border-border hover:border-muted-foreground/50 hover:ring-1 ring-foreground/20"}`} style={{ backgroundColor: color }} />
                                                </TooltipAction>
                                            ))}
                                        </div>
                                        <label className="relative cursor-pointer">
                                            <input type="color" value={shapeColor} onChange={(e) => setShapeColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                                            <div className="w-10 h-10 aspect-square squircle-element border border-dashed border-border bg-muted flex items-center justify-center hover:bg-muted transition group" style={{ backgroundColor: shapeColor }}>
                                                <Icon icon="mdi:eyedropper" width="18" className="text-white mix-blend-difference" />
                                            </div>
                                        </label>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-3">
                                <SliderControl icon="mdi:opacity" label={t("properties.opacity")} value={selectedElement.type === "svg" ? shapeOpacity : imageOpacity} onChange={selectedElement.type === "svg" ? setShapeOpacity : setImageOpacity} />
                            </div>
                        </>
                    )}
                </div>
            )}

            {mode === "text" && (
                <div className="flex flex-col gap-5 animate-in fade-in duration-150">
                    <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{t("text.content")}</div>
                        <input type="text" value={textContent} onChange={(e) => setTextContent(e.target.value)} className="w-full bg-muted/60 hover:bg-muted/50 transition border border-border squircle-element px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground/40 outline-none focus:border-border" placeholder={t("text.placeholder")} />
                    </div>

                    <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{t("text.presets")}</div>
                        <div className="grid grid-cols-2 gap-2">
                            {TEXT_PRESETS.map((p) => (
                                <button key={p.label} onClick={() => { setTextFontSize(p.fontSize); setTextFontWeight(p.weight); }} className="bg-muted/50 hover:bg-muted/50 border border-border squircle-element px-3 py-2.5 text-left transition-all active:scale-[.98]">
                                    <div className="text-[9px] text-muted-foreground/60 font-semibold uppercase tracking-wider mb-1.5">{p.label}</div>
                                    <div className="text-foreground leading-none truncate" style={{ fontSize: `${p.fontSize / 3}px`, fontWeight: p.weight }}>{p.sample}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="flex flex-row justify-between gap-2 space-y-2">
                        <div className="space-y-2">
                            <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{t("text.size")}</div>
                            <div className="flex items-center gap-2">
                                <input type="number" value={textFontSize || ""} onChange={(e) => { const val = e.target.value; if (val === "") { setTextFontSize(0); return; } const num = parseInt(val, 10); if (!isNaN(num)) setTextFontSize(Math.min(200, num)); }} onBlur={() => setTextFontSize((prev) => Math.max(8, Math.min(200, prev || 32)))} className="flex-1 bg-muted/60 hover:bg-muted/50 transition border border-border squircle-element px-3 py-2 text-sm text-foreground outline-none focus:border-border" min={8} max={200} />
                                <span className="text-xs text-muted-foreground w-6">px</span>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{t("text.font")}</div>
                            <Select value={textFontFamily} onValueChange={setTextFontFamily}>
                                <SelectTrigger className="w-full bg-muted/60 hover:bg-muted/50 transition border-border squircle-element text-foreground/80" style={{ fontFamily: textFontFamily }}>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent className="bg-popover dark:bg-black border-border">
                                    {FONT_FAMILIES.map((f) => (
                                        <SelectItem key={f} value={f} className="text-foreground/80 hover:bg-muted cursor-pointer" style={{ fontFamily: f }}>{f}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{t("properties.color")}</div>
                        <div className="flex gap-2">
                            <div className="grid grid-cols-5 gap-2 flex-1">
                                {PRESET_COLORS.map((color) => (
                                    <TooltipAction label={color} key={color}>
                                        <button onClick={() => setTextColor(color)} className={`aspect-square squircle-element cursor-pointer transition-all border border-border ${textColor === color ? "ring-2 ring-foreground/80 border-border shadow-md shadow-black/50" : "border-border hover:border-muted-foreground/50 hover:ring-1 ring-foreground/20"}`} style={{ backgroundColor: color }} />
                                    </TooltipAction>
                                ))}
                            </div>
                            <label className="relative cursor-pointer">
                                <input type="color" value={textColor} onChange={(e) => setTextColor(e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer" />
                                <div className="w-10 h-10 aspect-square squircle-element border border-dashed border-border bg-muted flex items-center justify-center hover:bg-muted transition group" style={{ backgroundColor: textColor }}>
                                    <Icon icon="mdi:eyedropper" width="18" className="text-white mix-blend-difference" />
                                </div>
                            </label>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">{t("text.weight")}</div>
                        <div className="grid grid-cols-3 gap-2">
                            {FONT_WEIGHTS.map((w) => (
                                <button key={w.key} onClick={() => setTextFontWeight(w.key)} className={`px-3 py-2 squircle-element text-xs transition-all squircle-element ${textFontWeight === w.key ? "bg-muted text-foreground border border-border" : "bg-muted/50 text-muted-foreground/50 hover:text-muted-foreground border border-border"}`}>
                                    {w.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="space-y-3">
                        <SliderControl icon="mdi:opacity" label={t("properties.opacity")} value={textOpacity} onChange={setTextOpacity} />
                    </div>

                    <Button onClick={() => {
                        const timestamp = Date.now();
                        const newElement: TextElement = {
                            id: `text-${timestamp}-${Math.random().toString(36).substring(2, 9)}`,
                            type: "text", x: 50, y: 50, width: 0, height: 0, rotation: 0,
                            opacity: textOpacity / 100, zIndex: timestamp,
                            content: textContent, fontSize: textFontSize, color: textColor,
                            fontFamily: textFontFamily, fontWeight: textFontWeight,
                        };
                        onAddElement(newElement);
                    }} variant="outline" className="w-full text-xs">
                        <Icon icon="ph:plus-bold" width="16" />
                        {t("text.addButton")}
                    </Button>
                </div>
            )}

        </div>
    );
}


function UploadImageButton({ onUpload, isUploading }: { onUpload: (files: FileList | null) => void; isUploading: boolean }) {
    const t = useTranslations("elementsMenu");
    const inputRef = useRef<HTMLInputElement>(null);
    return (
        <>
            <input
                ref={inputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
                multiple
                className="hidden"
                onChange={(e) => {
                    onUpload(e.target.files);
                    e.target.value = "";
                }}
                aria-label={t("uploads.selectFile")}
            />
            <TooltipAction label={t("uploads.selectFile")}>
                <button
                    onClick={() => inputRef.current?.click()}
                    disabled={isUploading}
                    className="aspect-square bg-muted/50 hover:bg-muted border border-dashed border-border squircle-element flex items-center justify-center transition-all active:scale-90 group disabled:opacity-50"
                    aria-label={t("uploads.selectFile")}
                >
                    {isUploading ? (
                        <Icon icon="svg-spinners:180-ring-with-bg" width="16" className="text-muted-foreground" aria-hidden="true" />
                    ) : (
                        <Icon icon="material-symbols:upload-rounded" width="24" className="text-muted-foreground group-hover:text-foreground transition-colors" aria-hidden="true" />
                    )}
                </button>
            </TooltipAction>
        </>
    );
}