"use client";
import { useState } from "react";
import { Icon } from "@iconify/react";
import { play, type SoundName } from "@/lib/sounds";
import { SOUND_VISUALS } from "./sound-visuals";

type SoundCardProps = {
  sound: SoundName;
  isRendering: boolean;
  onAdd: (sound: SoundName) => void;
};

export function SoundCard({ sound, isRendering, onAdd }: SoundCardProps) {
  const [active, setActive] = useState(false);
  const Visual = SOUND_VISUALS[sound];

  const trigger = () => {
    if (active) return;
    setActive(true);
    play(sound);
  };

  return (
    <div
      className="flex items-center gap-2 px-2 py-2 rounded-md border border-border hover:border-foreground/30 hover:bg-muted/50 transition-colors"
      onMouseEnter={trigger}
      onMouseLeave={() => setActive(false)}
      onFocus={trigger}
      onBlur={() => setActive(false)}
      tabIndex={0}
      role="button"
      aria-label={sound}
    >
      <div className="w-9 h-8 shrink-0 flex items-center justify-center rounded bg-muted/60">
        <Visual active={active} />
      </div>
      <span className="flex-1 text-xs text-muted-foreground truncate">{sound}</span>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAdd(sound);
        }}
        disabled={isRendering}
        className="p-1 rounded text-muted-foreground/60 hover:text-blue-400 hover:bg-blue-500/10 shrink-0"
        aria-label={`add-${sound}`}
      >
        <Icon icon={isRendering ? "svg-spinners:180-ring" : "mdi:plus"} width="14" />
      </button>
    </div>
  );
}