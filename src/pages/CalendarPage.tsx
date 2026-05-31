import { useEffect, useMemo, useState } from "react";
import { getRepo, type PostWithVariants } from "../lib/repo";
import { PLATFORMS, type PostVariant } from "../lib/types";
import { PageHeader, Spinner } from "../components/ui";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function startOfMonthGrid(year: number, month: number): Date {
  const first = new Date(year, month, 1);
  const day = (first.getDay() + 6) % 7; // Monday-based
  return new Date(year, month, 1 - day);
}

export default function CalendarPage() {
  const [posts, setPosts] = useState<PostWithVariants[] | null>(null);
  const [cursor, setCursor] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });

  useEffect(() => {
    getRepo().listPosts().then(setPosts);
  }, []);

  const scheduled = useMemo(() => {
    const map = new Map<string, PostVariant[]>();
    (posts ?? []).forEach((p) =>
      p.variants.forEach((v) => {
        if (!v.scheduled_for) return;
        const key = new Date(v.scheduled_for).toDateString();
        map.set(key, [...(map.get(key) ?? []), v]);
      }),
    );
    return map;
  }, [posts]);

  if (!posts) return <Spinner />;

  const gridStart = startOfMonthGrid(cursor.year, cursor.month);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
  const monthLabel = new Date(cursor.year, cursor.month).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
  });
  const today = new Date().toDateString();

  function shift(delta: number) {
    setCursor((c) => {
      const d = new Date(c.year, c.month + delta);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }

  return (
    <div>
      <PageHeader eyebrow="Schedule" title="Calendar.">
        <button className="btn-ghost" onClick={() => shift(-1)}>
          ‹
        </button>
        <div className="flex items-center px-2 text-sm font-bold">{monthLabel}</div>
        <button className="btn-ghost" onClick={() => shift(1)}>
          ›
        </button>
      </PageHeader>

      <div className="card !p-0 overflow-hidden">
        <div className="grid grid-cols-7 border-b border-warm">
          {WEEKDAYS.map((d) => (
            <div key={d} className="label-mono px-3 py-2 text-center">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const inMonth = d.getMonth() === cursor.month;
            const items = scheduled.get(d.toDateString()) ?? [];
            return (
              <div
                key={i}
                className={[
                  "min-h-24 border-b border-r border-warm p-2",
                  inMonth ? "" : "bg-cream/40 text-mid/50",
                  d.toDateString() === today ? "ring-1 ring-inset ring-terracotta" : "",
                ].join(" ")}
              >
                <div className="mb-1 text-xs font-bold">{d.getDate()}</div>
                <div className="space-y-1">
                  {items.map((v) => (
                    <div
                      key={v.id}
                      title={v.body}
                      className="truncate rounded bg-sage/15 px-1.5 py-0.5 text-[10px] font-semibold text-sage-brand"
                    >
                      {PLATFORMS.find((p) => p.id === v.platform)?.label ?? v.platform}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
