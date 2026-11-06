// Polaris <s-select> reads the chosen value from the `selected` attribute of its options when it first renders.
// A plain `value` prop is lost in server-rendered HTML, so the saved choice must be marked on the option.
export function Select({
  label,
  name,
  value,
  options,
}: {
  label: string;
  name: string;
  value: string;
  options: readonly (readonly [string, string])[];
}) {
  return (
    <s-select label={label} name={name} value={value}>
      {options.map(([v, text]) => (
        <s-option key={v} value={v} selected={v === value ? true : undefined}>
          {text}
        </s-option>
      ))}
    </s-select>
  );
}
