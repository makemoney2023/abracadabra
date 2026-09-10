"use client";

import { Icon } from "@iconify/react";
import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import { useTranslations } from "next-intl";
import type { BackgroundColorConfig, GradientConfig, ColorStop, GradientType } from "@/types";
import {
    gradientToCss,
    PRESET_SOLID_COLORS,
    PRESET_LINEAR_GRADIENTS,
    PRESET_RADIAL_GRADIENTS,
    PRESET_CONIC_GRADIENTS
} from "@/types";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TooltipAction } from "@/components/ui/tooltip-action";

interface BackgroundColorEditorProps {
    value: BackgroundColorConfig | null;
    onChange: (config: BackgroundColorConfig) => void;
}

let stopIdCounter = 0;
function generateStopId() {
    return `stop-${Date.now()}-${stopIdCounter++}`;
}

function ensureStopIds(stops: ColorStop[]): ColorStop[] {
    return stops.map(stop => ({ ...stop, id: stop.id || generateStopId() }));
}

interface SortableStopListProps {
    stops: ColorStop[];
    onReorder: (newStops: ColorStop[]) => void;
    onColorChange: (index: number, color: string) => void;
    onPositionChange: (index: number, position: number) => void;
    onRemove: (index: number) => void;
}

function SortableStopList({ stops, onReorder, onColorChange, onPositionChange, onRemove }: SortableStopListProps) {
    const listRef = useRef<HTMLDivElement>(null);
    const ghostRef = useRef<HTMLDivElement | null>(null);
    const indicatorRef = useRef<HTMLDivElement | null>(null);
    const dragIdxRef = useRef<number>(-1);
    const overIdxRef = useRef<number>(-1);
    const originalRectsRef = useRef<{ top: number; bottom: number; mid: number }[]>([]);
    const offsetRef = useRef({ x: 0, y: 0 });
    const itemHeightRef = useRef(0);
    const stopsRef = useRef(stops);

    useEffect(() => { stopsRef.current = stops; }, [stops]);
    const onReorderRef = useRef(onReorder);
    useEffect(() => { onReorderRef.current = onReorder; }, [onReorder]);

    const getItemEls = () => listRef.current ? Array.from(listRef.current.querySelectorAll<HTMLElement>("[data-drag-row]")) : [];

    const applyVisuals = (dragIdx: number, overIdx: number) => {
        const items = getItemEls();
        const h = itemHeightRef.current;
        items.forEach((el, i) => {
            if (i === dragIdx) {
                el.style.opacity = "0.2";
                el.style.transform = "none";
                return;
            }
            let shift = 0;
            if (dragIdx < overIdx) {
                if (i > dragIdx && i <= overIdx) shift = -h;
            } else if (dragIdx > overIdx) {
                if (i >= overIdx && i < dragIdx) shift = h;
            }
            el.style.transform = shift !== 0 ? `translateY(${shift}px)` : "none";
            el.style.opacity = "1";
        });

        if (indicatorRef.current && originalRectsRef.current[overIdx]) {
            const orig = originalRectsRef.current[overIdx];
            const listTop = listRef.current!.getBoundingClientRect().top;
            const lineY = dragIdx <= overIdx ? orig.bottom - listTop : orig.top - listTop;
            indicatorRef.current.style.top = `${lineY}px`;
            indicatorRef.current.style.opacity = "1";
        }
    };

    const resetVisuals = () => {
        getItemEls().forEach(el => {
            el.style.transform = "";
            el.style.opacity = "";
            el.style.transition = "";
        });
        if (indicatorRef.current) indicatorRef.current.style.opacity = "0";
    };

    const handlePointerDown = useCallback((e: React.PointerEvent<HTMLElement>, index: number) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        e.preventDefault();
        const rowEl = (e.currentTarget as HTMLElement).closest<HTMLElement>("[data-drag-row]");
        if (!rowEl) return;
        const items = getItemEls();
        originalRectsRef.current = items.map(el => {
            const r = el.getBoundingClientRect();
            return { top: r.top, bottom: r.bottom, mid: r.top + r.height / 2 };
        });
        const rect = rowEl.getBoundingClientRect();
        itemHeightRef.current = rect.height + 4;
        offsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        dragIdxRef.current = index;
        overIdxRef.current = index;
        const ghost = rowEl.cloneNode(true) as HTMLDivElement;
        Object.assign(ghost.style, {
            position: "fixed", pointerEvents: "none", zIndex: "9999",
            width: `${rect.width}px`, height: `${rect.height}px`, left: `${rect.left}px`, top: `${rect.top}px`,
            opacity: "0.93", transform: "scale(1.02) rotate(0.5deg)",
            boxShadow: "0 16px 48px rgba(0,0,0,0.8), 0 2px 8px rgba(0,0,0,0.5)",
            borderRadius: "8px", background: "var(--popover)", border: "1px solid var(--border)", willChange: "left,top",
        });
        document.body.appendChild(ghost);
        ghostRef.current = ghost;
        const indicator = document.createElement("div");
        Object.assign(indicator.style, {
            position: "absolute", left: "0", right: "0", height: "2px",
            background: "linear-gradient(90deg,transparent 0%,#6366f1 20%,#818cf8 80%,transparent 100%)",
            borderRadius: "2px", opacity: "0", transition: "top 80ms cubic-bezier(0.25,0.46,0.45,0.94), opacity 60ms ease",
            zIndex: "10", pointerEvents: "none", marginTop: "-1px",
        });
        if (listRef.current) {
            listRef.current.style.position = "relative";
            listRef.current.appendChild(indicator);
        }
        indicatorRef.current = indicator;
        items.forEach(el => { el.style.transition = "transform 160ms cubic-bezier(0.25,0.46,0.45,0.94), opacity 120ms ease"; });
        applyVisuals(index, index);

        const onMove = (mv: PointerEvent) => {
            ghost.style.left = `${mv.clientX - offsetRef.current.x}px`;
            ghost.style.top = `${mv.clientY - offsetRef.current.y}px`;
            const origs = originalRectsRef.current;
            let newOver = 0;
            for (let i = 0; i < origs.length; i++) { if (mv.clientY > origs[i].mid) newOver = i; }
            newOver = Math.max(0, Math.min(stopsRef.current.length - 1, newOver));
            if (newOver !== overIdxRef.current) {
                overIdxRef.current = newOver;
                applyVisuals(dragIdxRef.current, newOver);
            }
        };
        const onUp = () => {
            document.removeEventListener("pointermove", onMove);
            document.removeEventListener("pointerup", onUp);
            ghost.remove(); ghostRef.current = null;
            indicator.remove(); indicatorRef.current = null;
            const from = dragIdxRef.current; const to = overIdxRef.current;
            if (from !== to) {
                const items2 = getItemEls();
                items2.forEach(el => { el.style.transition = "none"; el.style.transform = ""; el.style.opacity = ""; });
                const cur = stopsRef.current; const next = [...cur];
                const [moved] = next.splice(from, 1); next.splice(to, 0, moved);
                const sortedPositions = [...cur].map(s => s.position).sort((a, b) => a - b);
                const reordered = next.map((stop, i) => ({ ...stop, position: sortedPositions[i] }));
                onReorderRef.current(reordered);
            } else { resetVisuals(); }
            dragIdxRef.current = -1; overIdxRef.current = -1;
        };
        document.addEventListener("pointermove", onMove);
        document.addEventListener("pointerup", onUp);
    }, []);

    return (
        <>
            <style>{` [data-drag-row] { will-change: transform; } `}</style>
            <div ref={listRef} className="space-y-1">
                {stops.map((stop, index) => (
                    <div key={stop.id} data-drag-row>
                        <div className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-muted/50 hover:bg-muted group/row" style={{ transition: "background 150ms" }}>
                            <div onPointerDown={(e) => handlePointerDown(e, index)} className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors touch-none select-none flex-shrink-0" >
                                <Icon icon="icon-park-outline:drag" width="14" />
                            </div>
                            <div className="group/sw w-7 h-7 rounded-md border border-border shrink-0 relative overflow-hidden">
                                <div className="w-full h-full" style={{ backgroundColor: stop.color }} />
                                <input type="color" value={stop.color} onChange={(e) => onColorChange(index, e.target.value)} className="absolute inset-0 opacity-0 cursor-pointer z-10 w-full h-full" />
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none bg-black/0 group-hover/sw:bg-black/20 transition-colors">
                                    <Icon icon="mdi:eyedropper" className="text-white opacity-0 group-hover/sw:opacity-70 mix-blend-difference transition-opacity" width="11" />
                                </div>
                            </div>
                            <div className="flex-1 min-w-0 space-y-0.5">
                                <div className="text-[9px] font-mono text-muted-foreground/50 uppercase">{stop.color}</div>
                                <input type="range" min="0" max="100" value={stop.position} onChange={(e) => onPositionChange(index, parseInt(e.target.value))} className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground/70" />
                            </div>
                            <div className="text-[9px] font-mono text-muted-foreground/50 w-7 text-right flex-shrink-0">{stop.position}%</div>
                            {stops.length > 2 && (
                                <button onClick={() => onRemove(index)} className="text-muted-foreground/40 hover:text-red-600 dark:hover:text-red-400/80 transition-colors flex-shrink-0 p-0.5 rounded" >
                                    <Icon icon="mdi:close" width="13" />
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </>
    );
}

export function BackgroundColorEditor({ value, onChange }: BackgroundColorEditorProps) {
    const t = useTranslations("colorEditor");
    const [mode, setMode] = useState<"solid" | "gradient">(
        value?.type === "solid" ? "solid" : "gradient"
    );
    const [copied, setCopied] = useState(false);

    const currentSolidColor = value?.type === "solid" ? value.config.color : PRESET_SOLID_COLORS[0];

    const currentGradient: GradientConfig = useMemo(() => {
        if (value?.type === "gradient") {
            return { ...value.config, stops: ensureStopIds(value.config.stops) };
        }
        return { ...PRESET_LINEAR_GRADIENTS[0], stops: ensureStopIds(PRESET_LINEAR_GRADIENTS[0].stops) };
    }, [value]);

    const currentPresetGradients = useMemo(() => {
        switch (currentGradient.type) {
            case "radial": return PRESET_RADIAL_GRADIENTS;
            case "conic": return PRESET_CONIC_GRADIENTS;
            default: return PRESET_LINEAR_GRADIENTS;
        }
    }, [currentGradient.type]);

    useEffect(() => {
        if (!value) onChange({ type: "gradient", config: PRESET_LINEAR_GRADIENTS[0] });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSolidColorSelect = (color: string) => onChange({ type: "solid", config: { color } });
    const handleSolidColorChange = (color: string) => onChange({ type: "solid", config: { color } });

    const handleCopy = () => {
        navigator.clipboard.writeText(currentSolidColor);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleGradientSelect = (gradient: GradientConfig) => {
        onChange({
            type: "gradient",
            config: {
                ...gradient,
                type: currentGradient.type,
                angle: currentGradient.type === "linear" ? (gradient.angle ?? 135) : currentGradient.type === "conic" ? (gradient.angle ?? 0) : undefined,
                stops: ensureStopIds(gradient.stops),
            },
        });
    };

    const handleGradientTypeChange = (type: GradientType) => {
        const newConfig = { ...currentGradient, type };
        if (type === "linear") newConfig.angle = currentGradient.angle ?? 135;
        else if (type === "conic") {
            newConfig.angle = currentGradient.angle ?? 180;
            newConfig.originX = currentGradient.originX ?? 0;
            newConfig.originY = currentGradient.originY ?? 53;
        } else {
            delete newConfig.angle; delete newConfig.originX; delete newConfig.originY;
        }
        onChange({ type: "gradient", config: newConfig });
    };

    const handleStopColorChange = (index: number, color: string) => {
        const newStops = [...currentGradient.stops];
        newStops[index] = { ...newStops[index], color };
        onChange({ type: "gradient", config: { ...currentGradient, stops: newStops } });
    };

    const handleStopPositionChange = (index: number, position: number) => {
        const newStops = [...currentGradient.stops];
        newStops[index] = { ...newStops[index], position };
        onChange({ type: "gradient", config: { ...currentGradient, stops: newStops } });
    };

    const handleAddStop = () => {
        if (currentGradient.stops.length >= 5) return;
        const newStop: ColorStop = { id: generateStopId(), color: "#ffffff", position: 50 };
        const newStops = [...currentGradient.stops, newStop].sort((a, b) => a.position - b.position);
        onChange({ type: "gradient", config: { ...currentGradient, stops: newStops } });
    };

    const handleRemoveStop = (index: number) => {
        if (currentGradient.stops.length <= 2) return;
        const newStops = currentGradient.stops.filter((_, i) => i !== index);
        onChange({ type: "gradient", config: { ...currentGradient, stops: newStops } });
    };

    const handleReorder = (newStops: ColorStop[]) => {
        onChange({ type: "gradient", config: { ...currentGradient, stops: newStops } });
    };

    return (
        <div className="space-y-6">
            <div className="flex bg-muted squircle-element p-1 text-xs font-medium">
                <button
                    className={`flex-1 py-1.5 rounded transition ${mode === "gradient" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => { setMode("gradient"); onChange({ type: "gradient", config: currentGradient }); }}
                    aria-pressed={mode === "gradient"}
                >
                    {t("modes.gradient")}
                </button>
                <button
                    className={`flex-1 py-1.5 rounded transition ${mode === "solid" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                    onClick={() => { setMode("solid"); onChange({ type: "solid", config: { color: currentSolidColor } }); }}
                    aria-pressed={mode === "solid"}
                >
                    {t("modes.solid")}
                </button>
            </div>

            {mode === "solid" && (
                <div className="space-y-4">
                    <div>
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold mb-3">{t("sections.presets")}</div>
                        <div className="grid grid-cols-6 gap-2">
                            {PRESET_SOLID_COLORS.slice(0, 23).map((color) => (
                                <button
                                    key={color}
                                    className={`aspect-square squircle-element cursor-pointer hover:ring-2 transition border shadow-sm ${value?.type === "solid" && value.config.color === color ? "ring-2 ring-foreground/80 shadow-lg shadow-foreground/20" : "border-border ring-foreground/60"}`}
                                    style={{ backgroundColor: color }}
                                    onClick={() => handleSolidColorSelect(color)}
                                    aria-label={`Select color ${color}`}
                                    aria-pressed={value?.type === "solid" && value.config.color === color}
                                />
                            ))}
                            <Popover>
                                <TooltipAction label={t("tooltips.moreColors")}>
                                    <PopoverTrigger asChild>
                                        <button className="aspect-square squircle-element border border-dashed border-border bg-muted flex items-center justify-center hover:bg-muted transition group" aria-label={t("tooltips.moreColors")}>
                                            <Icon icon="ph:plus-bold" width="16" className="text-blue-600 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors" aria-hidden="true" />
                                        </button>
                                    </PopoverTrigger>
                                </TooltipAction>
                                <PopoverContent side="right" align="start" sideOffset={12} className="w-72 p-0 border-0 shadow-2xl">
                                    <div className="flex flex-col bg-popover dark:bg-black border border-border squircle-element-camera overflow-hidden shadow-2xl">
                                        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40">
                                            <Icon icon="mdi:palette" width="14" className="text-muted-foreground" aria-hidden="true" />
                                            <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">{t("sections.moreColors")}</span>
                                            <span className="ml-auto text-[11px] text-muted-foreground">{PRESET_SOLID_COLORS.length} total</span>
                                        </div>
                                        <div className="p-3 grid grid-cols-6 gap-2 max-h-80 overflow-y-auto custom-scrollbar">
                                            {PRESET_SOLID_COLORS.slice(23).map((color, idx) => (
                                                <button
                                                    key={`extra-${idx}-${color}`}
                                                    className={`aspect-square squircle-element cursor-pointer hover:ring-2 transition border shadow-sm ${value?.type === "solid" && value.config.color === color ? "ring-2 ring-foreground/80 shadow-lg shadow-foreground/20" : "border-border ring-foreground/60"}`}
                                                    style={{ backgroundColor: color }}
                                                    onClick={() => handleSolidColorSelect(color)}
                                                    aria-label={`Select color ${color}`}
                                                    aria-pressed={value?.type === "solid" && value.config.color === color}
                                                />
                                            ))}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="bg-muted squircle-element border border-border p-3 space-y-3">
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">{t("sections.customize")}</div>
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 squircle-element border border-border shadow-lg shrink-0 relative overflow-hidden group">
                                <div className="w-full h-full" style={{ backgroundColor: currentSolidColor }} />
                                <input type="color" value={currentSolidColor} onChange={(e) => handleSolidColorChange(e.target.value)} className="absolute inset-0 cursor-pointer opacity-0 z-10" aria-label={t("sections.customize")} />
                                <Icon icon="mdi:eyedropper" className="absolute inset-0 m-auto text-white mix-blend-difference pointer-events-none" width="20"aria-hidden="true" />
                            </div>
                            <div className="flex-1 bg-muted border border-border squircle-element px-3 py-2.5 flex items-center justify-between transition-colors hover:border-border">
                                <span className="text-sm font-mono text-foreground/80 uppercase tracking-tight">{currentSolidColor}</span>
                                <button onClick={handleCopy} className={`transition-all duration-200 ${copied ? "text-green-600 dark:text-green-400" : "text-muted-foreground/40 hover:text-muted-foreground"}`} aria-label={copied ? "Copied" : "Copy color code"}>
                                    {copied ? <Icon icon="line-md:check-all" width="14" aria-hidden="true" /> : <Icon icon="mdi:content-copy" width="14" aria-hidden="true" />}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {mode === "gradient" && (
                <div className="space-y-4">
                    <div>
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold mb-3">{t("sections.presets")}</div>
                        <div className="grid grid-cols-6 gap-2">
                            {currentPresetGradients.slice(0, 23).map((gradient, i) => {
                                const gradientCss = gradientToCss(gradient);
                                const isSelected = value?.type === "gradient" && gradientCss === gradientToCss(value.config);
                                return (
                                    <button
                                        key={i}
                                        onClick={() => handleGradientSelect(gradient)}
                                        style={{ background: gradientCss }}
                                        className={`aspect-square squircle-element cursor-pointer transition-all duration-200 border shadow-sm hover:scale-105 active:scale-95 ${isSelected ? "ring-2 ring-foreground/80 shadow-lg shadow-foreground/20" : "border-border ring-foreground/60"}`}
                                        aria-label={`Select ${currentGradient.type} gradient preset ${i + 1}`}
                                        aria-pressed={isSelected}
                                    />
                                );
                            })}
                            <Popover>
                                <TooltipAction label={t("tooltips.moreGradients")}>
                                    <PopoverTrigger asChild>
                                        <button className="aspect-square squircle-element border border-dashed border-border bg-muted flex items-center justify-center hover:bg-muted transition group" aria-label={t("tooltips.moreGradients")}>
                                            <Icon icon="ph:plus-bold" width="16" className="text-blue-600 dark:text-blue-400 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors" aria-hidden="true" />
                                        </button>
                                    </PopoverTrigger>
                                </TooltipAction>
                                <PopoverContent side="right" align="start" sideOffset={12} className="w-72 p-0 border-0 shadow-2xl">
                                    <div className="flex flex-col bg-popover dark:bg-black border border-border squircle-element-camera overflow-hidden shadow-2xl">
                                        <div className="flex items-center gap-2 px-4 py-3 border-b border-border bg-muted/40">
                                            <Icon icon="mdi:gradient-horizontal" width="14" className="text-muted-foreground" aria-hidden="true" />
                                            <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground">
                                                {t("sections.moreGradients", { type: t(`types.${currentGradient.type}`) })}
                                            </span>
                                            <span className="ml-auto text-[11px] text-muted-foreground">{currentPresetGradients.length} total</span>
                                        </div>
                                        <div className="p-3 grid grid-cols-6 gap-2 max-h-80 overflow-y-auto custom-scrollbar">
                                            {currentPresetGradients.slice(23).map((gradient, i) => {
                                                const gradientCss = gradientToCss(gradient);
                                                const isSelected = value?.type === "gradient" && gradientCss === gradientToCss(value.config);
                                                return (
                                                    <button
                                                        key={`extra-gradient-${i}`}
                                                        onClick={() => handleGradientSelect(gradient)}
                                                        style={{ background: gradientCss }}
                                                        className={`aspect-square squircle-element cursor-pointer transition-all duration-200 border shadow-sm hover:scale-105 active:scale-95 ${isSelected ? "ring-2 ring-foreground/80 shadow-lg shadow-foreground/20" : "border-border ring-foreground/60"}`}
                                                        aria-label={`Select ${currentGradient.type} gradient preset ${i + 24}`}
                                                        aria-pressed={isSelected}
                                                    />
                                                );
                                            })}
                                        </div>
                                    </div>
                                </PopoverContent>
                            </Popover>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-bold">{t("sections.customize")}</div>
                        <div className="space-y-2">
                            <div className="text-[11px] text-muted-foreground font-medium">{t("sections.type")}</div>
                            <div className="flex gap-2">
                                {((["linear", "radial", "conic"] as GradientType[]).map((type) => (
                                    <button
                                        key={type}
                                        className={`flex-1 py-2 flex items-center justify-center gap-1.5 squircle-element text-xs font-medium transition ${currentGradient.type === type ? "bg-background text-foreground border border-border shadow-xs" : "bg-muted/60 text-muted-foreground hover:bg-muted"}`}
                                        onClick={() => handleGradientTypeChange(type)}
                                        aria-pressed={currentGradient.type === type}
                                    >
                                        <Icon icon={type === "linear" ? "mdi:gradient-horizontal" : type === "radial" ? "mdi:blur-radial" : "solar:pie-chart-bold"} width="16" aria-hidden="true" />
                                        <span className="capitalize">{t(`types.${type}`)}</span>
                                    </button>
                                )))}
                            </div>
                        </div>

                        {(currentGradient.type === "linear" || currentGradient.type === "conic") && (
                            <div className="space-y-2">
                                <div className="flex justify-between items-center text-[11px] text-muted-foreground font-medium">
                                    <div className="flex items-center gap-1.5"><Icon icon="mdi:rotate-right" width="14" aria-hidden="true" /><span>{t("sections.angle")}</span></div>
                                    <span className="font-mono text-muted-foreground px-2 py-0.5 rounded">{currentGradient.angle ?? (currentGradient.type === "conic" ? 0 : 135)}°</span>
                                </div>
                                <input
                                    type="range" min="0" max="360"
                                    value={currentGradient.angle ?? (currentGradient.type === "conic" ? 0 : 135)}
                                    onChange={(e) => onChange({ type: "gradient", config: { ...currentGradient, angle: parseInt(e.target.value) } })}
                                    className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground/70"
                                    aria-label={`${t("sections.angle")}: ${currentGradient.angle ?? (currentGradient.type === "conic" ? 0 : 135)} degrees`}
                                />
                            </div>
                        )}

                        {currentGradient.type === "conic" && (
                            <div className="space-y-3">
                                {(["X", "Y"] as const).map((axis) => {
                                    const key = axis === "X" ? "originX" : "originY";
                                    const val = currentGradient[key] ?? 50;
                                    return (
                                        <div key={axis} className="space-y-2">
                                            <div className="flex justify-between items-center text-[11px] text-muted-foreground font-medium">
                                                <div className="flex items-center gap-1.5">
                                                    <Icon icon={axis === "X" ? "mdi:arrow-left-right" : "mdi:arrow-up-down"} width="14" aria-hidden="true" />
                                                    <span>{t(`sections.origin${axis}`)}</span>
                                                </div>
                                                <span className="font-mono text-muted-foreground px-2 py-0.5 rounded">{val}%</span>
                                            </div>
                                            <input
                                                type="range" min="0" max="100" value={val}
                                                onChange={(e) => onChange({ type: "gradient", config: { ...currentGradient, [key]: parseInt(e.target.value) } })}
                                                className="w-full h-1.5 bg-muted rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground/70"
                                                aria-label={`${t(`sections.origin${axis}`)}: ${val} percent`}
                                            />
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <div className="text-[11px] text-muted-foreground font-medium">
                                    {t("sections.stops", { count: currentGradient.stops.length })}
                                </div>
                                {currentGradient.stops.length < 5 && (
                                    <button onClick={handleAddStop} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors" aria-label={t("sections.add")}>
                                        <Icon icon="mdi:plus" width="12" aria-hidden="true" />{t("sections.add")}
                                    </button>
                                )}
                            </div>
                            <SortableStopList
                                stops={currentGradient.stops}
                                onReorder={handleReorder}
                                onColorChange={handleStopColorChange}
                                onPositionChange={handleStopPositionChange}
                                onRemove={handleRemoveStop}
                            />
                        </div>

                        <div className="pt-2">
                            <div className="w-full h-20 squircle-element border border-border" style={{ background: gradientToCss(currentGradient) }} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}