import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Same design tokens as e-Vet Field: Inter, the #01A85A green, green-tinted neutrals, and neutral dark greys (#121212 base, #1E1E1E cards, #272727 bars).
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#e6f6ee', 100: '#ccefdd', 200: '#9fe0bf', 300: '#7fe0ae', 400: '#34c47f', 500: '#01a85a', 600: '#018a4a', 700: '#016a39', 800: '#01542e', 900: '#183626', 950: '#10261b' },
        slate: { 50: '#f8faf9', 100: '#f1f4f2', 200: '#e6ebe8', 300: '#c9d1cc', 400: '#858c88', 500: '#5f6662', 600: '#4d524f', 700: '#3a3d3b', 800: '#2c2c2c', 900: '#1d1f1e', 950: '#121212' },
        surface: { DEFAULT: '#ffffff', dark: '#1e1e1e', bar: '#272727' },
        canvas: { DEFAULT: '#f8faf9', dark: '#121212' },
        // e-Vet Field's dark theme (its .dark --color-salin-* tokens), used as dark:*-night-*: neutral greys that lift with elevation.
        night: { text: '#e8e8e8', muted: '#a6a6a6', subtle: '#7f7f7f', canvas: '#121212', surface: '#1e1e1e', bar: '#272727', menu: '#2e2e2e', dialog: '#383838', tile: '#2c2c2c', 'tile-hover': '#363636', border: '#2f2f2f', 'border-strong': '#474747' },
      },
      boxShadow: { panel: '0 1px 2px rgb(16 40 28 / 0.04), 0 8px 24px -12px rgb(16 40 28 / 0.12)' },
      transitionTimingFunction: { spring: 'cubic-bezier(.32,.72,0,1)' },
    },
  },
  plugins: [],
} satisfies Config;
