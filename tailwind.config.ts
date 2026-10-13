import type { Config } from "tailwindcss";

// ألوان JAC ICE من الشعار | the JAC ICE palette, taken from the logo.
export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["'Readex Pro Variable'", "'Readex Pro'", "Tahoma", "Arial", "sans-serif"],
      },
      colors: {
        // أزرق السماء — لون الشعار | sky blue, the badge
        sky: {
          50: "#EAF8FE",
          100: "#D2F0FC",
          200: "#A6E1F9",
          300: "#6ECEF5",
          DEFAULT: "#00ADEF",
          500: "#00ADEF",
          600: "#0094CE",
          700: "#0074A3", // text-safe blue on white
          800: "#055A7D",
        },
        // أصفر الليمون — لون "ICE" والكون | lemon, the cone
        lemon: {
          50: "#FDFEE8",
          100: "#FAFBC9",
          200: "#F4F68F",
          DEFAULT: "#E9ED1D",
          500: "#E9ED1D",
          600: "#C9CD0E",
        },
        // الفحمي — حروف JAC | charcoal, the letters
        ink: {
          50: "#F5F6F7",
          100: "#E9EBED",
          200: "#D3D7DB",
          300: "#AEB4BA",
          400: "#7D858D",
          500: "#59616A",
          600: "#3E454C",
          700: "#2E3338",
          DEFAULT: "#282828",
          800: "#232629",
          900: "#181A1C",
        },
        cone: "#F9A72B",
        paper: "#F3F7F9",
      },
      boxShadow: {
        card: "0 1px 2px rgba(24,26,28,.06), 0 4px 16px -6px rgba(24,26,28,.10)",
        lift: "0 10px 30px -10px rgba(24,26,28,.30)",
      },
      keyframes: {
        rise: { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        pop: { "0%": { transform: "scale(.96)", opacity: "0" }, "100%": { transform: "scale(1)", opacity: "1" } },
      },
      animation: {
        rise: "rise .28s ease-out both",
        pop: "pop .18s ease-out both",
      },
    },
  },
  plugins: [],
} satisfies Config;
