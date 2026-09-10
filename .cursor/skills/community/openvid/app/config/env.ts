export const env = {
    unsplash: {
        accessKey: process.env.UNSPLASH_ACCESS_KEY ?? "",
    },
    pexels: {
        apiKey: process.env.PEXELS_API_KEY ?? "",
    },
    pixabay: {
        apiKey: process.env.PIXABAY_API_KEY ?? "",
    },
} as const;
