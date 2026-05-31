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
      },
      fontFamily: {
        serif: ["'Cormorant Garamond'", "serif"],
        sans: ["'Jost'", "sans-serif"],
      },
      borderColor: {
        warm: "rgba(44,41,38,0.12)",
        strong: "rgba(44,41,38,0.25)",
      },
    },
  },
  plugins: [],
};
