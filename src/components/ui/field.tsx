import {
  cloneElement,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";

export function Field({
  label,
  error,
  children,
  hint,
  required = false,
  optionalLabel,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  required?: boolean;
  optionalLabel?: string;
}) {
  const child = isValidElement(children)
    ? (children as ReactElement<Record<string, unknown>>)
    : null;
  const fieldKey = String(
    child?.props.name ?? child?.props.id ?? label,
  ).replace(/[^a-zA-Z0-9_-]/g, "-");
  const hintId = hint ? `${fieldKey}-hint` : undefined;
  const errorId = error ? `${fieldKey}-error` : undefined;
  const existingDescription = child?.props["aria-describedby"];
  const describedBy = [
    typeof existingDescription === "string" ? existingDescription : undefined,
    hintId,
    errorId,
  ]
    .filter(Boolean)
    .join(" ");
  const control = child
    ? cloneElement(child, {
        "aria-describedby": describedBy || undefined,
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
      })
    : children;

  return (
    <label className="block space-y-2">
      <span className="flex items-baseline gap-2 text-base font-medium text-foreground">
        <span>{label}</span>
        {required ? (
          <span className="text-sm text-danger" aria-hidden="true">
            *
          </span>
        ) : optionalLabel ? (
          <span className="text-xs font-normal text-muted">
            {optionalLabel}
          </span>
        ) : null}
      </span>
      {control}
      {hint ? (
        <span id={hintId} className="block text-sm text-muted">
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errorId} className="block text-sm text-danger" role="alert">
          {error}
        </span>
      ) : null}
    </label>
  );
}
