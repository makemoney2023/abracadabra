"use client";

import Image from "next/image";
import { useState } from "react";

export function ArtifactThumbnail({
  src,
  title,
  fallback,
}: {
  src: string | null;
  title: string;
  fallback: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) return <span className="eyebrow text-optic">{fallback}</span>;
  return (
    <Image
      src={src}
      alt={`Preview of ${title}`}
      fill
      sizes="(min-width: 1280px) 25vw, (min-width: 640px) 50vw, 100vw"
      unoptimized
      className="absolute inset-0 h-full w-full object-cover"
      onError={() => setFailed(true)}
    />
  );
}
