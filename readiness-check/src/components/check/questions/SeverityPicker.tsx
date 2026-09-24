export function SeverityPicker({
  options,
  value,
  onChange,
}: {
  options: Array<{ score: 1 | 2 | 3; label: string }>;
  value: number | null;
  onChange: (score: 1 | 2 | 3) => void;
}) {
  return (
    <div className="grid gap-2" role="radiogroup" aria-label="How much it costs you">
      {options.map((option) => {
        const selected = value === option.score;
        return (
          <button
            key={option.score}
            type="button"
            role="radio"
            aria-checked={selected}
            className="studio-choice text-sm"
            onClick={() => onChange(option.score)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
