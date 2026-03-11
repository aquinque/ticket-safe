/**
 * TicketSafe SVG logo — wordmark with swoosh and subtitle.
 * Matches the brand image exactly.
 */

interface LogoProps {
  /** Height in pixels. Defaults to 32. */
  height?: number;
}

const Logo = ({ height = 32 }: LogoProps) => {
  // ViewBox is 200 × 46; scale proportionally
  const viewW = 200;
  const viewH = 46;
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
        <linearGradient id="ts-swoosh" x1="0" y1="0" x2="200" y2="0" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a2e7a" />
          <stop offset="1" stopColor="#5b8ee0" />
        </linearGradient>
      </defs>

      {/* "Ticket" — dark navy */}
      <text
        x="2"
        y="27"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
        fontWeight="800"
        fontSize="29"
        fill="#1a2e7a"
        letterSpacing="-0.5"
      >
        Ticket
      </text>

      {/* "Safe" — steel blue */}
      <text
        x="105"
        y="27"
        fontFamily="-apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif"
        fontWeight="800"
        fontSize="29"
        fill="#4a7cc8"
        letterSpacing="-0.5"
      >
        Safe
      </text>

      {/* Swoosh arc */}
      <path
        d="M4 33 Q100 43 196 33"
        stroke="url(#ts-swoosh)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />

      {/* Subtitle */}
      <text
        x="100"
        y="44"
        fontFamily="Georgia, 'Times New Roman', serif"
        fontStyle="italic"
        fontSize="9"
        fill="#5566aa"
        textAnchor="middle"
        letterSpacing="0.4"
      >
        Student Ticket Marketplace
      </text>
    </svg>
  );
};

export default Logo;
