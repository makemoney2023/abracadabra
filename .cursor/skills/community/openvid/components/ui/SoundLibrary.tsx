"use client";
import type { SoundName } from "@/lib/sounds";
import { SoundCard } from "./SoundCard";

type SoundLibraryProps = {
  categories: { label: string; sounds: SoundName[] }[];
  renderingSound: SoundName | null;
  onAdd: (sound: SoundName) => void;
};

export function SoundLibrary({ categories, renderingSound, onAdd }: SoundLibraryProps) {
  return (
    <div className="flex flex-col gap-4">
      {categories.map(({ label, sounds }) => (
        <div key={label} className="flex flex-col gap-1.5">
          <div className="text-[12px] tracking-wide text-muted-foreground">{label}</div>
          <div className="grid grid-cols-2 gap-1.5">
            {sounds.map((sound) => (
              <SoundCard key={sound} sound={sound} isRendering={renderingSound === sound} onAdd={onAdd} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}