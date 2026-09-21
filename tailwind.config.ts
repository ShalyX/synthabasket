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
        background: "#0c0d12",
        surface: {
          DEFAULT: "#13151d",
          subtle: "#171a24",
          elevated: "#1c202d",
          hover: "#232737",
        },
        border: {
          subtle: "#181b26",
          DEFAULT: "#222636",
          strong: "#33394e",
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
          dark: "#0c0d12",
        },
        accent: {
          DEFAULT: "#00d182",
          muted: "#00a868",
          glow: "rgba(0, 209, 130, 0.08)",
        },
        ink: {
          primary: "#f1f5f9",
          secondary: "#94a3b8",
          tertiary: "#64748b",
          disabled: "#475569",
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
