/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(0 0% 100%)",
        foreground: "hsl(222.2 47.4% 11.2%)",
        border: "hsl(214.3 31.8% 91.4%)",
        accent: "hsl(210 40% 96.1%)",
      },
    },
  },
  plugins: [],
};
