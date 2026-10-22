export type PictureMedia = {
  role: string;
  video?: boolean;
  contentType?: string;
};

const PREFERRED = ["poster", "cover", "thumbnail", "square", "main"];

/** Still images, in the order a person should see them. Video is never a picture. */
export function pictureCandidates(media: PictureMedia[]): PictureMedia[] {
  return media.filter((item) => {
    if (!item.role) return false;
    if (item.video) return false;
    const type = item.contentType?.toLowerCase() ?? "";
    if (type.startsWith("video/")) return false;
    if (type && !type.startsWith("image/")) return false;
    return true;
  });
}

export function pictureRole(media: PictureMedia[]): string | null {
  const images = pictureCandidates(media);
  for (const name of PREFERRED) {
    const found = images.find((item) => item.role === name);
    if (found) return found.role;
  }
  return images[0]?.role ?? null;
}

export function pictureCount(media: PictureMedia[]): number {
  return pictureCandidates(media).length;
}

export function pictureAddress(deliverableId: string, itemId: string, role: string): string {
  return `/api/deliverables/${deliverableId}/items/${itemId}/media/${encodeURIComponent(role)}`;
}
