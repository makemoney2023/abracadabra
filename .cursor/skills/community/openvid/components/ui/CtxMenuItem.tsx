import { Icon } from "@iconify/react";

export default function CtxMenuItem({
  icon,
  label,
  onClick,
  danger = false,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[11.5px] transition-colors text-left ${danger ? "text-destructive hover:bg-destructive/10" : "text-popover-foreground/80 hover:bg-muted"
        }`}
    >
      <Icon icon={icon} className="size-3.5 shrink-0 opacity-70" />
      {label}
    </button>
  );
}