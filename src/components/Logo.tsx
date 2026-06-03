/**
 * Ticket Safe inline SVG logo.
 *
 * Icon: square with rounded corners, blue gradient background, big white "T"
 * with a translucent lighter-blue "S" peeking behind. Crisp at any size, zero
 * extra HTTP request. The same vector is exported as /public/favicon.svg so
 * tabs and bookmarks share the same artwork.
 */

interface LogoProps {
  /** Height in pixels (the icon and wordmark scale together). Defaults to 32. */
  height?: number;
  /** Wordmark color variant. "light" makes the text white for dark backgrounds. */
  variant?: "default" | "light";
  /** When true, render only the square icon (no "TicketSafe" wordmark). */
  iconOnly?: boolean;
}

const Logo = ({ height = 32, variant = "default", iconOnly = false }: LogoProps) => {
  const iconSize = height;
  const fontSize = Math.round(height * 0.52);
  const gap = Math.round(height * 0.28);
  const isLight = variant === "light";

  return (
    <span
      style={{ display: "inline-flex", alignItems: "center", gap }}
      aria-label="Ticket Safe"
    >
      {/* TS icon */}
      <svg
        width={iconSize}
        height={iconSize}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="ts-bg-grad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#3a5fe6" />
            <stop offset="100%" stopColor="#2440b6" />
          </linearGradient>
        </defs>

        {/* Rounded square background */}
        <rect width="100" height="100" rx="22" fill="url(#ts-bg-grad)" />

        {/* "S" behind, translucent white — sits to the right, peeks out from under the T */}
        <text
          x="62"
          y="76"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif"
          fontSize="64"
          fontWeight="900"
          fill="#aec6ff"
          textAnchor="middle"
          letterSpacing="-0.04em"
        >
          S
        </text>

        {/* "T" in front, solid white */}
        <text
          x="38"
          y="76"
          fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Inter, system-ui, sans-serif"
          fontSize="64"
          fontWeight="900"
          fill="white"
          textAnchor="middle"
          letterSpacing="-0.04em"
        >
          T
        </text>
      </svg>

      {/* Wordmark */}
      {!iconOnly && (
        <span
          style={{
            fontWeight: 700,
            fontSize,
            letterSpacing: "-0.02em",
            lineHeight: 1,
            color: isLight ? "white" : "#2440b6",
            fontFamily: "inherit",
          }}
        >
          Ticket
          <span style={{ color: isLight ? "#aec6ff" : "#3a5fe6" }}>Safe</span>
        </span>
      )}
    </span>
  );
};

export default Logo;
