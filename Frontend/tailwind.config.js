/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./pages/**/*.{js,jsx}", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          dark: "#2A195C",
          accent: "#CDFF64",
          light: "#E7E0FF",
          soft: "#D4C6FF",
          medium: "#A286DC",
        },
        evegah: {
          bg: "#F6F7FB",
          card: "#FFFFFF",
          border: "#E5E7EB",
          text: "#111827",
          muted: "#6B7280",
          primary: "#2A195C",
          accent: "#CDFF64",
        },
      },
      fontFamily: {
        primary: ["Metropolis", "Poppins", "sans-serif"],
      },
      borderRadius: {
        xl: "14px",
        "2xl": "18px",
      },
      boxShadow: {
        soft: "0 4px 20px rgba(0,0,0,0.06)",
        card: "0 2px 10px rgba(0,0,0,0.04)",
      },
    },
  },
  plugins: [],
};
