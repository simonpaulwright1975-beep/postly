/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Palette lifted from the printed Kerry Logistics rate card.
        "kerry-bg": "#EFEAE1",
        "kerry-panel": "#F6F2EA",
        "kerry-ink": "#241F1B",
        "kerry-rust": "#C0603C",
        "kerry-rust-dark": "#A24D2E",
        "kerry-muted": "#8C8378",
      },
      fontFamily: {
        sans: ["'Jost'", "sans-serif"],
        slab: ["'Roboto Slab'", "Georgia", "serif"],
        mono: ["'JetBrains Mono'", "monospace"],
      },
      borderColor: {
        kerry: "rgba(36,31,27,0.12)",
        "kerry-strong": "rgba(36,31,27,0.22)",
      },
    },
  },
  plugins: [],
};
