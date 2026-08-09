import type { Config } from 'tailwindcss'

const config: Config = {
  darkMode: 'class',
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        'wagdie': ['Wagdie Fraktur', 'serif'],
        'eskapade': ['Eskapade Fraktur', 'serif'],
        'display': ['Wagdie Fraktur', 'serif'],
        'ui': ['ui-sans-serif', 'system-ui', '-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'sans-serif'],
        'serif': ['Georgia', 'Times New Roman', 'serif'],
      },
      fontSize: {
        // Standardized typography scale
        'h1': ['2.5rem', { lineHeight: '3rem', letterSpacing: '0.025em' }],      // 40px - Page titles (1px letter-spacing)
        'h2': ['2rem', { lineHeight: '2.5rem', letterSpacing: '0.03125em' }],     // 32px - Section titles (1px letter-spacing)
        'h3': ['1.5rem', { lineHeight: '2rem', letterSpacing: '0.05em' }],     // 24px - Card titles
        'h4': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '0.03em' }], // 20px - Subsections
        'body': ['1rem', { lineHeight: '1.625rem' }],                          // 16px - Body text
        'body-sm': ['0.875rem', { lineHeight: '1.375rem' }],                   // 14px - Secondary text
        'caption': ['0.75rem', { lineHeight: '1rem' }],                        // 12px - Captions, labels
        'tiny': ['0.625rem', { lineHeight: '0.875rem' }],                      // 10px - Badges, status
        // Standard Tailwind aliases for consistency
        'xs': ['0.75rem', { lineHeight: '1rem' }],                            // 12px - Alias to caption
        'sm': ['0.875rem', { lineHeight: '1.375rem' }],                       // 14px - Alias to body-sm
        'base': ['1rem', { lineHeight: '1.625rem' }],                          // 16px - Alias to body
        'md': ['1rem', { lineHeight: '1.625rem' }],                           // 16px - Alias to body
        'lg': ['1.125rem', { lineHeight: '1.5rem' }],                          // 18px - Medium-large
        'xl': ['1.25rem', { lineHeight: '1.75rem', letterSpacing: '0.03em' }],  // 20px - Alias to h4
        '2xl': ['1.5rem', { lineHeight: '2rem', letterSpacing: '0.05em' }],    // 24px - Alias to h3
        '3xl': ['1.875rem', { lineHeight: '2.25rem', letterSpacing: '0.04em' }], // 30px - Large headings
      },
      colors: {
        // Gothic dark theme - Backgrounds
        abyss: '#050505',        // Deepest black - Base background
        shadow: '#0a0a0a',       // Section background
        midnight: '#121212',     // Component background
        'midnight-light': '#1a1a1a', // Hover states, borders

        // Text colors
        bone: '#e8e8e8',         // Primary text (off-white)
        ash: '#b0b0b0',          // Secondary text
        mist: '#707070',         // Tertiary text, disabled
        dark: '#404040',         // Muted/Quiet text

        // Accent colors - Gothic fantasy
        blood: '#8b2635',        // Primary accent (muted red)
        ember: '#c94a3a',        // Hover/active states
        gold: '#d4af37',         // Highlights, important
        poison: '#4a7c59',       // Success states (muted green)
        arcane: '#6a4c93',       // Links, info (muted purple)

        // Editorial accents (additive Adobe XD handoff roles)
        parchment: '#E9C793',    // Editorial highlights and prominent copy
        'arcane-bright': '#B690EB', // High-contrast arcane accent
        'arcane-muted': '#7453A3',  // Supporting arcane controls and borders
        'arcane-deep': '#7549B4',   // Deep arcane emphasis

        // Soul colors for new components
        soul: {
          accent: '#c8aa6e',     // Golden accent
          blood: '#8b2635',      // Blood red selection
          900: '#1a1410',        // Dark soul background
          950: '#0C0C0C',        // Darkest soul background
          800: '#251c16',        // Muted soul background
        },
      },
      backgroundImage: {
        'glass': 'rgba(255, 255, 255, 0.05)',
      },
      boxShadow: {
        'soul-glow': '0 0 20px rgba(200, 170, 110, 0.15)',
        'blood-glow': '0 0 20px rgba(139, 38, 53, 0.15)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-out forwards',
        'toast-progress': 'toastProgress var(--toast-duration, 3s) linear forwards',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        toastProgress: {
          '0%': { width: '100%' },
          '100%': { width: '0%' },
        },
      },
    },
  },
  plugins: [],
}
export default config
