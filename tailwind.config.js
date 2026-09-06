/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#fff7ed',
          100: '#ffedd5',
          200: '#fed7aa',
          300: '#fdba74',
          400: '#fb923c',
          500: '#f97316',
          600: '#ea580c',
          700: '#c2410c',
          800: '#9a3412',
          900: '#7c2d12',
        },
        // BrightForge website palette
        portal: {
          dark: 'rgb(var(--portal-dark-rgb, 13 15 26) / <alpha-value>)',
          surface: 'rgb(var(--portal-surface-rgb, 19 22 39) / <alpha-value>)',
          surface2: 'rgb(var(--portal-surface2-rgb, 26 30 50) / <alpha-value>)',
          border: 'var(--portal-border, rgba(255,255,255,0.07))',
          text: 'rgb(var(--portal-text-rgb, 232 234 242) / <alpha-value>)',
          soft: 'rgb(var(--portal-soft-rgb, 122 127 153) / <alpha-value>)',
          accent: 'rgb(var(--portal-accent-rgb, 240 98 42) / <alpha-value>)',
          'accent-light': 'rgb(var(--portal-accent-light-rgb, 255 154 98) / <alpha-value>)',
        }
      }
    },
  },
  plugins: [],
}