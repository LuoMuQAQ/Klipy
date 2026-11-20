const { heroui } = require("@heroui/react");

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
    "./node_modules/@heroui/**/dist/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"MiSans VF"', '"Segoe UI"', '"PingFang SC"', '"Microsoft YaHei"', "sans-serif"],
        mono: ['"MiSans VF"', '"Segoe UI"', "monospace"]
      }
    },
  },
  darkMode: "class",
  plugins: [
    heroui({
      defaultTheme: "light",
      themes: {
        light: {
          colors: {
            background: "#f5f7fa",
            foreground: "#11181c",
            content1: "#ffffff",
            content2: "#f1f5f9",
            primary: {
              DEFAULT: "#4f46e5",
              foreground: "#ffffff"
            },
            success: {
              DEFAULT: "#10b981",
              foreground: "#ffffff"
            },
            warning: {
              DEFAULT: "#f59e0b",
              foreground: "#ffffff"
            },
            danger: {
              DEFAULT: "#ef4444",
              foreground: "#ffffff"
            },
            focus: "#6366f1"
          }
        }
      }
    })
  ],
};
