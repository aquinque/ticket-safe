/**
 * TicketSafe inline SVG logo.
 * Matches the site's ESCP blue gradient exactly — no image request, crisp at any size.
 */

interface LogoProps {
  /** Height in pixels (icon scales proportionally). Defaults to 32. */
  height?: number;
}

const Logo = ({ height = 32 }: LogoProps) => {
  const iconSize = height;
  const fontSize = Math.round(height * 0.52);
  const gap = Math.round(height * 0.28);

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap }}
      aria-label="TicketSafe"
    >
      {/* Icon */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient
            id="ts-logo-grad"
            x1="0"
            y1="0"
            x2="36"
            y2="36"
            gradientUnits="userSpaceOnUse"
          >
            <stop stopColor="#003CB3" />
            <stop offset="1" stopColor="#0080E5" />
          </linearGradient>
        </defs>

        {/* Rounded background */}
        <rect width="36" height="36" rx="9" fill="url(#ts-logo-grad)" />

        {/* Ticket shape with perforated midline */}
        <path
          d="M7 14a1 1 0 0 1 1-1h8.25v10H8a1 1 0 0 1-1-1v-1.6a2.4 2.4 0 0 0 0-4.8V14Z"
          fill="white"
          fillOpacity="0.95"
        />
        <path
          d="M29 14v1.6a2.4 2.4 0 0 0 0 4.8V22a1 1 0 0 1-1 1h-8.25V13H28a1 1 0 0 1 1 1Z"
          fill="white"
          fillOpacity="0.75"
        />
        {/* Perforation dots */}
        {[14.5, 16.5, 18.5, 20.5, 22.5].map((y) => (
          <circle key={y} cx="18" cy={y} r="0.75" fill="url(#ts-logo-grad)" />
        ))}
      </svg>

      {/* Wordmark */}
      <span
        style={{
          fontWeight: 700,
          fontSize,
          letterSpacing: "-0.02em",
          lineHeight: 1,
          color: "hsl(220 100% 30%)",
          fontFamily: "inherit",
        }}
      >
        Ticket
        <span style={{ color: "hsl(210 100% 45%)" }}>Safe</span>
      </span>
    </span>
  );
};

export default Logo;
