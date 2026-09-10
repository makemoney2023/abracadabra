"use client";
import { Icon } from "@iconify/react";
import { useRef, useState, useEffect, useCallback } from "react";

interface SliderControlProps {
    icon?: string;
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;
    suffix?: string;
    onChange?: (value: number) => void;
    onChangeEnd?: () => void;
}

export function SliderControl({
    icon,
    label,
    value,
    min = 0,
    max = 100,
    step = 1,
    suffix = "",
    onChange,
    onChangeEnd,
}: SliderControlProps) {
    const [isDragging, setIsDragging] = useState(false);
    const sliderRef = useRef<HTMLDivElement>(null);

    const updateValue = useCallback(
        (clientX: number) => {
            if (!sliderRef.current || !onChange) return;
            const rect = sliderRef.current.getBoundingClientRect();
            const percentage = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
            const rawValue = (percentage / 100) * (max - min) + min;
            const newValue = Math.round(rawValue / step) * step;
            onChange(Math.max(min, Math.min(max, parseFloat(newValue.toFixed(1)))));
        },
        [max, min, onChange, step]
    );

    const handleMouseDown = () => setIsDragging(true);

    const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
        updateValue(e.clientX);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleMouseMove = (e: MouseEvent) => {
            updateValue(e.clientX);
        };

        const handleMouseUp = () => {
            setIsDragging(false);
            onChangeEnd?.();
        };

        document.addEventListener("mousemove", handleMouseMove);
        document.addEventListener("mouseup", handleMouseUp);

        return () => {
            document.removeEventListener("mousemove", handleMouseMove);
            document.removeEventListener("mouseup", handleMouseUp);
        };
    }, [isDragging, updateValue, onChangeEnd]);

    const displayPercentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
    const displayValue = step < 1 ? value.toFixed(1) : value;

    return (
        <div
            ref={sliderRef}
            className="relative flex h-[35px] w-full cursor-pointer touch-none select-none items-center rounded-lg overflow-hidden border border-border"
            onClick={handleClick}
            onMouseDown={handleMouseDown}
        >
            <div
                className="absolute bottom-0 left-0 top-0 bg-primary/20 transition-all duration-75 ease-out"
                style={{ width: `${displayPercentage}%` }}
            />

            <div
                className="absolute top-[6px] bottom-[6px] w-[2px] rounded-full bg-foreground shadow-[0_0_4px_rgba(0,0,0,0.5)] transition-all duration-75 ease-out z-20"
                style={{ left: `calc(${displayPercentage}% - 1px)` }}
            />

            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-between px-3">
                <div className="flex items-center gap-2 text-[12px] font-medium text-muted-foreground">
                    {icon && <Icon icon={icon} width="16" />}
                    <span>{label}</span>
                </div>
                <span className="text-[12px] font-mono text-muted-foreground">
                    {displayValue}
                    {suffix}
                </span>
            </div>
        </div>
    );
}