export interface UnifiedPhoto {
    id: string;
    urls: {
        regular: string;
        small: string;
    };
    alt: string;
    photographer: string;
    color: string;
    width: number;
    height: number;
}

async function callApi(params: URLSearchParams): Promise<UnifiedPhoto[]> {
    try {
        const res = await fetch(`/api/photos?${params.toString()}`);
        if (!res.ok) return [];
        const data = (await res.json()) as { photos?: UnifiedPhoto[] };
        return data.photos ?? [];
    } catch {
        return [];
    }
}

export async function fetchPhotos(
    query: string,
    page = 1,
    perPage = 20
): Promise<UnifiedPhoto[]> {
    const params = new URLSearchParams({
        mode: "search",
        q: query,
        page: String(page),
        perPage: String(perPage),
    });
    return callApi(params);
}

export async function fetchDiscoveryPhotos(): Promise<UnifiedPhoto[]> {
    const params = new URLSearchParams({ mode: "discovery" });
    return callApi(params);
}

const searchCache = new Map<string, { photos: UnifiedPhoto[]; timestamp: number }>();
const SEARCH_TTL = 10 * 60 * 1000;

export async function fetchPhotosWithCache(
    query: string,
    page = 1,
    perPage = 20
): Promise<UnifiedPhoto[]> {
    const cacheKey = `${query}::${page}::${perPage}`;
    const cached = searchCache.get(cacheKey);

    if (cached && Date.now() - cached.timestamp < SEARCH_TTL) {
        return cached.photos;
    }

    const photos = await fetchPhotos(query, page, perPage);
    searchCache.set(cacheKey, { photos, timestamp: Date.now() });

    return photos;
}
