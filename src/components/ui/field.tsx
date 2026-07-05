export function Field({
  label,
  error,
  children,
  hint,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-base font-medium text-foreground">{label}</span>
      {children}
      {hint ? <span className="block text-sm text-muted">{hint}</span> : null}
      {error ? (
        <span className="block text-sm text-danger">{error}</span>
      ) : null}
    </label>
  );
}
