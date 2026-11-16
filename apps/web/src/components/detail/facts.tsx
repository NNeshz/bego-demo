import type { ReactNode } from "react";

export function Facts({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-3xl border bg-border">
      {items.map((item) => (
        <div key={item.label} className="flex flex-col gap-0.5 bg-card px-4 py-3">
          <dt className="text-xs text-muted-foreground">{item.label}</dt>
          <dd className="tabular font-medium">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="eyebrow">{title}</h2>
      {children}
    </section>
  );
}
