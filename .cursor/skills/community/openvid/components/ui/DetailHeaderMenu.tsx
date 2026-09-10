import { Icon } from "@iconify/react";

export function DetailPageHeader({
  label,
  icon,
  onBack,
}: {
  label: string;
  icon: string;
  onBack: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onBack}
        className="flex items-center justify-center size-7 rounded-md hover:bg-muted text-foreground transition-colors"
        aria-label="Volver al inicio"
      >
        <Icon icon="ph:arrow-left-bold" width="13" />
      </button>
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <span className="text-md font-mediumtruncate">
          {label}
        </span>
      </div>
    </>
  );
}