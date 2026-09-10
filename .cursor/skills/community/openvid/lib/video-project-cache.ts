import type { VideoTrackClip } from "@/types/video-track.types";
import type { ZoomFragment, ZoomMovement } from "@/types/zoom.types";
import type { AudioTrack } from "@/types/audio.types";
import type { CanvasElement } from "@/types/canvas-elements.types";
import type { MockupConfig } from "@/types/mockup.types";
import type { MockupMotionFragment } from "@/lib/mockup-motion";
import type { BackgroundTab, BackgroundColorConfig, AspectRatio, CropArea } from "@/types";
import type { CameraConfig } from "@/types/camera.types";
import type { Preview3DConfig, ImageMaskConfig } from "@/types/photo.types";
import type { TrimRange } from "@/types/timeline.types";

const DB_NAME = "openvid-video-project";
const DB_VERSION = 3;
const PROJECT_STORE = "project";
const AUDIOS_STORE = "audios";
const CAMERA_STORE = "camera";
const PROJECT_KEY = "singleton";
const CAMERA_KEY = "singleton";

export interface VideoProject {
    id: typeof PROJECT_KEY;
    savedAt: number;
    schemaVersion: 1;

    videoClips: VideoTrackClip[];
    trimRange: TrimRange;
    globalSpeed: number;

    zoomFragments: ZoomFragment[];
    zoomMovements: ZoomMovement[];

    audioTracks: AudioTrack[];
    uploadedAudioIds: string[];
    muteOriginalAudio: boolean;
    masterVolume: number;

    canvasElements: CanvasElement[];

    mockupId: string;
    mockupConfig: MockupConfig;

    mockupMotionFragments: MockupMotionFragment[];

    backgroundTab: BackgroundTab;
    selectedWallpaper: number;
    backgroundBlur: number;
    selectedImageUrl: string;
    unsplashBgUrl: string;
    backgroundColorConfig: BackgroundColorConfig | null;

    padding: number;
    roundedCorners: number;
    shadows: number;
    aspectRatio: AspectRatio;
    customDimensions: { width: number; height: number } | null;
    cropArea: CropArea | undefined;

    videoTransform: { rotation: number; translateX: number; translateY: number };
    imageTransform: Preview3DConfig;
    apply3DToBackground: boolean;
    imageMaskConfig: ImageMaskConfig;
    videoMaskConfig: ImageMaskConfig;
    imageZoomScale: number;

    cameraConfig: CameraConfig | null;
    cameraVideoId: string | null;
}

/**
 * A persisted audio blob plus its metadata. The blob is stored separately
 * from the project snapshot because IndexedDB handles binary data
 * efficiently and the project snapshot stays small and JSON-serializable.
 */
export interface CachedAudioBlob {
    id: string;
    blob: Blob;
    fileName: string;
    fileSize: number;
    mimeType: string;
    duration: number;
    savedAt: number;
}

/**
 * A persisted camera-overlay video blob. The camera video that accompanies a
 * recording is a separate blob from the main video; storing it here lets us
 * regenerate its (ephemeral) `blob:` URL on restore instead of losing it on
 * reload. Referenced from the project snapshot via `cameraVideoId`.
 */
export interface CachedCameraBlob {
    id: string;
    blob: Blob;
    mimeType: string;
    savedAt: number;
    cameraConfig?: CameraConfig | null;
}

let dbInstance: IDBDatabase | null = null;

async function openDB(): Promise<IDBDatabase> {
    if (dbInstance) return dbInstance;

    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
            dbInstance = request.result;
            resolve(request.result);
        };

        request.onupgradeneeded = (event) => {
            const db = (event.target as IDBOpenDBRequest).result;
            if (!db.objectStoreNames.contains(PROJECT_STORE)) {
                db.createObjectStore(PROJECT_STORE, { keyPath: "id" });
            }
            if (!db.objectStoreNames.contains(AUDIOS_STORE)) {
                const store = db.createObjectStore(AUDIOS_STORE, { keyPath: "id" });
                store.createIndex("savedAt", "savedAt", { unique: false });
            }
            if (!db.objectStoreNames.contains(CAMERA_STORE)) {
                db.createObjectStore(CAMERA_STORE, { keyPath: "id" });
            }
        };
    });
}

