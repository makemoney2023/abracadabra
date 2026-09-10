"use client";

import { Icon } from "@iconify/react";
import { ReactNode, forwardRef, useState, useRef } from "react";
import {
    Popover,
    PopoverTrigger,
    PopoverContent,
} from "@/components/ui/popover";

interface PopoverConfig {
    title: string;
    description: string;
    videoSrc?: string;
}

interface SidebarToolProps {
    icon: string | ReactNode;
    label?: string;
    isActive?: boolean;
    onClick?: () => void;
    badge?: string;
    badgeStyle?: "default" | "premium";
    badgeCount?: number;
    disabled?: boolean;
    popover?: PopoverConfig;
}

export const SidebarTool = forwardRef<HTMLButtonElement, SidebarToolProps>(
    ({ icon, label, isActive, onClick, badge, badgeStyle, badgeCount, disabled, popover }, ref) => {
        const [isOpen, setIsOpen] = useState(false);
        const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

        const handleMouseEnter = () => {
            if (disabled) return;
            clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                setIsOpen(true);
            }, 700);
        };

        const handleMouseLeave = () => {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = setTimeout(() => {
                setIsOpen(false);
            }, 150);
        };

        const ToolButton = (
            <button
                ref={ref}
                onClick={disabled ? undefined : onClick}
                disabled={disabled}
                className={`relative flex flex-col items-center gap-1.5 transition-all duration-200 w-full ${disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer"
                    } ${isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}
            >
                {badgeCount !== undefined && badgeCount > 0 && (
                    <div className="absolute -top-1 right-1 z-10 pointer-events-none animate-in zoom-in-50 duration-200">
                        <div className="min-w-4 h-4 px-1 flex items-center justify-center bg-emerald-500 rounded-full border border-emerald-400 shadow-lg animate-badge-blink">
                            <span className="text-[9px] font-bold text-white leading-none">
                                {badgeCount > 9 ? "9+" : badgeCount}
                            </span>
                        </div>
                    </div>
                )}
                {badge && (
                    <div
                        className={`absolute -top-1 -right-0.5 z-10 pointer-events-none select-none flex items-center justify-center min-w-[42px] ${badgeStyle === "premium"
                            ? "px-1 py-[3px] rounded-full border border-rose-400/40 shadow-[0_0_20px_rgba(244,63,94,0.3)] bg-gradient-to-r from-violet-600 via-pink-600 to-amber-500"
                            : "px-1.5 py-0.5 rounded-full border border-white/20 shadow-lg bg-linear-to-r from-gray-500 to-gray-500"
                            }`}
                    >
                        <span
                            className={`block font-bold uppercase leading-none text-center ${badgeStyle === "premium"
                                ? "text-[8.5px] font-black text-white tracking-[0.2em] pl-[0.2em] drop-shadow-[0_1.5px_2px_rgba(0,0,0,0.6)]"
                                : "text-[8px] text-white tracking-[0.18em] pl-[0.18em] drop-shadow-sm"
                                }`}
                        >
                            {badge}
                        </span>
                    </div>
                )}
                {isActive && !disabled && (
                    <div className="absolute inset-x-0 top-0 h-px bg-linear-to-r from-transparent via-foreground/20 to-transparent mx-2" />
                )}
                <span
                    className={`flex items-center justify-center p-3 squircle-element transition-all duration-200 relative ${!disabled && isActive ? "text-white" : "hover:bg-muted"
                        } `}
                    style={
                        isActive && !disabled
                            ? {
                                background:
                                    "radial-gradient(circle at 50% 0%, #555555 0%, #454545 64%)",
                                boxShadow:
                                    "inset 0 1.01rem 0.2rem -1rem #fff, 0 0 0 1px #fff4, 0 4px 4px 0 #0004, 0 0 0 1px #333",
                            }
                            : {}
                    }
                >
                    <div
                        className={`transition-transform duration-300 ${isActive && !disabled ? "scale-110" : !disabled ? "hover:scale-105" : ""
                            }`}
                    >
                        {typeof icon === "string" ? (
                            <Icon icon={icon} width="20" aria-hidden="true" />
                        ) : (
                            <div className="w-5 h-5 flex items-center justify-center">{icon}</div>
                        )}
                    </div>
                    {isActive && !disabled && (
                        <div className="absolute left-1 w-8 h-2 top-1/5 -translate-y-1/2 size-3 bg-white rounded-full blur-[5px] rotate-45 opacity-50" />
                    )}
                </span>
                {label && (
                    <label
                        className={`text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis max-w-full ${disabled ? "cursor-not-allowed" : "cursor-pointer"
                            }`}
                    >
                        {label}
                    </label>
                )}
            </button>
        );

        if (!popover || disabled) {
            return ToolButton;
        }

        return (
            <Popover open={isOpen} onOpenChange={setIsOpen}>
                <PopoverTrigger asChild>
                    <div
                        onMouseEnter={handleMouseEnter}
                        onMouseLeave={handleMouseLeave}
                        onClick={(e) => e.preventDefault()}
                        className="w-full flex justify-center"
                    >
                        {ToolButton}
                    </div>
                </PopoverTrigger>
                <PopoverContent
                    side="right"
                    sideOffset={16}
                    className="w-85 p-0 bg-[#09090B] border border-white/20 squircle-element-camera shadow-2xl overflow-hidden group/popover"
                >
                    <div className="relative w-full aspect-3/4 flex flex-col justify-end overflow-hidden bg-[#0c0c0e]">
                        <div className="absolute inset-0 z-0">
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(6,182,212,0.4)_0%,transparent_65%)] mix-blend-screen" />
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_70%,rgba(147,51,234,0.15)_0%,transparent_60%)]" />
                        </div>
                        {isOpen && (
                            <video
                                src={popover.videoSrc}
                                poster="/images/pages/thumbnail-popover.avif"
                                autoPlay
                                loop
                                muted
                                playsInline
                                className="absolute inset-0 w-full h-full object-cover mask-b-to-20% mask-b-from-80% z-10"
                                aria-hidden="true"
                            />
                        )}
                        <div className="absolute inset-0 z-20 bg-linear-to-t from-[#09090B] via-[#09090B]/50 to-transparent pointer-events-none" />
                        <div className="relative z-30 p-5">
                            <h3 className="text-sm font-bold text-white mb-1 drop-shadow-[0px_0px_15px_rgba(183,203,248,1)] drop-shadow-[0px_0px_2px_rgba(0,0,0,0.5)]">
                                {popover.title}
                            </h3>
                            <p className="text-[11px] text-cyan-50/60 leading-relaxed drop-shadow-md">
                                {popover.description}
                            </p>
                        </div>
                        <div className="absolute top-0 inset-x-0 h-px bg-linear-to-r from-transparent via-cyan-400/80 to-transparent z-40" />
                    </div>
                </PopoverContent>
            </Popover>
        );
    }
);

SidebarTool.displayName = "SidebarTool";