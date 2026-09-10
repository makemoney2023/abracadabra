import { NextResponse } from "next/server";
import { env } from "@/app/config/env";

export interface UnifiedPhoto {
    id: string;
    urls: { regular: string; small: string };
    alt: string;
    photographer: string;
    color: string;
    width: number;
    height: number;
}

type Provider = "unsplash" | "pexels" | "pixabay";
const PROVIDERS: Provider[] = ["unsplash", "pexels", "pixabay"];

let providerIndex = 0;
function getNextProvider(): Provider {
    const provider = PROVIDERS[providerIndex];
    providerIndex = (providerIndex + 1) % PROVIDERS.length;
    return provider;
}

interface UnsplashPhoto {
    id: string;
    urls: { regular: string; small: string };
    alt_description: string | null;
    user: { name: string };
    color: string;
    width: number;
    height: number;
}

async function fetchUnsplash(query: string, page: number, perPage: number): Promise<UnifiedPhoto[]> {
    if (!env.unsplash.accessKey) return [];
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&orientation=landscape`;
    try {
        const res = await fetch(url, {
            headers: { Authorization: `Client-ID ${env.unsplash.accessKey}` },
        });
        if (!res.ok) return [];
        const data = await res.json();
        const results: UnsplashPhoto[] = data.results ?? [];
        return results.map((photo) => ({
            id: `unsplash-${photo.id}`,
            urls: { regular: photo.urls.regular, small: photo.urls.small },
            alt: photo.alt_description ?? "",
            photographer: photo.user.name,
            color: photo.color,
            width: photo.width,
            height: photo.height,
        }));
    } catch {
        return [];
    }
}

interface PexelsPhoto {
    id: number;
    width: number;
    height: number;
    photographer: string;
    avg_color: string;
    src: { large: string; medium: string };
    alt: string;
}

async function fetchPexelsRaw(url: string): Promise<UnifiedPhoto[]> {
    if (!env.pexels.apiKey) return [];
    try {
        const res = await fetch(url, {
            headers: { Authorization: env.pexels.apiKey },
        });
        if (!res.ok) return [];
        const data = await res.json();
        const results: PexelsPhoto[] = data.photos ?? [];
        return results.map((photo) => ({
            id: `pexels-${photo.id}`,
            urls: { regular: photo.src.large, small: photo.src.medium },
            alt: photo.alt || "",
            photographer: photo.photographer,
            color: photo.avg_color,
            width: photo.width,
            height: photo.height,
        }));
    } catch {
        return [];
    }
}

async function fetchPexels(query: string, page: number, perPage: number): Promise<UnifiedPhoto[]> {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&orientation=landscape`;
    return fetchPexelsRaw(url);
}

interface PixabayPhoto {
    id: number;
    imageWidth: number;
    imageHeight: number;
    user: string;
    tags: string;
    webformatURL: string;
    largeImageURL: string;
}

async function fetchPixabay(query: string, page: number, perPage: number): Promise<UnifiedPhoto[]> {
    if (!env.pixabay.apiKey) return [];
    const url = `https://pixabay.com/api/?key=${env.pixabay.apiKey}&q=${encodeURIComponent(query)}&page=${page}&per_page=${perPage}&orientation=horizontal&image_type=photo`;
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        const results: PixabayPhoto[] = data.hits ?? [];
        return results.map((photo) => ({
            id: `pixabay-${photo.id}`,
            urls: { regular: photo.largeImageURL, small: photo.webformatURL },
            alt: photo.tags,
            photographer: photo.user,
            color: "#1a1a1a",
            width: photo.imageWidth,
            height: photo.imageHeight,
        }));
    } catch {
        return [];
    }
}

async function fetchUnsplashCurated(page: number, perPage: number): Promise<UnifiedPhoto[]> {
    const queries = [
        "blur gradient", "mesh gradient", "dark minimal wallpaper", "neon city night",
        "abstract wave dark", "geometric dark background",
        "deep space stars", "aurora sky", "minimal texture dark",
    ];
    const query = queries[Math.floor(Math.random() * queries.length)];
    return fetchUnsplash(query, page, perPage);
}

async function fetchPexelsCurated(page: number, perPage: number): Promise<UnifiedPhoto[]> {
    const url = `https://api.pexels.com/v1/curated?page=${page}&per_page=${perPage}`;
    const results = await fetchPexelsRaw(url);
    return results.filter((photo) => photo.width >= photo.height);
}

async function fetchPixabayCurated(page: number, perPage: number): Promise<UnifiedPhoto[]> {
    const queries = [
        "blur gradient", "dark minimal", "city dark", "blurred",
        "night sky", "minimalist background", "wallpaper sky",
    ];
    const query = queries[Math.floor(Math.random() * queries.length)];
    return fetchPixabay(query, page, perPage);
}

const discoveryCache: { photos: UnifiedPhoto[]; timestamp: number } = {
    photos: [],
    timestamp: 0,
};
const DISCOVERY_TTL = 5 * 60 * 1000;

async function getDiscovery(): Promise<UnifiedPhoto[]> {
    if (
        discoveryCache.photos.length > 0 &&
        Date.now() - discoveryCache.timestamp < DISCOVERY_TTL
    ) {
        return [...discoveryCache.photos].sort(() => Math.random() - 0.5);
    }

    const [unsplashPhotos, pexelsPhotos, pixabayPhotos] = await Promise.all([
        fetchUnsplashCurated(1, 7).catch(() => []),
        fetchPexelsCurated(1, 7).catch(() => []),
        fetchPixabayCurated(1, 6).catch(() => []),
    ]);

    const allPhotos = [...unsplashPhotos, ...pexelsPhotos, ...pixabayPhotos];
    const shuffled = allPhotos.sort(() => Math.random() - 0.5);

    discoveryCache.photos = shuffled;
    discoveryCache.timestamp = Date.now();

    return shuffled;
}

async function getSearch(query: string, page: number, perPage: number): Promise<UnifiedPhoto[]> {
    const provider = getNextProvider();
    switch (provider) {
        case "unsplash": return fetchUnsplash(query, page, perPage);
        case "pexels":   return fetchPexels(query, page, perPage);
        case "pixabay":  return fetchPixabay(query, page, perPage);
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get("mode") ?? "search";
    const query = searchParams.get("q") ?? "";
    const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
    const perPage = Math.min(50, Math.max(1, Number(searchParams.get("perPage") ?? "20") || 20));

    if (mode === "discovery") {
        const photos = await getDiscovery();
        return NextResponse.json({ photos });
    }

    if (!query) {
        return NextResponse.json({ photos: [] });
    }

    const photos = await getSearch(query, page, perPage);
    return NextResponse.json({ photos });
}
