import type { ExportQuality } from "@/types";

const PENDING_EXPORT_KEY = "openvid:pendingExport";

export function savePendingExport(quality: ExportQuality): void {
  try {
    sessionStorage.setItem(PENDING_EXPORT_KEY, quality);
  } catch {
  }
}

export function readPendingExport(): ExportQuality | null {
  try {
    const value = sessionStorage.getItem(PENDING_EXPORT_KEY);
    return value !== null ? (value as ExportQuality) : null;
  } catch {
    return null;
  }
}

export function clearPendingExport(): void {
  try {
    sessionStorage.removeItem(PENDING_EXPORT_KEY);
  } catch {
  }
}
