/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        cream: "#F5F0E8",
        "warm-white": "#FAF7F2",
        sage: "#7A8C76",
        "sage-brand": "#5d7a63",
        "sage-light": "#B8C4B4",
        terracotta: "#5d7a63",
        "brand-dark": "#163441",
        charcoal: "#163441",
        mid: "#6B6560",
        // Kerry shipping module — palette lifted from the rate-card reference card
        "kerry-bg": "#EFEAE1",
        "kerry-panel": "#F6F2EA",
        "kerry-ink": "#241F1B",
        "kerry-rust": "#C0603C",
        "kerry-rust-dark": "#A24D2E",
        "kerry-muted": "#8C8378",
      },
      fontFamily: {
        serif: ["'Cormorant Garamond'", "serif"],
        sans: ["'Jost'", "sans-serif"],
        slab: ["'Roboto Slab'", "Georgia", "serif"],
      },
      borderColor: {
        warm: "rgba(44,41,38,0.12)",
        strong: "rgba(44,41,38,0.25)",
        kerry: "rgba(36,31,27,0.12)",
        "kerry-strong": "rgba(36,31,27,0.22)",
      },
    },
  },
  plugins: [],
};
