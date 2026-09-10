import { useState } from "react";

export function ProgressiveImg({
    src,
    alt,
    className,
}: {
    src: string;
    alt: string;
    className?: string;
}) {
    const [isLoaded, setIsLoaded] = useState(false);

    return (
        <img
            src={src}
            alt={alt}
            decoding="async"
            loading="lazy"
            onLoad={() => setIsLoaded(true)}
            className={`transition-all duration-500 ease-out ${isLoaded ? "opacity-100 blur-none scale-100" : "opacity-0 blur-sm scale-95"
                } ${className ?? ""}`}
        />
    );
}