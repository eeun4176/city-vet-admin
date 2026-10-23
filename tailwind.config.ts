import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['"IBM Plex Sans"', 'system-ui', 'sans-serif'] },
      colors: {
        brand: { 50: '#eaf7f0', 100: '#ccefdd', 200: '#9fe0bf', 500: '#01a85a', 600: '#018a49', 700: '#016536', 900: '#0b3a24' },
        surface: { DEFAULT: '#ffffff', dark: '#17211b' },
        canvas: { DEFAULT: '#f4f7f5', dark: '#0e1512' },
      },
      boxShadow: { panel: '0 1px 2px rgb(16 24 20 / 0.05), 0 8px 24px rgb(16 24 20 / 0.06)' },
    },
  },
  plugins: [],
} satisfies Config;
