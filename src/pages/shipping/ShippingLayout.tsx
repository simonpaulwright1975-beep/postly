import { NavLink, Outlet } from "react-router-dom";
import Sunburst from "../../components/shipping/Sunburst";

const TABS = [
  { to: "/shipping", label: "Rate cards", end: true },
  { to: "/shipping/shipments", label: "Shipments", end: false },
  { to: "/shipping/compare", label: "Compare & tender", end: false },
];

export default function ShippingLayout() {
  return (
    <div className="kerry -mx-6 -my-8 min-h-[calc(100vh-1px)] bg-kerry-bg px-6 py-8 md:-my-10 md:py-10">
      <div className="mx-auto max-w-5xl">
        {/* Header — styled after the printed rate card */}
        <header className="relative">
          <div className="mb-5 h-1 w-14 rounded-full bg-kerry-rust" />
          <div className="kerry-eyebrow mb-3">Shipping / Rate calculator</div>
          <div className="flex items-start justify-between gap-6">
            <div>
              <h1 className="kerry-display text-4xl leading-[0.95] md:text-6xl">
                Shipping rates<span className="text-kerry-rust">.</span>
              </h1>
              <p className="mt-3 max-w-xl text-base text-kerry-ink/80">
                Record your carrier rate cards, estimate the cost of every box you ship, and
                compare quotes when you go out to tender.
              </p>
            </div>
            <Sunburst className="hidden h-24 w-24 shrink-0 text-kerry-rust sm:block" />
          </div>
          <div className="kerry-rule mt-6" />
        </header>

        {/* Tabs */}
        <nav className="mt-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                [
                  "rounded-full px-5 py-2.5 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-kerry-ink text-kerry-panel"
                    : "border border-kerry text-kerry-ink hover:bg-kerry-panel",
                ].join(" ")
              }
            >
              {t.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-8">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
