import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";

interface DropMediaProps {
  mediaType: "image" | "video";
}

export default function DropMedia({ mediaType }: DropMediaProps) {
  const t = useTranslations("dropMedia");
  const isVideo = mediaType === "video";

  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
      <div className="flex flex-col items-center gap-4 text-white mask-[radial-gradient(circle,black_70%,transparent_99%)]">
        <Icon
          icon={isVideo ? "mage:video-upload" : "hugeicons:image-upload"}
          width="120"
        />
        <div className="text-3xl font-extrabold uppercase tracking-wider">
          {isVideo ? t("titleVideo") : t("titleImage")}
        </div>
      </div>
    </div>
  );
}