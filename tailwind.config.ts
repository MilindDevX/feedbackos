import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: 'oklch(97% 0.02 260)',
          100: 'oklch(93% 0.05 260)',
          200: 'oklch(85% 0.09 260)',
          300: 'oklch(75% 0.13 260)',
          400: 'oklch(63% 0.18 260)',
          500: 'oklch(55% 0.22 260)',
          600: 'oklch(47% 0.22 260)',
          700: 'oklch(39% 0.19 260)',
          800: 'oklch(30% 0.14 260)',
          900: 'oklch(22% 0.10 260)',
          950: 'oklch(15% 0.06 260)',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          from: { opacity: '0', transform: 'translateY(4px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
}

export default config
