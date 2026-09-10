const DB_NAME = "openvid-uploaded-images";
const DB_VERSION = 1;
const STORE_NAME = "images";
const SINGLE_IMAGE_KEY = "current-uploaded-image";

export interface CachedUploadedImage {
    key: string;
    blob: Blob;
    fileName: string;
    fileSize: number;
    width: number;
    height: number;
    aspectRatio: string;
    uploadedAt: number;
}

let dbInstance: IDBDatabase | null = null;

/**
 * Open IndexedDB connection for images
 */
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
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                const store = db.createObjectStore(STORE_NAME, { keyPath: "key" });
                store.createIndex("uploadedAt", "uploadedAt", { unique: false });
            }
        };
    });
}

/**
 * Get image metadata from file
 */
async function getImageMetadata(file: File): Promise<{
    width: number;
    height: number;
    aspectRatio: string;
}> {
    return new Promise((resolve, reject) => {
        const img = new Image();
        
        img.onload = () => {
            const metadata = {
                width: img.naturalWidth,
                height: img.naturalHeight,
                aspectRatio: "auto",
            };
            URL.revokeObjectURL(img.src);
            resolve(metadata);
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(img.src);
            reject(new Error("Failed to load image metadata"));
        };
        
        img.src = URL.createObjectURL(file);
    });
}

/**
 * Save uploaded image (replaces any existing image)
 */
export async function saveUploadedImage(file: File): Promise<CachedUploadedImage> {
    try {
        const db = await openDB();
        const metadata = await getImageMetadata(file);
        
        const data: CachedUploadedImage = {
            key: SINGLE_IMAGE_KEY,
            blob: file,
            fileName: file.name,
            fileSize: file.size,
            width: metadata.width,
            height: metadata.height,
            aspectRatio: metadata.aspectRatio,
            uploadedAt: Date.now(),
        };

        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            
            // Delete existing image first
            store.delete(SINGLE_IMAGE_KEY);
            
            // Save new image
            const request = store.put(data);
            request.onsuccess = () => resolve(data);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error saving uploaded image:", error);
        throw error;
    }
}

/**
 * Get uploaded image from cache
 */
export async function getUploadedImage(): Promise<CachedUploadedImage | null> {
    try {
        const db = await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readonly");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.get(SINGLE_IMAGE_KEY);
            
            request.onsuccess = () => resolve(request.result || null);
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error getting uploaded image:", error);
        return null;
    }
}

/**
 * Delete uploaded image from cache
 */
export async function deleteUploadedImage(): Promise<void> {
    try {
        const db = await openDB();
        
        return new Promise((resolve, reject) => {
            const transaction = db.transaction([STORE_NAME], "readwrite");
            const store = transaction.objectStore(STORE_NAME);
            const request = store.delete(SINGLE_IMAGE_KEY);
            
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    } catch (error) {
        console.error("Error deleting uploaded image:", error);
        throw error;
    }
}

/**
 * Check if there's an uploaded image
 */
export async function hasUploadedImage(): Promise<boolean> {
    const image = await getUploadedImage();
    return image !== null;
}

/**
 * Create object URL for cached image
 */
export function createImageUrl(cachedImage: CachedUploadedImage): string {
    return URL.createObjectURL(cachedImage.blob);
}
