"use client";
import { useRef, useState, useEffect, useCallback, useMemo } from "react";

interface TickSliderControlProps {
    label: string;
    value: number;
    min?: number;
    max?: number;
    step?: number;     
    tickStep?: number; 
    suffix?: string;
    onChange?: (value: number) => void;
    onChangeEnd?: () => void;
}

export function TickSliderControl({
    label,
    value,
    min = 0.5,      
    max = 3,        
    step = 0.1,      
    tickStep = 0.5,  
    suffix = "x",
    onChange,
    onChangeEnd,
}: TickSliderControlProps) {
    const [isDragging, setIsDragging] = useState(false);
    
    const formatValue = useCallback((val: number) => {
        return parseFloat(val.toFixed(2)).toString();
    }, []);

    const [localInputValue, setLocalInputValue] = useState(formatValue(value));
    const sliderRef = useRef<HTMLDivElement>(null);

    const [prevValue, setPrevValue] = useState(value);
    if (value !== prevValue) {
        setPrevValue(value);
        setLocalInputValue(formatValue(value));
    }

    const updateValue = useCallback(
        (clientX: number) => {
            if (!sliderRef.current || !onChange) return;
            const rect = sliderRef.current.getBoundingClientRect();
            const percentage = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
            const rawValue = (percentage / 100) * (max - min) + min;
            const newValue = Math.round(rawValue / step) * step;
            onChange(Math.max(min, Math.min(max, parseFloat(newValue.toFixed(2)))));
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

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        if (/^[0-9]*\.?[0-9]*$/.test(val)) {
            setLocalInputValue(val);
        }
    };

    const applyInputValue = () => {
        let parsed = parseFloat(localInputValue);
        
        if (isNaN(parsed)) {
            setLocalInputValue(formatValue(value));
            return;
        }

        parsed = Math.max(min, Math.min(max, parsed));
        parsed = Math.round(parsed / step) * step;
        
        const finalValue = parseFloat(parsed.toFixed(2));
        
        setLocalInputValue(formatValue(finalValue));
        onChange?.(finalValue);
        onChangeEnd?.();
    };

    const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === "Enter") {
            applyInputValue();
            e.currentTarget.blur();
        }
    };

    const displayPercentage = Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));

    const ticks = useMemo(() => {
        const marks = [];
        const multiplier = 1000;
        const start = Math.round(min * multiplier);
        const end = Math.round(max * multiplier);
        const interval = Math.round(tickStep * multiplier);

        for (let i = start; i <= end; i += interval) {
            const currentVal = i / multiplier;
            marks.push(((currentVal - min) / (max - min)) * 100);
        }
        return marks;
    }, [min, max, tickStep]);

    return (
        <div className="flex w-full flex-col gap-3 select-none touch-none font-sans">
            <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-muted-foreground font-bold">
                {label}
            </span>

            <div className="flex items-center gap-6">
                <div
                    ref={sliderRef}
                    className="relative flex h-6 flex-1 cursor-pointer items-center"
                    onClick={handleClick}
                    onMouseDown={handleMouseDown}
                >
                    <div className="absolute left-0 right-0 h-[2px] bg-input rounded-full" />

                    {ticks.map((tickPosition, index) => (
                        <div
                            key={index}
                            className="absolute top-1/2 h-[6px] w-[2px] -translate-y-1/2 bg-muted-foreground/40 pointer-events-none"
                            style={{ left: `calc(${tickPosition}% - 1px)` }}
                        />
                    ))}

                    <div
                        className="absolute left-0 h-[2px] bg-foreground rounded-l-full transition-all duration-75 ease-out pointer-events-none"
                        style={{ width: `${displayPercentage}%` }}
                    />

                    <div
                        className="absolute top-1/2 h-3.5 w-3.5 -translate-y-1/2 rounded-full bg-foreground shadow-sm transition-all duration-75 ease-out pointer-events-none z-10"
                        style={{ left: `calc(${displayPercentage}% - 7px)` }}
                    />
                </div>

                <div className="flex items-center justify-between rounded-md bg-muted px-3 py-1.5 text-sm font-medium text-foreground w-[60px] focus-within:ring-1 focus-within:ring-ring/60 transition-shadow">
                    <input
                        type="text"
                        value={localInputValue}
                        onChange={handleInputChange}
                        onBlur={applyInputValue}
                        onKeyDown={handleInputKeyDown}
                        className="w-full bg-transparent outline-none p-0 text-foreground text-left font-mono"
                    />
                    {suffix && (
                        <span className="pointer-events-none select-none ml-0.5 text-muted-foreground font-mono">
                            {suffix}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
}