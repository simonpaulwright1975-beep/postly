export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="py-10 text-center text-sm text-kerry-muted">{label}</div>;
}
