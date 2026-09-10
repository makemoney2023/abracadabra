import { AspectRatio } from "@/types";
import { normalizeVideoFile } from "./video-conversion";
import type { VideoTrackClip } from "@/types/video-track.types";

const DB_NAME = "openvid-uploaded-videos";
const DB_VERSION = 2;
const STORE_NAME = "videos";
const SINGLE_VIDEO_KEY = "current-uploaded-video";

const TRACK_STORE_NAME = "video-track";
const TRACK_KEY = "current-video-track";

export interface CachedUploadedVideo {
  key: string;
  blob: Blob;
  fileName: string;
  fileSize: number;
  duration: number;
  width: number;
  height: number;
  aspectRatio: string;
  uploadedAt: number;
}

interface CachedVideoTrack {
  key: string;
  clips: VideoTrackClip[];
  savedAt: number;
}

let dbInstance: IDBDatabase | null = null;

async function cleanupOldUploadCache(db: IDBDatabase): Promise<void> {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const cutoff = Date.now() - SEVEN_DAYS_MS;
  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const getReq = store.get(SINGLE_VIDEO_KEY);
      getReq.onsuccess = () => {
        const record = getReq.result as CachedUploadedVideo | undefined;
        if (record && record.uploadedAt < cutoff) {
          store.delete(SINGLE_VIDEO_KEY);
        }
      };
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      dbInstance = request.result;
      cleanupOldUploadCache(dbInstance).catch(() => { });
      resolve(request.result);
    };
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
        store.createIndex("uploadedAt", "uploadedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(TRACK_STORE_NAME)) {
        db.createObjectStore(TRACK_STORE_NAME, { keyPath: "key" });
      }
    };
  });
}

function calculateAspectRatio(width: number, height: number): string {
  if (!width || !height) return "auto";
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const divisor = gcd(width, height);
  return `${width / divisor}/${height / divisor}`;
}

async function getVideoMetadata(source: Blob): Promise<{
  duration: number;
  width: number;
  height: number;
  aspectRatio: string;
}> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(source);
    const cleanup = () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };
    video.onloadedmetadata = () => {
      const metadata = {
        duration: video.duration,
        width: video.videoWidth,
        height: video.videoHeight,
        aspectRatio: calculateAspectRatio(video.videoWidth, video.videoHeight),
      };
      cleanup();
      resolve(metadata);
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to load video metadata"));
    };
    video.src = url;
  });
}

export async function saveUploadedVideo(file: File): Promise<CachedUploadedVideo> {
  try {
    const db = await openDB();
    const { blob: normalizedBlob, wasConverted } = await normalizeVideoFile(file);
    const metadata = await getVideoMetadata(normalizedBlob);
    const fileName = wasConverted ? `${file.name.replace(/\.[^/.]+$/, "")}.mp4` : file.name;
    const data: CachedUploadedVideo = {
      key: SINGLE_VIDEO_KEY,
      blob: normalizedBlob,
      fileName,
      fileSize: normalizedBlob.size,
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      aspectRatio: metadata.aspectRatio,
      uploadedAt: Date.now(),
    };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(data);
      request.onerror = () => { reject(request.error); };
      request.onsuccess = () => resolve(data);
    });
  } catch (error) {
    throw error;
  }
}

export async function getUploadedVideo(): Promise<CachedUploadedVideo | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(SINGLE_VIDEO_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result;
        resolve(result || null);
      };
    });
  } catch (error) {
    console.warn("Failed to get uploaded video:", error);
    return null;
  }
}

export async function deleteUploadedVideo(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(SINGLE_VIDEO_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn("Failed to delete uploaded video:", error);
  }
}

export async function hasUploadedVideo(): Promise<boolean> {
  const video = await getUploadedVideo();
  return video !== null;
}

export async function getUploadedVideoInfo(): Promise<{
  fileName: string;
  fileSize: number;
  duration: number;
  aspectRatio: string;
  uploadedAt: number;
} | null> {
  const video = await getUploadedVideo();
  if (!video) return null;
  return {
    fileName: video.fileName,
    fileSize: video.fileSize,
    duration: video.duration,
    aspectRatio: video.aspectRatio,
    uploadedAt: video.uploadedAt,
  };
}

export async function saveVideoTrack(clips: VideoTrackClip[]): Promise<void> {
  try {
    const db = await openDB();
    const data: CachedVideoTrack = { key: TRACK_KEY, clips, savedAt: Date.now() };
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(TRACK_STORE_NAME, "readwrite");
      const store = transaction.objectStore(TRACK_STORE_NAME);
      const request = store.put(data);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn("Failed to save video track:", error);
  }
}

export async function getVideoTrack(): Promise<VideoTrackClip[] | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(TRACK_STORE_NAME, "readonly");
      const store = transaction.objectStore(TRACK_STORE_NAME);
      const request = store.get(TRACK_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const result = request.result as CachedVideoTrack | undefined;
        resolve(result ? result.clips : null);
      };
    });
  } catch (error) {
    console.warn("Failed to get video track:", error);
    return null;
  }
}

export async function clearVideoTrack(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(TRACK_STORE_NAME, "readwrite");
      const store = transaction.objectStore(TRACK_STORE_NAME);
      const request = store.delete(TRACK_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (error) {
    console.warn("Failed to clear video track:", error);
  }
}

export const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500MB
export const ALLOWED_VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska"];

export function mapAspectRatio(ratio: string): AspectRatio {
    const parts = ratio.split(/[:\/]/).map(Number);
    const w = parts[0];
    const h = parts[1];
    if (!w || !h) return "auto";
    const value = w / h;
    const targets: Array<[AspectRatio, number]> = [
        ["16:9", 16 / 9],
        ["9:16", 9 / 16],
        ["1:1", 1],
        ["4:3", 4 / 3],
        ["3:4", 3 / 4],
    ];
    let best: AspectRatio = "auto";
    let bestDiff = Infinity;
    for (const [label, target] of targets) {
        const diff = Math.abs(value - target);
        if (diff < bestDiff) {
            bestDiff = diff;
            best = label;
        }
    }
    return bestDiff / value < 0.02 ? best : "auto";
}