export function MultiSelect({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: string; label: string }>;
  value: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label="Symptoms">
      {options.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={selected}
            className="studio-chip text-sm"
            onClick={() =>
              onChange(selected ? value.filter((item) => item !== option.value) : [...value, option.value])
            }
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
