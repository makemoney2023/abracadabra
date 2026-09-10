"use client";
import { Icon } from "@iconify/react";
import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { TooltipAction } from "@/components/ui/tooltip-action";
import {
  deleteLibraryVideo,
  getLibraryVideo,
  updateVideoAudioState,
  formatFileSize,
  formatVideoDuration,
  getLibraryVideoInfoList,
} from "@/lib/videos-library";
import { LibraryVideoInfo } from "@/types";
import { TickSliderControl } from "@/components/ui/TickSliderControl";

interface VideosMenuProps {
  onAddToTrack?: (videoId: string, blob: Blob, duration: number) => void;
  onRemoveFromTrack?: (videoId: string) => void;
  onVideoUpload?: (file: File) => void;
  onVideoDeleteFromTrack?: (videoId: string) => void;
  videosInTrackIds?: string[];
  refreshTrigger?: number;
  isUploading?: boolean;
  onVideoAudioToggle?: (videoId: string, hasAudio: boolean) => void;
  onGlobalSpeedChange?: (speed: number) => void;
  globalSpeed?: number;
}

export function VideosMenu({
  onAddToTrack,
  onRemoveFromTrack,
  onVideoUpload,
  onVideoDeleteFromTrack,
  videosInTrackIds = [],
  refreshTrigger,
  isUploading = false,
  onVideoAudioToggle,
  onGlobalSpeedChange,
  globalSpeed = 1,
}: VideosMenuProps) {
  const t = useTranslations("videosMenu");
  const [videos, setVideos] = useState<LibraryVideoInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let ignore = false;

    getLibraryVideoInfoList()
      .then((videoList) => {
        if (!ignore) setVideos(videoList);
      })
      .catch((error) => {
        console.error("Error loading videos:", error);
      })
      .finally(() => {
        if (!ignore) setIsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [refreshTrigger]);

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await deleteLibraryVideo(id);
      setVideos((prev) => prev.filter((v) => v.id !== id));
      onVideoDeleteFromTrack?.(id);
    } catch (error) {
      console.error("Error deleting video:", error);
    } finally {
      setDeletingId(null);
    }
  };

  const handleAddToTrack = async (id: string) => {
    if (addingId || !onAddToTrack) return;
    setAddingId(id);
    try {
      const video = await getLibraryVideo(id);
      if (video) {
        onAddToTrack(video.id, video.blob, video.duration);
      }
    } catch (error) {
      console.error("Error adding video to track:", error);
    } finally {
      setAddingId(null);
    }
  };

  const handleToggleAudio = async (id: string, currentHasAudio: boolean | undefined) => {
    try {
      const newHasAudio = !(currentHasAudio ?? true);
      await updateVideoAudioState(id, newHasAudio);
      setVideos((prev) => prev.map((v) => (v.id === id ? { ...v, hasAudio: newHasAudio } : v)));
      onVideoAudioToggle?.(id, newHasAudio);
    } catch (error) {
      console.error("Error toggling audio state:", error);
    }
  };

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file && onVideoUpload) {
        onVideoUpload(file);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onVideoUpload]
  );

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isUploading) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (isUploading) return;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith("video/") && onVideoUpload) {
      onVideoUpload(file);
    }
  };

  return (
    <div
      className="p-4 flex flex-col gap-5 h-full relative"
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <AnimatePresence>
        {isDragging && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-muted/90 backdrop-blur-sm border-2 border-blue-500 border-dashed squircle-element-camera m-2"
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <div className="w-14 h-14 rounded-full bg-blue-500/20 border flex items-center justify-center border-blue-500/50 text-blue-600 dark:text-blue-400 mb-4 scale-110">
              <Icon icon="solar:upload-minimalistic-bold" className="text-2xl" />
            </div>
            <p className="text-blue-600 dark:text-blue-400 font-medium text-sm">{t("dropzone")}</p>
          </motion.div>
        )}
      </AnimatePresence>

      <input ref={fileInputRef} type="file" accept="video/*" onChange={handleFileSelect} className="hidden" />

      <div className="flex items-center gap-2 text-foreground font-medium">
        <Icon icon="solar:video-library-outline" width="20" aria-hidden="true" />
        <span>{t("title")}</span>
      </div>

      <div className="bg-muted border border-border squircle-element p-3 shrink-0 mb-1">
        <TickSliderControl
          label={t("speed")}
          value={globalSpeed}
          min={0.5}
          max={3}
          step={0.1}
          tickStep={0.5}
          suffix="x"
          onChange={(val) => onGlobalSpeedChange?.(val)}
        />
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar -mx-1 px-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8" role="status">
            <Icon icon="svg-spinners:ring-resize" width="24" className="text-muted-foreground/60" aria-hidden="true" />
          </div>
        ) : videos.length === 0 ? (
          <div
            onClick={triggerFileUpload}
            className="group bg-muted border border-dashed border-border hover:border-muted-foreground/50 hover:bg-muted/50 squircle-element p-8 text-center cursor-pointer transition-colors"
            role="button"
            tabIndex={0}
            aria-label={t("emptyState.title")}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerFileUpload(); } }}
          >
            <div className="w-12 h-12 rounded-full bg-muted border border-border flex items-center justify-center mx-auto mb-4 group-hover:scale-105 transition-transform">
              <Icon
                icon="solar:upload-minimalistic-outline"
                width="24"
                className="text-muted-foreground/60 group-hover:text-muted-foreground transition-colors"
                aria-hidden="true"
              />
            </div>
            <p className="text-sm font-medium text-muted-foreground mb-1">{t("emptyState.title")}</p>
            <p className="text-xs text-muted-foreground/60 mb-5">{t("emptyState.instruction")}</p>
            <Button disabled={isUploading} variant="outline" className="w-full text-xs">
              {isUploading ? (
                <>
                  <Icon icon="svg-spinners:ring-resize" width="16" />
                  <span>{t("upload.status")}</span>
                </>
              ) : (
                <span>{t("upload.action")}</span>
              )}
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              onClick={triggerFileUpload}
              disabled={isUploading}
              variant="outline"
              className="w-full text-xs mb-4 group"
            >
              {isUploading ? (
                <>
                  <Icon icon="svg-spinners:ring-resize" width="16" />
                  <span className="text-sm">{t("upload.status")}</span>
                </>
              ) : (
                <>
                  <Icon
                    icon="solar:upload-minimalistic-outline"
                    width="16"
                    className="group-hover:-translate-y-0.5 transition-transform"
                  />
                  <span className="text-sm">{t("upload.button")}</span>
                </>
              )}
            </Button>

            <div className="grid grid-cols-2 gap-3">
              <AnimatePresence mode="popLayout">
                {videos.map((video) => (
                  <motion.div
                    key={video.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    className={`group flex flex-col squircle-element border overflow-hidden transition-all duration-200 bg-card w-full ${videosInTrackIds.includes(video.id)
                      ? "border-blue-500 shadow-[0_0_15px_rgba(59,130,246,0.15)]"
                      : "border-border hover:border-muted-foreground/50"
                      }`}
                  >
                    <div
                      className="relative w-full aspect-video cursor-pointer overflow-hidden border-b border-border bg-black"
                      onClick={() => {
                        if (!addingId) {
                          videosInTrackIds.includes(video.id)
                            ? onRemoveFromTrack?.(video.id)
                            : handleAddToTrack(video.id);
                        }
                      }}
                    >
                      {video.thumbnailUrl ? (
                        <img
                          src={video.thumbnailUrl}
                          alt="Video thumbnail"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <Icon icon="solar:play-bold" width="28" className="text-muted-foreground/40" />
                        </div>
                      )}

                      <div
                        className={`absolute inset-0 flex items-center justify-center transition-opacity z-10 pointer-events-none ${videosInTrackIds.includes(video.id) || addingId === video.id
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100"
                          }`}
                      >
                        {addingId === video.id ? (
                          <div className="p-2.5 rounded-full bg-black/60 backdrop-blur-sm border border-border">
                            <Icon icon="svg-spinners:ring-resize" width="20" className="text-white" />
                          </div>
                        ) : videosInTrackIds.includes(video.id) ? (
                          <div className="p-2 rounded-full bg-blue-500/20 backdrop-blur-sm border border-blue-500/50">
                            <Icon icon="solar:check-circle-bold" width="24" className="text-blue-600 dark:text-blue-400" />
                          </div>
                        ) : (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-[1px]">
                            <div className="flex items-center gap-1 px-3 py-1.5 bg-white text-black rounded-full shadow-xl">
                              <Icon icon="material-symbols:add-rounded" width="16" />
                              <span className="text-[11px] font-bold">{t("actions.add")}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between px-2.5">
                      <span className="text-[11px] font-mono font-medium text-muted-foreground">
                        {formatVideoDuration(video.duration)}
                      </span>

                      <div className="flex items-center gap-1">
                        <TooltipAction label={video.hasAudio === false ? t("actions.unmute") : t("actions.mute")}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleAudio(video.id, video.hasAudio);
                            }}
                            disabled={video.originalHasAudio === false}
                            className={`p-1.5 squircle-element transition-colors ${video.originalHasAudio === false
                              ? "text-muted-foreground cursor-not-allowed"
                              : video.hasAudio === false
                                ? "text-red-600 dark:text-red-400 hover:bg-red-500/10"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted"
                              }`}
                          >
                            <Icon
                              icon={video.hasAudio === false ? "solar:volume-cross-outline" : "solar:volume-loud-outline"}
                              width="14"
                            />
                          </button>
                        </TooltipAction>

                        <TooltipAction label={t("actions.delete")}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDelete(video.id);
                            }}
                            disabled={deletingId === video.id}
                            className="p-1.5 squircle-element text-muted-foreground hover:text-red-600 dark:hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
                          >
                            {deletingId === video.id ? (
                              <Icon icon="svg-spinners:ring-resize" width="14" />
                            ) : (
                              <Icon icon="solar:trash-bin-trash-outline" width="14" />
                            )}
                          </button>
                        </TooltipAction>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        )}
      </div>

      <div className="text-[11px] text-muted-foreground/40 text-center pt-2 border-t border-border shrink-0">
        {t("footer")}
      </div>
    </div>
  );
}