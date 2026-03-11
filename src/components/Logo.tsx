/**
 * TicketSafe SVG logo — wordmark with swoosh and subtitle.
 * Matches the brand image exactly.
 */

interface LogoProps {
  /** Height in pixels. Defaults to 32. */
  height?: number;
}

const Logo = ({ height = 32 }: LogoProps) => {
  // ViewBox is 180 × 34; scale proportionally
  const viewW = 180;
  const viewH = 34;
  const width = Math.round((height / viewH) * viewW);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${viewW} ${viewH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="TicketSafe"
    >
      <defs>
        <linearGradient id="ts-swoosh" x1="0" y1="0" x2="180" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a2e7a" />
          <stop offset="1" stopColor="#5b8ee0" />
        </linearGradient>
      </defs>

      {/* "Ticket" — dark navy */}
      <text
        x="2"
        y="25"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
        fontWeight="800"
        fontSize="28"
        fill="#1a2e7a"
        letterSpacing="-0.5"
      >
        Ticket
      </text>

      {/* "Safe" — steel blue */}
      <text
        x="99"
        y="25"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
        fontWeight="800"
        fontSize="28"
        fill="#4a7cc8"
        letterSpacing="-0.5"
      >
        Safe
      </text>

      {/* Swoosh arc */}
      <path
        d="M2 30 Q90 38 178 30"
        stroke="url(#ts-swoosh)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
};

export default Logo;
