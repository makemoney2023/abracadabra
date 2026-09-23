import { normalizeDomain } from "@/lib/domain";

export function UrlField({
  id,
  value,
  onChange,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
}) {
  let note = "We'll read the public pages while you finish the rest.";
  if (value.trim()) {
    try {
      const normalized = normalizeDomain(value);
      note = `We'll read ${normalized.domain} while you finish.`;
    } catch (err) {
      note = err instanceof Error ? err.message : "Enter a full website address.";
    }
  }
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="text-sm font-medium">
        Website
      </label>
      <input
        id={id}
        type="url"
        inputMode="url"
        autoComplete="url"
        value={value}
        aria-describedby={`${id}-note`}
        className="border-input bg-background min-h-11 w-full rounded-md border px-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
      />
      <p id={`${id}-note`} className="text-sm text-muted-foreground">
        {note}
      </p>
    </div>
  );
}
