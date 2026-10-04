// Access tokens for buyers without an account. Only the SHA-256 hash of a token
// is stored, so a leaked table does not leak working links.

/** 32 random bytes, base64url without padding: 43 characters. */
export function newAccessToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Hex SHA-256 of the token. This is what the database stores and looks up. */
export async function hashAccessToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Shape check before any database lookup. */
export const ACCESS_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
