import type { Config } from 'tailwindcss';

/**
 * Gourmet Direct design system — Material 3 inspired tokens.
 * See DESIGN.md for the source of truth.
 */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Surfaces
        surface: '#f9f9f9',
        background: '#f9f9f9',
        'surface-dim': '#dadada',
        'surface-bright': '#f9f9f9',
        'surface-container-lowest': '#ffffff',
        'surface-container-low': '#f3f3f3',
        'surface-container': '#eeeeee',
        'surface-container-high': '#e8e8e8',
        'surface-container-highest': '#e2e2e2',
        'surface-variant': '#e2e2e2',
        'inverse-surface': '#2f3131',
        'inverse-on-surface': '#f1f1f1',

        // Text on surfaces
        'on-surface': '#1a1c1c',
        'on-background': '#1a1c1c',
        'on-surface-variant': '#5b403f',

        // Brand red (primary)
        primary: '#b7122a',
        'on-primary': '#ffffff',
        'primary-container': '#db313f',
        'on-primary-container': '#fffbff',
        'primary-fixed': '#ffdad8',
        'primary-fixed-dim': '#ffb3b1',
        'on-primary-fixed': '#410007',
        'on-primary-fixed-variant': '#92001c',
        'inverse-primary': '#ffb3b1',
        'surface-tint': '#bb162c',

        // Secondary / tertiary (neutrals)
        secondary: '#5f5e5e',
        'on-secondary': '#ffffff',
        'secondary-container': '#e2dfde',
        'on-secondary-container': '#636262',
        tertiary: '#5a5c5c',
        'on-tertiary': '#ffffff',
        'tertiary-container': '#737575',
        'on-tertiary-container': '#fcfcfc',

        // Outlines
        outline: '#8f6f6e',
        'outline-variant': '#e4bebc',

        // Error
        error: '#ba1a1a',
        'on-error': '#ffffff',
        'error-container': '#ffdad6',
        'on-error-container': '#93000a',

        // Veg / non-veg dots (FSSAI)
        veg: '#16a34a',
        nonveg: '#dc2626',

        // Success (savings, applied coupon)
        success: '#16a34a',
        'success-tint': '#dcfce7',
        'success-text': '#15803d',
      },
      fontFamily: {
        display: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        'display-xl': ['40px', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '800' }],
        'headline-lg': ['24px', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
        'headline-md': ['20px', { lineHeight: '1.2', fontWeight: '700' }],
        'body-lg': ['18px', { lineHeight: '1.6', fontWeight: '400' }],
        'body-md': ['16px', { lineHeight: '1.5', fontWeight: '400' }],
        'label-bold': ['14px', { lineHeight: '1.2', fontWeight: '600' }],
        'label-sm': ['12px', { lineHeight: '1.2', fontWeight: '500' }],
      },
      borderRadius: {
        DEFAULT: '0.5rem',
        md: '0.75rem',
        lg: '1rem',
        xl: '1.25rem',
        '2xl': '1.25rem',
        '3xl': '1.5rem',
        // `pill` used to be 9999px (fully rounded). Per design feedback we
        // dialled this back to ~14px so primary CTAs and chips read as
        // "rounded buttons" instead of stadium shapes. Tiny dots / status
        // indicators (size ≤ 28px) still appear as perfect circles because
        // their natural radius is smaller than 14px.
        pill: '14px',
        // `round` keeps the true 9999px shape for the rare element that
        // genuinely needs it (avatars, dots when explicit, etc.)
        round: '9999px',
      },
      spacing: {
        'container-margin': '16px',
        gutter: '12px',
        // Custom design-system spacing keys. `md` is used heavily in the
        // customer app (`p-md`, `gap-md`, `px-md`). Without these the
        // utilities silently produce no CSS — which was making cart item
        // images sit flush against the text on mobile.
        sm: '8px',
        md: '12px',
        lg: '16px',
        xl: '24px',
      },
      boxShadow: {
        card: '0 4px 20px -2px rgba(0, 0, 0, 0.05)',
        soft: '0 2px 12px rgba(0, 0, 0, 0.04)',
        premium: '0 10px 30px -5px rgba(183, 18, 42, 0.12)',
        cta: '0 8px 30px rgba(183, 18, 42, 0.30)',
        topfloat: '0 -10px 40px -5px rgba(0, 0, 0, 0.08)',
      },
      animation: {
        'slide-up': 'slideUp 0.28s cubic-bezier(0.16, 1, 0.3, 1)',
        'fade-in': 'fadeIn 0.2s ease-out',
      },
      keyframes: {
        slideUp: { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        fadeIn: { from: { opacity: '0' }, to: { opacity: '1' } },
      },
    },
  },
  plugins: [],
} satisfies Config;
