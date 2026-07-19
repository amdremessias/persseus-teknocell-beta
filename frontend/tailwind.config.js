/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#F4F4F2",
        "bubble-agent": "#D9F5D6",
        "note-bg": "#FEF3DC",
        "note-border": "#F97316",
      },
      borderRadius: {
        card: "16px",
      },
      boxShadow: {
        card: "0 2px 12px rgba(0,0,0,0.06)",
      },
    },
  },
  plugins: [],
};