// ── Project store ───────────────────────────────────────────────────────

/**
 * Save (or replace) the singleton video project.
 */
export async function saveVideoProject(project: Omit<VideoProject, "id" | "savedAt" | "schemaVersion">): Promise<VideoProject> {
    try {
        const db = await openDB();
        const fullProject: VideoProject = {
            ...project,
            id: PROJECT_KEY,
            savedAt: Date.now(),
            schemaVersion: 1,
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(PROJECT_STORE, "readwrite");
            const store = transaction.objectStore(PROJECT_STORE);
            const request = store.put(fullProject);

            request.onsuccess = () => resolve(fullProject);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error saving video project:", error);
        throw error;
    }
}

/**
 * Read the singleton video project, or null if none exists yet.
 */
export async function getVideoProject(): Promise<VideoProject | null> {
    try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(PROJECT_STORE, "readonly");
            const store = transaction.objectStore(PROJECT_STORE);
            const request = store.get(PROJECT_KEY);

            request.onsuccess = () => resolve(request.result ?? null);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error getting video project:", error);
        return null;
    }
}

/**
 * Delete the singleton video project.
 *
 * Resolves on `transaction.oncomplete` (not `request.onsuccess`) so the
 * delete is actually committed to disk before the caller proceeds. This is
 * critical when the caller navigates away immediately after clearing —
 * resolving on `request.onsuccess` would let the page unload before the
 * transaction commits, silently aborting the delete.
 */
export async function clearVideoProject(): Promise<void> {
    try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(PROJECT_STORE, "readwrite");
            const store = transaction.objectStore(PROJECT_STORE);
            store.delete(PROJECT_KEY);

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
            transaction.onabort = () => reject(transaction.error);
        });
    } catch (error) {
        console.error("Error clearing video project:", error);
        throw error;
    }
}

// ── Audio blobs store ───────────────────────────────────────────────────

/**
 * Persist an audio blob with its metadata so it can be restored after a
 * page reload (blob: URLs are ephemeral).
 */
export async function saveAudioBlob(
    id: string,
    blob: Blob,
    meta: { fileName: string; fileSize: number; mimeType: string; duration: number }
): Promise<CachedAudioBlob> {
    try {
        const db = await openDB();
        const data: CachedAudioBlob = {
            id,
            blob,
            fileName: meta.fileName,
            fileSize: meta.fileSize,
            mimeType: meta.mimeType,
            duration: meta.duration,
            savedAt: Date.now(),
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(AUDIOS_STORE, "readwrite");
            const store = transaction.objectStore(AUDIOS_STORE);
            const request = store.put(data);

            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error saving audio blob:", error);
        throw error;
    }
}

/**
 * Read a persisted audio blob by id.
 */
export async function getAudioBlob(id: string): Promise<CachedAudioBlob | null> {
    try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(AUDIOS_STORE, "readonly");
            const store = transaction.objectStore(AUDIOS_STORE);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result ?? null);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error getting audio blob:", error);
        return null;
    }
}

/**
 * Read multiple audio blobs in a single transaction.
 */
export async function getAudioBlobs(ids: string[]): Promise<CachedAudioBlob[]> {
    if (ids.length === 0) return [];

    try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(AUDIOS_STORE, "readonly");
            const store = transaction.objectStore(AUDIOS_STORE);
            const results: CachedAudioBlob[] = [];
            let completed = 0;

            for (const id of ids) {
                const request = store.get(id);
                request.onsuccess = () => {
                    if (request.result) results.push(request.result as CachedAudioBlob);
                    completed++;
                    if (completed === ids.length) resolve(results);
                };
                request.onerror = () => {
                    completed++;
                    if (completed === ids.length) resolve(results);
                };
            }
        });
    } catch (error) {
        console.error("Error getting audio blobs:", error);
        return [];
    }
}

/**
 * Delete a persisted audio blob.
 */
