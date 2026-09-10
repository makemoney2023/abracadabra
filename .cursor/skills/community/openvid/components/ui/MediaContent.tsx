import { VideoCanvasProps, VideoThumbnail } from "@/types";
import { memo } from "react";

export const MediaContent = memo(function MediaContent({
  mediaType,
  videoUrl,
  videoRef,
  imageUrl,
  imageRef,
  cropArea,
  hasMask,
  hasMockup,
  objectFit = "contain",
  maskStyles,
  currentThumbnail,
  isVideoHovered,
  onTimeUpdate,
  onLoadedMetadata,
  onEnded,
}: {
  mediaType: "video" | "image";
  videoUrl: string | null;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  imageUrl: string | null;
  imageRef?: React.RefObject<HTMLImageElement | null>;
  cropArea?: VideoCanvasProps["cropArea"];
  hasMask: boolean;
  hasMockup: boolean;
  objectFit?: "contain" | "cover";
  maskStyles: React.CSSProperties;
  currentThumbnail: VideoThumbnail | null;
  isVideoHovered: boolean;
  onTimeUpdate?: () => void;
  onLoadedMetadata?: () => void;
  onEnded?: () => void;
}) {
  const fitClass = objectFit === "cover" ? "object-cover" : "object-contain";

  if (mediaType === "video" && videoUrl) {
    return (
      <>
        <video
          key={videoUrl}
          ref={videoRef}
          preload="auto"
          playsInline
          className={`w-full h-full ${fitClass}`}
          style={{
            ...(cropArea && (cropArea.width < 100 || cropArea.height < 100 || cropArea.x > 0 || cropArea.y > 0)
              ? { objectViewBox: `inset(${cropArea.y}% ${100 - cropArea.x - cropArea.width}% ${100 - cropArea.y - cropArea.height}% ${cropArea.x}%)` }
              : {}),
            ...(hasMask && !hasMockup ? maskStyles : {}),
            opacity: currentThumbnail ? 0 : 1,
          }}
          onTimeUpdate={onTimeUpdate}
          onLoadedMetadata={onLoadedMetadata}
          onEnded={onEnded}
        />
        {currentThumbnail && (
          <img
            src={currentThumbnail.dataUrl}
            alt="Preview"
            crossOrigin="anonymous"
            className={`absolute inset-0 w-full h-full ${fitClass}`}
            style={hasMask && !hasMockup ? maskStyles : {}}
          />
        )}
      </>
    );
  }

  if (mediaType === "image" && imageUrl) {
    return (
      <>
        <img
          ref={imageRef as React.RefObject<HTMLImageElement>}
          src={imageUrl}
          alt="Editing image"
          crossOrigin="anonymous"
          className={`w-full h-full ${fitClass}`}
          style={{
            ...(cropArea && (cropArea.width < 100 || cropArea.height < 100 || cropArea.x > 0 || cropArea.y > 0)
              ? { objectViewBox: `inset(${cropArea.y}% ${100 - cropArea.x - cropArea.width}% ${100 - cropArea.y - cropArea.height}% ${cropArea.x}%)` }
              : {}),
            ...(hasMask && !hasMockup ? maskStyles : {}),
          }}
          onLoad={onLoadedMetadata}
        />
        <div
          className="absolute inset-0 pointer-events-none transition-opacity duration-300"
          style={{
            background: "radial-gradient(circle at center, transparent 30%, rgba(0, 0, 0, 0.75) 100%)",
            opacity: isVideoHovered ? 1 : 0,
            zIndex: 10,
          }}
        />
      </>
    );
  }

  return null;
});