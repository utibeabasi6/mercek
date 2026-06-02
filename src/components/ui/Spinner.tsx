export function Spinner({ className = "size-3.5" }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="loading"
      style={{ animation: "mercek-spin 0.6s linear infinite" }}
      className={`inline-block shrink-0 rounded-full border-2 border-border-strong border-t-accent ${className}`}
    />
  );
}
