/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
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
        },
      },
      fontFamily: {
        sans: ['Geist', 'system-ui', 'sans-serif'],
        mono: ['GeistMono', 'monospace'],
      },
      fontSize: {
        // 4-size system: 11 (eyebrow), 13 (meta), 16 (body), 22 (display) — 60/30/10 hierarchy
        xs: ['11px', { lineHeight: '16px', letterSpacing: '0.02em' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['22px', { lineHeight: '28px', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        // Shape lock: cards 2xl (16), pills full, buttons xl (12) unified
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
      },
      boxShadow: {
        soft: '0 2px 16px rgba(0,107,95,0.06)',
        'soft-lg': '0 8px 32px rgba(0,107,95,0.08)',
      },
    },
  },
  plugins: [],
}
