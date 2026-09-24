export function TextField({
  id,
  label,
  value,
  maxLength,
  suggestions,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  maxLength: number;
  suggestions?: string[];
  onChange: (value: string) => void;
}) {
  const listId = `${id}-suggestions`;
  return (
    <div className="space-y-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        maxLength={maxLength}
        rows={4}
        aria-describedby={`${id}-count`}
        className="studio-field min-h-28 py-2 text-sm"
        onChange={(event) => onChange(event.target.value)}
      />
      {suggestions?.length ? (
        <div id={listId} className="flex flex-wrap gap-2">
          {suggestions.map((item) => (
            <button
              key={item}
              type="button"
              className="studio-chip min-h-9 px-2 py-1 text-xs"
              onClick={() => onChange(item)}
            >
              {item}
            </button>
          ))}
        </div>
      ) : null}
      <p id={`${id}-count`} className="text-xs text-muted-foreground">
        {value.length} / {maxLength}
      </p>
    </div>
  );
}
