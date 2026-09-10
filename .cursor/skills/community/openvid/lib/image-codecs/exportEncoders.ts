type EncodableImage = ImageData;

function toCanvasBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error(`Failed to encode ${type}`))),
            type,
            quality
        );
    });
}

function imageDataToCanvas(image: EncodableImage): HTMLCanvasElement {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("No 2D context available");
    ctx.putImageData(image, 0, 0);
    return canvas;
}

function hasWebpSignature(blob: Blob): Promise<boolean> {
    return blob.slice(0, 12).arrayBuffer().then((buffer) => {
        const bytes = new Uint8Array(buffer);
        return bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
            bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
    });
}

let avifSupport: Promise<boolean> | null = null;

function detectAvifSupport(): Promise<boolean> {
    if (!avifSupport) {
        avifSupport = (async () => {
            try {
                const probe = document.createElement("canvas");
                probe.width = 1;
                probe.height = 1;
                const ctx = probe.getContext("2d");
                if (!ctx) return false;
                ctx.fillRect(0, 0, 1, 1);
                const blob = await new Promise<Blob | null>((resolve) => probe.toBlob(resolve, "image/avif"));
                return !!blob && blob.type === "image/avif";
            } catch {
                return false;
            }
        })();
    }
    return avifSupport;
}

async function encodeViaServer(canvas: HTMLCanvasElement, format: "webp" | "avif", quality: number): Promise<Blob> {
    const intermediate = await toCanvasBlob(canvas, "image/png");
    const formData = new FormData();
    formData.append("image", intermediate, "export.png");
    formData.append("format", format);
    formData.append("quality", String(Math.round(quality * 100)));

    const response = await fetch("/api/export-image", { method: "POST", body: formData });
    if (!response.ok) {
        throw new Error(`Server encoding failed (${response.status})`);
    }
    const mime = format === "avif" ? "image/avif" : "image/webp";
    return new Blob([await response.blob()], { type: mime });
}

export async function encodePng(image: EncodableImage): Promise<Blob> {
    return toCanvasBlob(imageDataToCanvas(image), "image/png");
}

export async function encodeJpeg(image: EncodableImage, quality: number): Promise<Blob> {
    return toCanvasBlob(imageDataToCanvas(image), "image/jpeg", quality);
}

export async function encodeWebp(image: EncodableImage, quality: number): Promise<Blob> {
    const canvas = imageDataToCanvas(image);
    const blob = await toCanvasBlob(canvas, "image/webp", quality);
    if (await hasWebpSignature(blob)) return blob;
 
    return encodeViaServer(canvas, "webp", quality);
}

export async function encodeAvif(image: EncodableImage, quality: number): Promise<Blob> {
    if (await detectAvifSupport()) {
        return toCanvasBlob(imageDataToCanvas(image), "image/avif", quality);
    }
    return encodeViaServer(imageDataToCanvas(image), "avif", quality);
}
