import type { ReactNode } from "react";

export function PageHeader({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <div className="label-mono mb-2">{eyebrow}</div>
        <h1 className="text-4xl md:text-5xl">{title}</h1>
      </div>
      {children && <div className="flex gap-2">{children}</div>}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 py-16 text-center">
      <div className="font-extrabold text-lg">{title}</div>
      <div className="max-w-sm text-sm text-mid">{hint}</div>
    </div>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return <div className="py-10 text-center text-sm text-mid">{label}</div>;
}