export async function deleteAudioBlob(id: string): Promise<void> {
    try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(AUDIOS_STORE, "readwrite");
            const store = transaction.objectStore(AUDIOS_STORE);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error deleting audio blob:", error);
        throw error;
    }
}

/**
 * Delete every audio blob that is not in `activeIds`. Keeps the audios
 * store in sync with the project's `uploadedAudioIds`.
 */
export async function cleanupOrphanAudios(activeIds: string[]): Promise<void> {
    try {
        const db = await openDB();
        const activeSet = new Set(activeIds);

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(AUDIOS_STORE, "readwrite");
            const store = transaction.objectStore(AUDIOS_STORE);
            const request = store.openCursor();

            request.onsuccess = (event) => {
                const cursor = (event.target as IDBRequest<IDBCursorWithValue>).result;
                if (cursor) {
                    const audio = cursor.value as CachedAudioBlob;
                    if (!activeSet.has(audio.id)) {
                        cursor.delete();
                    }
                    cursor.continue();
                }
            };

            transaction.oncomplete = () => resolve();
            transaction.onerror = () => reject(transaction.error);
        });
    } catch (error) {
        console.error("Error cleaning orphan audios:", error);
    }
}

/**
 * Delete all persisted audio blobs. Used when clearing the project.
 */
export async function clearAllAudioBlobs(): Promise<void> {
    try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(AUDIOS_STORE, "readwrite");
            const store = transaction.objectStore(AUDIOS_STORE);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error clearing all audio blobs:", error);
        throw error;
    }
}

// ── Camera blob store ───────────────────────────────────────────────────
//
// The camera-overlay video that accompanies a recording is a separate blob
// from the main video. It is persisted here (keyed by the clip's
// `libraryVideoId`) so its ephemeral `blob:` URL can be regenerated on
// reload instead of being lost. The project snapshot references it via
// `cameraVideoId` (which holds the `libraryVideoId` of the clip that owns
// the camera track).

/**
 * Persist (or replace) the camera-overlay blob for a given clip.
 *
 * `cameraConfig` is optional; when provided it is stored alongside the blob so
 * the camera settings (shape, size, position, etc.) can be restored when the
 * clip is re-added from the videos library, not only on a full project reload.
 */
export async function saveCameraBlob(
    id: string,
    blob: Blob,
    mimeType: string,
    cameraConfig?: CameraConfig | null,
): Promise<CachedCameraBlob> {
    try {
        const db = await openDB();
        const data: CachedCameraBlob = {
            id,
            blob,
            mimeType,
            savedAt: Date.now(),
            cameraConfig: cameraConfig ?? null,
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(CAMERA_STORE, "readwrite");
            const store = transaction.objectStore(CAMERA_STORE);
            const request = store.put(data);

            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error saving camera blob:", error);
        throw error;
    }
}

/**
 * Read a persisted camera blob by id.
 */
export async function getCameraBlob(id: string): Promise<CachedCameraBlob | null> {
    try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(CAMERA_STORE, "readonly");
            const store = transaction.objectStore(CAMERA_STORE);
            const request = store.get(id);

            request.onsuccess = () => resolve(request.result ?? null);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error getting camera blob:", error);
        return null;
    }
}

/**
 * Delete a persisted camera blob by id.
 */
export async function deleteCameraBlob(id: string): Promise<void> {
    try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(CAMERA_STORE, "readwrite");
            const store = transaction.objectStore(CAMERA_STORE);
            const request = store.delete(id);

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error deleting camera blob:", error);
        throw error;
    }
}

/**
 * Delete all persisted camera blobs. Used when clearing the project.
 */
export async function clearAllCameraBlobs(): Promise<void> {
    try {
        const db = await openDB();

        return new Promise((resolve, reject) => {
            const transaction = db.transaction(CAMERA_STORE, "readwrite");
            const store = transaction.objectStore(CAMERA_STORE);
            const request = store.clear();

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error clearing all camera blobs:", error);
        throw error;
    }
}

/**
 * Delete the project and all its associated blobs (audios + camera).
 */
export async function clearVideoProjectAndAudios(): Promise<void> {
    await Promise.all([clearVideoProject(), clearAllAudioBlobs(), clearAllCameraBlobs()]);
}
