import { NavLink, Outlet } from "react-router-dom";
import { isLocalStore } from "../lib/repo";

const NAV = [
  { to: "/", label: "Dashboard", end: true },
  { to: "/generate", label: "Generate" },
  { to: "/drafts", label: "Drafts" },
  { to: "/calendar", label: "Calendar" },
  { to: "/catalogue", label: "Catalogue" },
  { to: "/media", label: "Media" },
  { to: "/brand", label: "Brand voice" },
];

export default function Layout() {
  return (
    <div className="min-h-screen md:flex">
      <aside className="border-b border-warm bg-warm-white md:min-h-screen md:w-60 md:shrink-0 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 px-6 py-6">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-charcoal text-cream font-black">
            P
          </div>
          <div className="leading-tight">
            <div className="font-extrabold tracking-tight">Postly</div>
            <div className="label-mono !text-[9px]">Social Autopilot</div>
          </div>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-3 pb-3 md:flex-col md:gap-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                [
                  "whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors",
                  isActive
                    ? "bg-charcoal text-cream"
                    : "text-mid hover:bg-cream hover:text-charcoal",
                ].join(" ")
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className="flex-1">
        {isLocalStore && (
          <div className="border-b border-warm bg-terracotta/10 px-6 py-2.5 text-center text-xs font-medium text-terracotta">
            Local mode — data is saved in this browser. Add Supabase keys to sync to the cloud.
          </div>
        )}
        <div className="mx-auto max-w-5xl px-6 py-8 md:py-10">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
