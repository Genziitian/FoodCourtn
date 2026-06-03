import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand:  { 500: '#F97316', 600: '#EA580C', 700: '#C2410C' },
        ink:    { 900: '#0B0F19', 800: '#111827', 700: '#1F2937', 500: '#9CA3AF' },
        rush:   { 500: '#EF4444', 600: '#DC2626' },
        cooking:{ 500: '#3B82F6', 600: '#2563EB' },
        ready:  { 500: '#10B981', 600: '#059669' },
      },
      fontFamily: { sans: ['Inter','system-ui','sans-serif'], mono: ['ui-monospace','SFMono-Regular','Menlo','monospace'] },
    },
  },
  plugins: [],
} satisfies Config;
