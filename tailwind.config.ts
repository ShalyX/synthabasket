import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "rgb(var(--background-rgb) / <alpha-value>)",
        surface: {
          DEFAULT: "rgb(var(--surface-rgb) / <alpha-value>)",
          subtle: "rgb(var(--surface-subtle-rgb) / <alpha-value>)",
          elevated: "rgb(var(--surface-elevated-rgb) / <alpha-value>)",
          hover: "rgb(var(--surface-hover-rgb) / <alpha-value>)",
        },
        border: {
          subtle: "rgb(var(--border-subtle-rgb) / <alpha-value>)",
          DEFAULT: "rgb(var(--border-rgb) / <alpha-value>)",
          strong: "rgb(var(--border-strong-rgb) / <alpha-value>)",
        },
        brand: {
          primary: "#00d182", // Institutional emerald
          dim: "#00a868",
          warning: "#ff5a36", // International orange for basis divergence
          info: "#3b82f6",
        },
        solana: {
          green: "#00d182",
          purple: "#6366f1", // Subdued indigo replacing neon purple
          dark: "#000000",
        },
        accent: {
          DEFAULT: "#00d182",
          muted: "#00a868",
          glow: "rgba(0, 209, 130, 0.08)",
        },
        ink: {
          primary: "rgb(var(--ink-primary-rgb) / <alpha-value>)",
          secondary: "rgb(var(--ink-secondary-rgb) / <alpha-value>)",
          tertiary: "rgb(var(--ink-tertiary-rgb) / <alpha-value>)",
          disabled: "rgb(var(--ink-disabled-rgb) / <alpha-value>)",
        },
        semantic: {
          positive: "#00d182",
          negative: "#ef4444",
          warning: "#f59e0b",
          info: "#3b82f6",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "JetBrains Mono", "Geist Mono", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
