import { SHORTCUTS } from "@/components/shortcut-list";
import { requireHqStaffPage } from "@/lib/current";

export default async function ShortcutsPage() {
  await requireHqStaffPage();
  return (
    <ul className="flex flex-col gap-2">
      {SHORTCUTS.map((shortcut) => (
        <li key={shortcut.keys} className="flex items-center justify-between gap-4 text-sm">
          <span>{shortcut.label}</span>
          <kbd className="font-mono text-[11px] text-muted-foreground">{shortcut.keys}</kbd>
        </li>
      ))}
    </ul>
  );
}
