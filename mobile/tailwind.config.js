/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}", "./components/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#f0faf8',
          100: '#d7f2ec',
          200: '#b1e3db',
          300: '#80cec3',
          400: '#53b1a5',
          500: '#389589',
          600: '#006b5f',
          700: '#2b5f56',
          800: '#224d48',
          900: '#1f403c',
        }
      }
    },
  },
  plugins: [],
};
