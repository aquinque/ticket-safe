import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    // Square corners everywhere (`rounded-lg`/`rounded-xl`/etc. all resolve
    // to 0). `full` is kept as a real 9999px so circular avatars/dots don't
    // get squished — that's not a "rounded corner", it's a circle.
    borderRadius: {
      none: "0",
      sm: "0",
      DEFAULT: "var(--radius-button)", /* 0 */
      md: "var(--radius-button)",      /* 0 — buttons */
      lg: "var(--radius-card)",        /* 0 — cards */
      xl: "0",
      "2xl": "0",
      "3xl": "0",
      full: "9999px",
    },
    boxShadow: {
      // Values come from CSS custom properties so they flip per theme
      // (.theme-studio = real soft shadows, .theme-night = none + glow on
      // hover) without touching any component's `shadow-soft` / `shadow-card`
      // / `hover:shadow-hover` classes.
      none: "none",
      sm: "var(--shadow-soft)",
      DEFAULT: "var(--shadow-card)",
      md: "var(--shadow-card)",
      lg: "var(--shadow-hover)",
      xl: "var(--shadow-hover)",
      "2xl": "var(--shadow-glow)",
      inner: "inset 0 2px 4px 0 hsl(228 53% 9% / 0.05)",
      soft: "var(--shadow-soft)",
      card: "var(--shadow-card)",
      hover: "var(--shadow-hover)",
      glow: "var(--shadow-glow)",
    },
    extend: {
      fontFamily: {
        // UI/body text.
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
        // Titles/display, unified with the logo. See `.font-display` on
        // h1-h4 in index.css and the `.text-display-hero` utility.
        display: ['"Space Grotesk"', "Inter", "system-ui", "sans-serif"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          hover: "hsl(var(--primary-hover))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
          hover: "hsl(var(--secondary-hover))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        // Neutral shadcn hover/highlight surface — NOT the lime brand accent.
        // See the comment on `--lime` in index.css for why these are separate.
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          hover: "hsl(var(--accent-hover))",
        },
        // Brand tokens (Phase 1 spec) — direct hsl(var()) reads, no /alpha
        // template needed since nothing modifies their opacity today.
        brand: {
          500: "hsl(var(--brand-500))",
          700: "hsl(var(--brand-700))",
          200: "hsl(var(--brand-200))",
        },
        // Light-blue CTA — buy CTAs + urgency badges only. Used by the
        // `buy` Button variant (Phase 2).
        cta: {
          DEFAULT: "hsl(var(--cta))",
          foreground: "hsl(var(--cta-foreground))",
        },
        danger: {
          DEFAULT: "hsl(var(--danger))",
          foreground: "hsl(var(--danger-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      backgroundImage: {
        'gradient-hero': 'var(--gradient-hero)',
        'gradient-card': 'var(--gradient-card)',
        'gradient-accent': 'var(--gradient-accent)',
        'gradient-purple-blue': 'var(--gradient-purple-blue)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      transitionTimingFunction: {
        DEFAULT: 'ease-out',
        'smooth': 'var(--transition-smooth)',
        'bounce': 'var(--transition-bounce)',
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        "scale-in": {
          "0%": { transform: "scale(0.95)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" }
        },
        "slide-up": {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" }
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.3s ease-out",
        "scale-in": "scale-in 0.2s ease-out",
        "slide-up": "slide-up 0.4s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
