import type { SvgCategory, ImageCategory, ImageItem } from "@/types/canvas-elements.types";
export function getImagePreviewPath(item: { imagePath: string; previewPath?: string }): string {
    if (item.previewPath) return item.previewPath;
    return item.imagePath.replace(/\.webp$/, "-preview.webp");
}

function generateImageItems(
    folder: string,
    prefix: string,
    count: number,
    extension: string = "webp"
): ImageItem[] {
    return Array.from({ length: count }, (_, i) => {
        const num = (i + 1).toString().padStart(2, "0");
        const id = `${prefix}-${num}`;

        return {
            id: id,
            name: `${prefix.charAt(0).toUpperCase() + prefix.slice(1)} ${num}`,
            imagePath: `/elements/images/${folder}/${id}.${extension}`,
        };
    });
}

// Pinned SVG elements shown directly
export const PINNED_SVG_ITEMS = [
    { id: "rectangle", name: "Rectángulo", icon: "ph:rectangle-bold" },
    { id: "circle", name: "Círculo", icon: "ph:circle-bold" },
    { id: "triangle", name: "Triángulo", icon: "ph:triangle-bold" },
    { id: "arrow-right", name: "Derecha", icon: "ph:arrow-right-bold" },
    { id: "star", name: "Estrella", icon: "ph:star-bold" },
    { id: "heart", name: "Corazón", icon: "ph:heart-bold" },
    { id: "splash", name: "Salpicadura" },
    { id: "scribble", name: "Garabato" },
    { id: "blob", name: "Blob", icon: "tabler:blob-filled" },
    { id: "blob-outline", name: "Blob outline", icon: "tabler:blob" },
    { id: "chat", name: "Bocadillo", icon: "ph:chat-circle-bold" },
];

// Pinned image elements shown directly
export const PINNED_IMAGE_ITEMS = [
    { id: "overlay-01", name: "Overlay 1", imagePath: "/elements/images/overlays/overlay-01.webp" },
    { id: "overlay-11", name: "Overlay 11", imagePath: "/elements/images/overlays/overlay-11.webp" },
    { id: "overlay-06", name: "Overlay 6", imagePath: "/elements/images/overlays/overlay-06.webp" },
    { id: "overlay-04", name: "Overlay 4", imagePath: "/elements/images/overlays/overlay-04.webp" },
    { id: "overlay-05", name: "Overlay 5", imagePath: "/elements/images/overlays/overlay-05.webp" },
    { id: "overlay-07", name: "Overlay 7", imagePath: "/elements/images/overlays/overlay-07.webp" },
    { id: "overlay-08", name: "Overlay 8", imagePath: "/elements/images/overlays/overlay-08.webp" },
    { id: "overlay-09", name: "Overlay 9", imagePath: "/elements/images/overlays/overlay-09.webp" },
    { id: "overlay-14", name: "Overlay 14", imagePath: "/elements/images/overlays/overlay-14.webp" },
    { id: "overlay-15", name: "Overlay 15", imagePath: "/elements/images/overlays/overlay-15.webp" },
    { id: "asset-05", name: "Asset 5", imagePath: "/elements/images/assets/asset-05.webp" },
    { id: "asset-06", name: "Asset 6", imagePath: "/elements/images/assets/asset-06.webp" },
    { id: "asset-07", name: "Asset 7", imagePath: "/elements/images/assets/asset-07.webp" },
    { id: "sticker-01", name: "Sticker 1", imagePath: "/elements/images/stickers/sticker-01.webp" },
    { id: "sticker-04", name: "Sticker 4", imagePath: "/elements/images/stickers/sticker-04.webp" },
    { id: "sticker-03", name: "Sticker 3", imagePath: "/elements/images/stickers/sticker-03.webp" },
    { id: "sticker-05", name: "Sticker 5", imagePath: "/elements/images/stickers/sticker-05.webp" },
    { id: "sticker-11", name: "Sticker 11", imagePath: "/elements/images/stickers/sticker-11.webp" },
    { id: "sticker-39", name: "Sticker 39", imagePath: "/elements/images/stickers/sticker-39.webp" },
    { id: "sticker-46", name: "Sticker 46", imagePath: "/elements/images/stickers/sticker-46.webp" },
    { id: "sticker-60", name: "Sticker 60", imagePath: "/elements/images/stickers/sticker-60.webp" },
    { id: "sticker-61", name: "Sticker 61", imagePath: "/elements/images/stickers/sticker-61.webp" },
    { id: "sticker-62", name: "Sticker 62", imagePath: "/elements/images/stickers/sticker-62.webp" },
    { id: "sticker-63", name: "Sticker 63", imagePath: "/elements/images/stickers/sticker-63.webp" },
    { id: "sticker-69", name: "Sticker 69", imagePath: "/elements/images/stickers/sticker-69.webp" },
    { id: "sticker-70", name: "Sticker 70", imagePath: "/elements/images/stickers/sticker-70.webp" },
    { id: "sticker-71", name: "Sticker 71", imagePath: "/elements/images/stickers/sticker-71.webp" },
    { id: "sticker-72", name: "Sticker 72", imagePath: "/elements/images/stickers/sticker-72.webp" },
];

