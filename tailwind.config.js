/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "ms-cyan":    "#06ABEB",
        "ms-magenta": "#DC298D",
        "ms-navy":    "#212070",
        "ms-black":   "#00002D",
        "ms-gray": {
          100: "#F5F5F7",
          200: "#E8E8EA",
          400: "#AFAFB5",
          600: "#6E6E77",
          800: "#2D2D35",
        },
        "ms-cyan-10":    "#E8F7FD",
        "ms-cyan-20":    "#C2EAFA",
        "ms-navy-10":    "#E8E8F3",
        "ms-navy-20":    "#C5C5DE",
        "ms-magenta-10": "#FCE9F4",
      },
      fontFamily: {
        sans: ["Inter", "Helvetica Neue", "Arial", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      borderRadius: {
        card:  "8px",
        input: "6px",
      },
    },
  },
  plugins: [],
};
