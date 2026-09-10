"use client";
import { Icon } from "@iconify/react";
import { useCallback, useRef, useState, useEffect } from "react";
import type { AudioMenuProps, AudioTrack } from "@/types/audio.types";
import { AudioTrimModal } from "./AudioTrimModal";
import { Button } from "@/components/ui/button";
import { TooltipAction } from "@/components/ui/tooltip-action";
import { TrackVolumeSlider } from "@/components/ui/TrackVolumeSlider";
import { useTranslations } from "next-intl";
import { renderSoundToFile, type SoundName } from "@/lib/sounds";
import { SoundLibrary } from "@/components/ui/SoundLibrary";

export function AudioMenu({
    audioTracks,
    uploadedAudios,
    videoDuration,
    onAudioUpload,
    onUpdateAudioTrack,
    onDeleteAudioTrack,
    selectedAudioTrackId,
    onSelectAudioTrack,
}: AudioMenuProps) {
    const t = useTranslations("audioMenu");
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [trimModalOpen, setTrimModalOpen] = useState(false);
    const [trimModalTrack, setTrimModalTrack] = useState<AudioTrack | null>(null);

    const trackRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    useEffect(() => {
        if (!selectedAudioTrackId) return;
        trackRefs.current.get(selectedAudioTrackId)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, [selectedAudioTrackId]);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const SUPPORTED_AUDIO_FORMATS = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/m4a', 'audio/x-m4a'];
        if (!SUPPORTED_AUDIO_FORMATS.includes(file.type) && !['.mp3', '.wav', '.ogg', '.aac', '.m4a'].some(ext => file.name.toLowerCase().endsWith(ext))) {
            alert("Unsupported audio format. Please use MP3, WAV, OGG, AAC, or M4A.");
            return;
        }
        const MAX_AUDIO_FILE_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_AUDIO_FILE_SIZE) {
            alert("The file is too large. The maximum size allowed is 10MB.");
            return;
        }
        onAudioUpload(file);
        if (fileInputRef.current) fileInputRef.current.value = "";
    }, [onAudioUpload]);

    const [isDragOver, setIsDragOver] = useState(false);
    const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); }, []);
    const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); }, []);
    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (!file) return;
        const SUPPORTED_AUDIO_FORMATS = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/wave', 'audio/x-wav', 'audio/ogg', 'audio/aac', 'audio/m4a', 'audio/x-m4a'];
        if (!SUPPORTED_AUDIO_FORMATS.includes(file.type) && !['.mp3', '.wav', '.ogg', '.aac', '.m4a'].some(ext => file.name.toLowerCase().endsWith(ext))) {
            alert("Unsupported audio format. Please use MP3, WAV, OGG, AAC, or M4A.");
            return;
        }
        const MAX_AUDIO_FILE_SIZE = 10 * 1024 * 1024;
        if (file.size > MAX_AUDIO_FILE_SIZE) {
            alert("The file is too large. The maximum size allowed is 10MB.");
            return;
        }
        onAudioUpload(file);
    }, [onAudioUpload]);

    const [renderingSound, setRenderingSound] = useState<SoundName | null>(null);
    const handleAddDefaultSound = useCallback(async (sound: SoundName) => {
        setRenderingSound(sound);
        try {
            const file = await renderSoundToFile(sound);
            onAudioUpload(file);
        } finally {
            setRenderingSound(null);
        }
    }, [onAudioUpload]);

    const SOUND_CATEGORIES: { label: string; sounds: SoundName[] }[] = [
        { label: t("categories.confirmation"), sounds: ["chime", "success", "ready", "sparkle"] },
        { label: t("categories.alert"), sounds: ["error"] },
        { label: t("categories.ui"), sounds: ["tick", "press", "release", "toggle", "pulse", "scan"] },
        { label: t("categories.transition"), sounds: ["page", "droplet"] },
        { label: t("categories.ambient"), sounds: ["bloom", "arrival", "whisper"] },
        { label: t("categories.system"), sounds: ["loading"] },
    ];

    const tracksNewestFirst = [...audioTracks].reverse();

    return (
        <div className="p-4 flex flex-col gap-5">
            <div className="flex items-center gap-2 text-foreground font-medium">
                <Icon icon="mdi:volume-high" width="20" aria-hidden="true" />
                <span>{t("title")}</span>
            </div>

            <div
                className={`flex flex-col items-center justify-center w-full rounded-lg transition-colors ${isDragOver ? "bg-blue-500/10 ring-1 ring-blue-500/40" : ""}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <input ref={fileInputRef} type="file" accept=".mp3,.wav,.ogg,.aac,.m4a,audio/*" onChange={handleFileSelect} className="hidden" aria-label={t("uploadButton")} />
                <Button variant="outline" className="w-full text-sm" onClick={() => fileInputRef.current?.click()} aria-label={t("uploadButton")}>
                    <Icon icon="solar:upload-minimalistic-outline" width="14" />
                    <span>{t("uploadButton")}</span>
                </Button>
                <p className="text-xs text-muted-foreground/60 mt-2 text-center">{t("uploadHint")}</p>
            </div>

            <div className="flex flex-col gap-2">
                <span className="text-xs font-medium text-muted-foreground">{t("timelineTracks", { count: audioTracks.length })}</span>

                {audioTracks.length > 0 ? (
                    <div className="flex flex-col gap-2">
                        {tracksNewestFirst.map((track) => {
                            const isSelected = track.id === selectedAudioTrackId;
                            const exceedsVideoDuration = (track.startTime + track.duration) > videoDuration;
                            return (
                                <div
                                    key={track.id}
                                    ref={(el) => {
                                        if (el) trackRefs.current.set(track.id, el);
                                        else trackRefs.current.delete(track.id);
                                    }}
                                    className={`bg-muted border squircle-element p-3 transition-all ${isSelected ? "border-blue-500/50 bg-blue-500/5" : "border-border hover:border-muted-foreground/50"
                                        }`}
                                    onClick={() => onSelectAudioTrack(isSelected ? null : track.id)}
                                    role="button"
                                    tabIndex={0}
                                    aria-pressed={isSelected}
                                    onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                            e.preventDefault();
                                            onSelectAudioTrack(isSelected ? null : track.id);
                                        }
                                    }}
                                >
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex-1 min-w-0">
                                            <div className="text-sm text-foreground font-medium truncate">{track.name}</div>
                                            {exceedsVideoDuration && (
                                                <div className="text-xs text-orange-600 dark:text-orange-400 flex items-center gap-1">
                                                    <Icon icon="mdi:alert" width="12" />
                                                    {t("exceedsDuration")}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <TooltipAction label={t("trimAction")}>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setTrimModalTrack(track); setTrimModalOpen(true); }}
                                                    className="p-1.5 rounded text-muted-foreground/60 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-500/10 transition-all"
                                                >
                                                    <Icon icon="mdi:content-cut" width="16" />
                                                </button>
                                            </TooltipAction>
                                            <TooltipAction label={t("deleteAction")}>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onDeleteAudioTrack(track.id);
                                                        if (selectedAudioTrackId === track.id) onSelectAudioTrack(null);
                                                    }}
                                                    className="p-1.5 rounded text-muted-foreground/60 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-all"
                                                >
                                                    <Icon icon="material-symbols:delete-outline-rounded" width="16" />
                                                </button>
                                            </TooltipAction>
                                        </div>
                                    </div>
                                    <div className="flex flex-col gap-3 pt-2 animate-in fade-in duration-150">
                                        <TrackVolumeSlider track={track} onUpdateAudioTrack={onUpdateAudioTrack} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <div className="text-center py-6 px-4 text-muted-foreground/60 rounded-md border border-dashed border-border" role="status">
                        <Icon icon="mdi:music-note-off" width="32" className="mx-auto mb-2 opacity-30" aria-hidden="true" />
                        <p className="text-xs">{t("noTracks")}</p>
                        <p className="text-[10px] mt-1">{t("noTracksHint")}</p>
                    </div>
                )}
            </div>

            <div className="flex flex-col gap-3">
                <div className="text-xs font-medium text-muted-foreground uppercase">{t("defaultSounds")}</div>
                <SoundLibrary categories={SOUND_CATEGORIES} renderingSound={renderingSound} onAdd={handleAddDefaultSound} />
            </div>

            {trimModalOpen && trimModalTrack && (() => {
                const originalAudio = uploadedAudios.find(a => a.id === trimModalTrack.audioId);
                if (!originalAudio) return null;
                return (
                    <AudioTrimModal
                        key={trimModalTrack.id}
                        isOpen={trimModalOpen}
                        audioName={trimModalTrack.name}
                        audioUrl={originalAudio.url}
                        audioDuration={originalAudio.duration}
                        initialTrimStart={trimModalTrack.trimStart ?? 0}
                        initialTrimEnd={(trimModalTrack.trimStart ?? 0) + trimModalTrack.duration}
                        onConfirm={(trimStart, trimEnd) => {
                            onUpdateAudioTrack(trimModalTrack.id, { duration: trimEnd - trimStart, trimStart });
                            setTrimModalOpen(false);
                            setTrimModalTrack(null);
                        }}
                        onCancel={() => { setTrimModalOpen(false); setTrimModalTrack(null); }}
                    />
                );
            })()}
        </div>
    );
}