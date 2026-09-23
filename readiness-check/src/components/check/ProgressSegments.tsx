const SECTIONS = [
  { id: "pressure", label: "Pressure" },
  { id: "readiness", label: "Readiness" },
  { id: "growth", label: "Growth" },
  { id: "about", label: "About" },
] as const;

export function ProgressSegments({ active }: { active: number }) {
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Check progress">
      {SECTIONS.map((section, index) => {
        const state = index < active ? "done" : index === active ? "current" : "upcoming";
        return (
          <li key={section.id} className="space-y-1">
            <div
              className={`h-1.5 rounded-full ${state === "upcoming" ? "bg-muted" : "bg-primary"}`}
              aria-hidden
            />
            <span className={`block text-xs ${state === "current" ? "font-medium" : "text-muted-foreground"}`}>
              {section.label}
              {state === "current" ? <span className="sr-only">, current section</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
