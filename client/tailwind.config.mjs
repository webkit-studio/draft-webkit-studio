import relume from '@relume_io/relume-tailwind';

/* Struktura komponent je z Relume, vzhled z /design/webkit/. Relume preset má
   radius 0 v defaultu, takže se v tomhle s design systémem potkávají.
   Barvy, typografii a motion přepisujeme na tokeny Webkit.Studio. */

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,js,ts,jsx,tsx,mdx}'],
  presets: [relume],
  theme: {
    extend: {
      /* preset nahrazuje gradientColorStops - vrátit, jinak se rozbijí from-/to- */
      gradientColorStops: ({ theme }) => theme('colors'),

      colors: {
        black: '#000000',
        white: '#ffffff',
        gray: { 100: '#f4f4f4', 300: '#e2e2e2', 500: '#6f6f6f' },
        accent: { DEFAULT: '#ff4d00', ink: '#000000' },
        /* Relume sekce čtou scheme-*; svážeme je na monochrom */
        scheme: {
          background: '#ffffff',
          foreground: '#ffffff',
          text: '#000000',
          border: '#e2e2e2',
          'btn-text': '#ffffff'
        }
      },

      fontFamily: {
        sans: ['Urbanist', 'Helvetica Neue', 'Arial', 'sans-serif'],
        mono: ['ui-monospace', 'monospace']
      },

      /* Relume tokeny, které publikovaný v3 preset vynechává. Velikosti
         srovnané na typografickou škálu Webkit.Studio, ne na Relume default. */
      fontSize: {
        h1: ['56px', { lineHeight: '1.06', letterSpacing: '-0.03em' }],
        h2: ['40px', { lineHeight: '1.1', letterSpacing: '-0.02em' }],
        h3: ['28px', { lineHeight: '1.15', letterSpacing: '-0.01em' }],
        h4: ['22px', { lineHeight: '1.25' }],
        h5: ['18px', { lineHeight: '1.35' }],
        h6: ['16px', { lineHeight: '1.4' }],
        large: ['18px', { lineHeight: '1.55' }],
        medium: ['16px', { lineHeight: '1.55' }],
        regular: ['16px', { lineHeight: '1.55' }],
        small: ['14px', { lineHeight: '1.5' }],
        tiny: ['12px', { lineHeight: '1.5' }]
      },

      /* radius 0 všude - jediná výjimka v systému je značková čtvrtkružnice */
      borderRadius: {
        none: '0px',
        button: '0px',
        card: '0px',
        image: '0px',
        form: '0px',
        badge: '0px',
        checkbox: '0px',
        carousel: '0px',
        dropdown: '0px',
        quarter: '100%'
      },

      /* Pozor: tohle je vlastni skala, ne Tailwind default. Klice 1-10 znaci
         kroky systemu, takze h-8 je 64 px, ne 32. Pro konkretni rozmer prvku
         (avatar, ikonove tlacitko) pouzij radsi h-[32px] - jinak vznikne
         cerna placka pres celou listu, coz uz se jednou stalo. */
      spacing: {
        1: '4px', 2: '8px', 3: '12px', 4: '16px', 5: '24px',
        6: '32px', 7: '48px', 8: '64px', 9: '96px', 10: '128px'
      },

      maxWidth: { container: '1200px' },

      transitionTimingFunction: {
        out: 'cubic-bezier(0.2,0,0,1)',
        snap: 'cubic-bezier(0.7,0,0.15,1)'
      },
      transitionDuration: { fast: '120ms', base: '200ms', slow: '450ms' },

      /* hloubka = hairliny, žádné stíny */
      boxShadow: { none: 'none' }
    }
  },
  plugins: []
};
