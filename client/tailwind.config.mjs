/* Tailwind jen jako utility vrstva (flex, grid, mezery). Vzhled komponent
   drží src/styles/app.css a tokeny tam - tady se jen zrcadlí, aby šly
   použít i jako třídy (text-ink2, bg-card, rounded-lg…). */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,js,ts,jsx,tsx,mdx}'],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        bg: '#ECEFF3', bg2: '#E2E6EC', card: '#FFFFFF', card2: '#F7F8FA',
        ink: '#101321', ink2: '#3A3F52', mute: '#6B7186',
        line: '#CDD2DC', line2: '#AEB5C4',
        blue: { DEFAULT: '#1D2BE8', 2: '#1523B8', soft: '#D8DCFB' },
        lilac: { DEFAULT: '#8A96FF', soft: '#E4E7FF' },
        ok: '#1F9D5B', warn: '#D99A00', danger: '#E5484D'
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        sans: ['"Instrument Sans"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'Menlo', 'monospace']
      },
      borderRadius: { sm: '8px', DEFAULT: '12px', md: '14px', lg: '22px', xl: '28px' },
      boxShadow: {
        card: '0 1px 2px rgba(16,19,33,.04), 0 12px 32px -20px rgba(16,19,33,.18)',
        hover: '0 2px 4px rgba(16,19,33,.05), 0 28px 56px -28px rgba(29,43,232,.35)',
        blue: '0 10px 26px -12px rgba(29,43,232,.55)'
      },
      transitionTimingFunction: { out: 'cubic-bezier(.2,.8,.2,1)' },
      maxWidth: { page: '1240px' }
    }
  },
  plugins: []
};