export const SVG_CATEGORIES: SvgCategory[] = [
    {
        id: "shapes",
        title: "Básicas",
        items: [
            { id: "rectangle", name: "Rectángulo", icon: "ph:rectangle-bold" },
            { id: "circle", name: "Círculo", icon: "ph:circle-bold" },
            { id: "triangle", name: "Triángulo", icon: "ph:triangle-bold" },
            { id: "hexagon", name: "Hexágono", icon: "ph:hexagon-bold" },
            { id: "diamond", name: "Rombo", icon: "ph:diamond-bold" },
            { id: "square", name: "Cuadrado", icon: "ph:square-bold" },
            { id: "blob", name: "Blob", icon: "tabler:blob-filled" },
            { id: "blob-outline", name: "Blob outline", icon: "tabler:blob" },
        ]
    },
    {
        id: "arrows",
        title: "Flechas",
        items: [
            { id: "arrow-right", name: "Derecha", icon: "ph:arrow-right-bold" },
            { id: "arrow-left", name: "Izquierda", icon: "ph:arrow-left-bold" },
            { id: "arrow-double", name: "Doble", icon: "ph:arrows-left-right-bold" },
            { id: "arrow-curve", name: "Curva", icon: "ph:arrow-u-up-left-bold" },
            { id: "arrow-diagonal", name: "Diagonal", icon: "ph:arrow-up-right-bold" },
            { id: "arrow-bend", name: "Ángulo", icon: "ph:arrow-bend-up-right-bold" },
            { id: "scribble", name: "Garabato" }
        ]
    },
    {
        id: "decorative",
        title: "Decorativas",
        items: [
            { id: "star", name: "Estrella", icon: "ph:star-bold" },
            { id: "heart", name: "Corazón", icon: "ph:heart-bold" },
            { id: "lightning", name: "Rayo", icon: "ph:lightning-bold" },
            { id: "chat", name: "Bocadillo", icon: "ph:chat-circle-bold" },
            { id: "seal", name: "Sello", icon: "ph:seal-bold" },
            { id: "drop", name: "Gota", icon: "ph:drop-bold" },
            { id: "splash", name: "Salpicadura" },
        ]
    }
];

export const IMAGE_CATEGORIES: ImageCategory[] = [
    {
        id: "overlays",
        title: "Superposiciones",
        items: [
            ...generateImageItems("overlays", "overlay", 15)
        ]
    },
    {
        id: "assets",
        title: "Recursos",
        items: [
            ...generateImageItems("assets", "asset", 7)
        ]
    },
    {
        id: "stickers",
        title: "Stickers",
        items: [
            ...generateImageItems("stickers", "sticker", 74)
        ]
    },
];
