"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@iconify/react";
import { motion, useMotionValue, PanInfo } from "framer-motion";
import { useTranslations } from "next-intl";

interface AudioTrimModalProps {
    isOpen: boolean;
    audioName: string;
    audioUrl: string;
    audioDuration: number;
    initialTrimStart?: number;
    initialTrimEnd?: number;
    onConfirm: (trimStart: number, trimEnd: number) => void;
    onCancel: () => void;
}

export function AudioTrimModal({
    isOpen,
    audioName,
    audioUrl,
    audioDuration,
    initialTrimStart = 0,
    initialTrimEnd,
    onConfirm,
    onCancel,
}: AudioTrimModalProps) {
    const t = useTranslations("audioTrimModal");
    const [trimStart, setTrimStart] = useState(initialTrimStart);
    const [trimEnd, setTrimEnd] = useState(initialTrimEnd ?? audioDuration);
    const [isDragging, setIsDragging] = useState(false);

    const trackRef = useRef<HTMLDivElement>(null);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const playbackTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isPlayingRef = useRef(false);

    const trimStartX = useMotionValue(0);
    const trimEndX = useMotionValue(0);

    const waveformHeights = useState(() =>
        Array.from({ length: 60 }, () => Math.random() * 60 + 20)
    )[0];
    const trimmedWaveformHeights = useState(() =>
        Array.from({ length: 40 }, () => Math.random() * 60 + 20)
    )[0];

    useEffect(() => {
        if (!isOpen || !audioUrl) return;
        const audio = new Audio(audioUrl);
        audioRef.current = audio;
        return () => {
            if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
            audio.pause();
            audio.src = '';
            audioRef.current = null;
            isPlayingRef.current = false;
        };
    }, [isOpen, audioUrl]);

    useEffect(() => {
        return () => {
            if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
        };
    }, []);

    const trackWidth = useCallback(() => {
        return trackRef.current?.getBoundingClientRect().width ?? 0;
    }, []);

    const timeToPixels = useCallback(
        (time: number) => {
            const w = trackWidth();
            if (!w) return 0;
            return (time / audioDuration) * w;
        },
        [audioDuration, trackWidth]
    );

    const pixelsToTime = useCallback(
        (pixels: number) => {
            const w = trackWidth();
            if (!w) return 0;
            return (pixels / w) * audioDuration;
        },
        [audioDuration, trackWidth]
    );

    const playPreviewFrom = useCallback((fromTime: number, previewDuration: number) => {
        const audio = audioRef.current;
        if (!audio) return;
        if (playbackTimeoutRef.current) {
            clearTimeout(playbackTimeoutRef.current);
            playbackTimeoutRef.current = null;
        }
        if (isPlayingRef.current) {
            audio.pause();
            isPlayingRef.current = false;
        }
        audio.currentTime = Math.max(0, fromTime);
        const playPromise = audio.play();
        if (playPromise !== undefined) {
            isPlayingRef.current = true;
            playPromise
                .then(() => {
                    playbackTimeoutRef.current = setTimeout(() => {
                        audio.pause();
                        isPlayingRef.current = false;
                    }, previewDuration * 1000);
                })
                .catch(() => {
                    isPlayingRef.current = false;
                });
        }
    }, []);

    useEffect(() => {
        if (isDragging) return;
        const timer = setTimeout(() => {
            trimStartX.set(timeToPixels(trimStart));
            trimEndX.set(timeToPixels(trimEnd));
        }, isOpen ? 200 : 0);
        return () => clearTimeout(timer);
    }, [trimStart, trimEnd, isDragging, timeToPixels, trimStartX, trimEndX, isOpen]);

    useEffect(() => {
        if (!isOpen) return;
        const raf = requestAnimationFrame(() => {
            setTimeout(() => {
                playPreviewFrom(initialTrimStart, (initialTrimEnd ?? audioDuration) - initialTrimStart);
            }, 100);
        });
        return () => cancelAnimationFrame(raf);
    }, [isOpen]);

    const handleTrimStartDrag = useCallback(
        (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
            if (!trackRef.current) return;
            let newX = trimStartX.get() + info.delta.x;
            const minX = 0;
            const maxX = trimEndX.get() - timeToPixels(0.1);
            newX = Math.max(minX, Math.min(newX, maxX));
            trimStartX.set(newX);
            setTrimStart(Math.max(0, Math.min(pixelsToTime(newX), pixelsToTime(trimEndX.get()) - 0.1)));
        },
        [trimStartX, trimEndX, timeToPixels, pixelsToTime]
    );

    const handleTrimStartDragEnd = useCallback(() => {
        setIsDragging(false);
        const finalTime = pixelsToTime(trimStartX.get());
        const clampedTime = Math.max(0, Math.min(finalTime, pixelsToTime(trimEndX.get()) - 0.1));
        setTrimStart(clampedTime);
        playPreviewFrom(clampedTime, pixelsToTime(trimEndX.get()) - clampedTime);
    }, [trimStartX, trimEndX, pixelsToTime, playPreviewFrom]);

    const handleTrimEndDrag = useCallback(
        (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
            if (!trackRef.current) return;
            let newX = trimEndX.get() + info.delta.x;
            const minX = trimStartX.get() + timeToPixels(0.1);
            const maxX = trackWidth();
            newX = Math.max(minX, Math.min(newX, maxX));
            trimEndX.set(newX);
            setTrimEnd(
                Math.max(pixelsToTime(trimStartX.get()) + 0.1, Math.min(pixelsToTime(newX), audioDuration))
            );
        },
        [trimStartX, trimEndX, audioDuration, timeToPixels, pixelsToTime, trackWidth]
    );

    const handleTrimEndDragEnd = useCallback(() => {
        setIsDragging(false);
        const finalTime = pixelsToTime(trimEndX.get());
        const clampedTime = Math.max(pixelsToTime(trimStartX.get()) + 0.1, Math.min(finalTime, audioDuration));
        setTrimEnd(clampedTime);
        playPreviewFrom(pixelsToTime(trimStartX.get()), clampedTime - pixelsToTime(trimStartX.get()));
    }, [trimEndX, trimStartX, audioDuration, pixelsToTime, playPreviewFrom]);

    const stopAudio = useCallback(() => {
        if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
        if (audioRef.current && isPlayingRef.current) {
            audioRef.current.pause();
            isPlayingRef.current = false;
        }
    }, []);

    const rangeDraggingRef = useRef(false);
    const rangePointerStartRef = useRef<{ pointerX: number; startX: number; endX: number } | null>(null);

    const handleRangePointerDown = useCallback(
        (e: React.PointerEvent) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            rangeDraggingRef.current = true;
            rangePointerStartRef.current = {
                pointerX: e.clientX,
                startX: trimStartX.get(),
                endX: trimEndX.get(),
            };
        },
        [trimStartX, trimEndX]
    );

    const handleRangePointerMove = useCallback(
        (e: React.PointerEvent) => {
            if (!rangeDraggingRef.current || !rangePointerStartRef.current) return;
            const w = trackWidth();
            const { pointerX, startX, endX } = rangePointerStartRef.current;
            const delta = e.clientX - pointerX;
            const duration = endX - startX;
            let newStartX = startX + delta;
            let newEndX = endX + delta;

            if (newStartX < 0) {
                newStartX = 0;
                newEndX = duration;
            }
            if (newEndX > w) {
                newEndX = w;
                newStartX = w - duration;
            }
            trimStartX.set(newStartX);
            trimEndX.set(newEndX);
            setTrimStart(pixelsToTime(newStartX));
            setTrimEnd(pixelsToTime(newEndX));
        },
        [trackWidth, trimStartX, trimEndX, pixelsToTime]
    );

    const handleRangePointerUp = useCallback(() => {
        if (!rangeDraggingRef.current) return;
        rangeDraggingRef.current = false;
        const finalStart = pixelsToTime(trimStartX.get());
        const finalEnd = pixelsToTime(trimEndX.get());
        rangePointerStartRef.current = null;
        playPreviewFrom(finalStart, finalEnd - finalStart);
    }, [trimStartX, trimEndX, pixelsToTime, playPreviewFrom]);

    const handleCancel = useCallback(() => {
        stopAudio();
        onCancel();
    }, [stopAudio, onCancel]);

    const handleConfirm = useCallback(() => {
        stopAudio();
        onConfirm(trimStart, trimEnd);
    }, [stopAudio, onConfirm, trimStart, trimEnd]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        const ms = Math.floor((seconds % 1) * 10);
        return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
    };

    const trimmedDuration = trimEnd - trimStart;
    const startPercentage = (trimStart / audioDuration) * 100;
    const endPercentage = (trimEnd / audioDuration) * 100;

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/60 backdrop-blur-md animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="audio-trim-title"
        >
            <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="p-8 bg-popover dark:bg-black border border-border rounded-2xl shadow-[0_0_80px_-15px_rgba(0,0,0,1)] w-full max-w-2xl mx-4"
            >
                <div className="flex items-start justify-between mb-6">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-blue-500/10 border border-blue-500/20 squircle-element-camera">
                            <Icon icon="mdi:content-cut" className="text-blue-600 dark:text-blue-400" width="24" aria-hidden="true" />
                        </div>
                        <div>
                            <h2 id="audio-trim-title" className="text-xl font-bold text-foreground">
                                {t("title")}
                            </h2>
                            <p className="text-sm text-muted-foreground mt-0.5">
                                {t("subtitle")}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={handleCancel}
                        className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Close"
                    >
                        <Icon icon="lucide:x" width="20" aria-hidden="true" />
                    </button>
                </div>
                <div className="mb-6 p-4 bg-muted/40 border border-border squircle-element-camera">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                            <Icon icon="mdi:music-note" width="16" aria-hidden="true" />
                            <span className="font-medium text-foreground">{audioName}</span>
                        </div>
                        <span className="text-xs text-muted-foreground">
                            {t("totalDuration")} {formatTime(audioDuration)}
                        </span>
                    </div>
                </div>
                <div className="mb-8">
                    <div
                        ref={trackRef}
                        className="relative h-24 bg-muted border border-border select-none mb-4"
                    >
                        <div className="absolute inset-0 flex items-center pointer-events-none">
                            <div className="flex items-end gap-0.5 h-full w-full px-2 pb-2 pt-2">
                                {waveformHeights.map((height, i) => (
                                    <div key={i} className="flex-1 bg-foreground/15 rounded-full" style={{ height: `${height}%` }} />
                                ))}
                            </div>
                        </div>
                        <div
                            className="absolute top-0 bottom-0 bg-blue-500/15 border-y border-blue-500/30 cursor-grab active:cursor-grabbing select-none"
                            style={{
                                left: `${startPercentage}%`,
                                right: `${100 - endPercentage}%`,
                            }}
                            onPointerDown={handleRangePointerDown}
                            onPointerMove={handleRangePointerMove}
                            onPointerUp={handleRangePointerUp}
                        >
                            <div className="absolute inset-0 flex items-end px-1 pb-2 pt-2 pointer-events-none">
                                {trimmedWaveformHeights.map((height, i) => (
                                    <div key={i} className="flex-1 bg-blue-400/50 rounded-full" style={{ height: `${height}%` }} />
                                ))}
                            </div>
                        </div>
                        <motion.div
                            className="absolute top-0 bottom-0 z-20 flex items-center justify-center"
                            style={{ left: -1, x: trimStartX, width: 2 }}
                            drag="x"
                            dragElastic={0}
                            dragMomentum={false}
                            onDrag={handleTrimStartDrag}
                            onDragStart={() => setIsDragging(true)}
                            onDragEnd={handleTrimStartDragEnd}
                            role="slider"
                            aria-label="Trim start"
                            aria-valuemin={0}
                            aria-valuemax={audioDuration}
                            aria-valuenow={trimStart}
                            aria-valuetext={`Start: ${Math.floor(trimStart / 60)}:${String(Math.floor(trimStart % 60)).padStart(2, '0')}`}
                            tabIndex={0}
                        >
                            <div className="absolute inset-0 bg-blue-500" />
                            <div
                                className="absolute cursor-ew-resize"
                                style={{
                                    width: 6,
                                    height: 28,
                                    background: '#378ADD',
                                    borderRadius: 3,
                                    left: -2,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    boxShadow: '0 0 0 1.5px rgba(55,138,221,0.3)',
                                }}
                            />
                        </motion.div>
                        <motion.div
                            className="absolute top-0 bottom-0 z-20 flex items-center justify-center"
                            style={{ left: -1, x: trimEndX, width: 2 }}
                            drag="x"
                            dragElastic={0}
                            dragMomentum={false}
                            onDrag={handleTrimEndDrag}
                            onDragStart={() => setIsDragging(true)}
                            onDragEnd={handleTrimEndDragEnd}
                            role="slider"
                            aria-label="Trim end"
                            aria-valuemin={0}
                            aria-valuemax={audioDuration}
                            aria-valuenow={trimEnd}
                            aria-valuetext={`End: ${Math.floor(trimEnd / 60)}:${String(Math.floor(trimEnd % 60)).padStart(2, '0')}`}
                            tabIndex={0}
                        >
                            <div className="absolute inset-0 bg-blue-500" />
                            <div
                                className="absolute cursor-ew-resize"
                                style={{
                                    width: 6,
                                    height: 28,
                                    background: '#378ADD',
                                    borderRadius: 3,
                                    left: -2,
                                    top: '50%',
                                    transform: 'translateY(-50%)',
                                    boxShadow: '0 0 0 1.5px rgba(55,138,221,0.3)',
                                }}
                            />
                        </motion.div>
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 p-3 bg-muted/50 border border-border rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">{t("start")}</div>
                            <div className="text-lg font-mono text-foreground">{formatTime(trimStart)}</div>
                        </div>
                        <Icon icon="mdi:arrow-right" width="20" className="text-muted-foreground shrink-0" aria-hidden="true" />
                        <div className="flex-1 p-3 bg-muted/50 border border-border rounded-lg">
                            <div className="text-xs text-muted-foreground mb-1">{t("end")}</div>
                            <div className="text-lg font-mono text-foreground">{formatTime(trimEnd)}</div>
                        </div>
                        <Icon icon="mdi:equal" width="20" className="text-muted-foreground shrink-0" aria-hidden="true" />
                        <div className="flex-1 p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg">
                            <div className="text-xs text-blue-600/60 dark:text-blue-400/60 mb-1">{t("duration")}</div>
                            <div className="text-lg font-mono text-blue-600 dark:text-blue-400 font-semibold">{formatTime(trimmedDuration)}</div>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Button
                        variant="outline"
                        onClick={handleCancel}
                        className="flex-1 h-11 bg-transparent border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                    >
                        {t("cancel")}
                    </Button>
                    <Button onClick={handleConfirm} variant="primary" className="flex-1 h-11 text-white font-medium">
                        <Icon icon="mdi:check" width="18" className="mr-1.5" aria-hidden="true" />
                        {t("apply")}
                    </Button>
                </div>
            </motion.div>
        </div>
    );
}