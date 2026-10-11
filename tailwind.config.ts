import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-arabic)", "Tahoma", "Arial", "sans-serif"],
      },
      colors: {
        // لوحة ألوان المحل | shop palette
        cream: "#FFF9F0",
        berry: "#D6336C",
        mint: "#2FA18C",
        choco: "#5B3A24",
      },
    },
  },
  plugins: [],
} satisfies Config;
