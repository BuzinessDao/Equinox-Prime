/** @type {import('tailwindcss').Config} */
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        equinox: {
          dark: "#0a0e1a",
          card: "#111827",
          border: "#1f2937",
          accent: "#6366f1",
          success: "#10b981",
          warn: "#f59e0b",
        },
      },
    },
  },
  plugins: [],
};
