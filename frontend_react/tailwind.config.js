/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#050A12',
          900: '#07111F',
          800: '#0A1424',
          700: '#0E1B30',
          border: 'rgba(120, 220, 255, 0.16)',
        },
        cyan: {
          400: '#22D3EE',
          500: '#06B6D4',
        },
        teal: {
          400: '#2DD4BF',
        },
        emerald: {
          400: '#34D399',
        },
        amber: {
          400: '#FBBF24',
        },
        crimson: {
          400: '#FB7185',
          500: '#F43F5E',
          600: '#E11D48',
        }
      }
    },
  },
  plugins: [],
}
