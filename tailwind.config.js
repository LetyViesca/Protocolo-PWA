/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        navy: {
          950: '#040e1f',
          900: '#0a1628',
          800: '#0f2040',
          700: '#162b55',
          600: '#1e3a6e',
          400: '#4a7ab5',
          200: '#b8cfe8',
          100: '#dce9f5',
        },
        emergency: {
          DEFAULT: '#dc2626',
          light: '#ef4444',
          dark: '#b91c1c',
        }
      }
    },
  },
  plugins: [],
}