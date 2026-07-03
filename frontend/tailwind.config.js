/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
      },
      colors: {
        // Brand: Blue-Indigo gradient system
        brand: {
          50:  '#eef2ff',
          100: '#e0e7ff',
          200: '#c7d2fe',
          300: '#a5b4fc',
          400: '#818cf8',
          500: '#6366f1',
          600: '#4f46e5',
          700: '#4338ca',
          800: '#3730a3',
          900: '#312e81',
          950: '#1e1b4b',
        },
        // Semantic blue for actions
        primary: {
          50:  '#eff6ff',
          100: '#dbeafe',
          200: '#bfdbfe',
          300: '#93c5fd',
          400: '#60a5fa',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
          800: '#1e40af',
          900: '#1e3a8a',
          950: '#172554',
        },
      },
      borderRadius: {
        '4xl': '2rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        'xs':   '0 1px 2px 0 rgb(0 0 0 / 0.04)',
        'soft': '0 2px 8px -1px rgb(0 0 0 / 0.08), 0 1px 3px -1px rgb(0 0 0 / 0.05)',
        'card': '0 1px 3px 0 rgb(0 0 0 / 0.06), 0 1px 2px -1px rgb(0 0 0 / 0.04)',
        'card-hover': '0 4px 12px -2px rgb(0 0 0 / 0.10), 0 2px 4px -1px rgb(0 0 0 / 0.06)',
        'modal': '0 20px 60px -10px rgb(0 0 0 / 0.25), 0 8px 24px -4px rgb(0 0 0 / 0.15)',
        'glow-blue': '0 0 0 3px rgb(59 130 246 / 0.15)',
      },
      animation: {
        'fade-in':    'fadeIn 0.18s ease-out both',
        'fade-up':    'fadeUp 0.22s cubic-bezier(0.16,1,0.3,1) both',
        'scale-in':   'scaleIn 0.18s cubic-bezier(0.16,1,0.3,1) both',
        'slide-in':   'slideIn 0.25s cubic-bezier(0.16,1,0.3,1) both',
        'slide-up':   'slideUp 0.22s cubic-bezier(0.16,1,0.3,1) both',
        'tooltip-in': 'tooltipIn 0.12s ease-out both',
        'pulse-soft': 'pulseSoft 2s cubic-bezier(0.4,0,0.6,1) infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: '0' },                                    to: { opacity: '1' } },
        fadeUp:    { from: { opacity: '0', transform: 'translateY(6px)' },      to: { opacity: '1', transform: 'translateY(0)' } },
        scaleIn:   { from: { opacity: '0', transform: 'scale(0.95)' },          to: { opacity: '1', transform: 'scale(1)' } },
        slideIn:   { from: { opacity: '0', transform: 'translateX(-8px)' },     to: { opacity: '1', transform: 'translateX(0)' } },
        slideUp:   { from: { opacity: '0', transform: 'translateY(10px)' },     to: { opacity: '1', transform: 'translateY(0)' } },
        tooltipIn: { from: { opacity: '0', transform: 'scale(0.94)' },          to: { opacity: '1', transform: 'scale(1)' } },
        pulseSoft: { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.5' } },
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
    },
  },
  plugins: [],
};