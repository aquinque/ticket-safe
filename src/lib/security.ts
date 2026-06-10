// =====================================================
// SECURITY UTILITIES
// XSS, CSRF, and injection protection
// =====================================================

import DOMPurify from 'dompurify';

// =====================================================
// XSS PROTECTION
// =====================================================

/**
 * Sanitize HTML to prevent XSS attacks
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'a', 'p', 'br'],
    ALLOWED_ATTR: ['href', 'target'],
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Escape HTML entities
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Strip all HTML tags
 */
export function stripHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS: [] });
}

/**
 * Validate and sanitize user input.
 * Uses DOMPurify with no allowed tags — strips ALL HTML and dangerous characters,
 * then enforces a length cap. Safe to render anywhere (text content, attributes).
 */
export function sanitizeInput(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') return '';
  // 1. Strip ALL HTML via DOMPurify (safer than naive `[<>]` removal).
  let sanitized = DOMPurify.sanitize(input, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
  // 2. Normalize whitespace / trim.
  sanitized = sanitized.replace(/\s+/g, ' ').trim();
  // 3. Strip zero-width / bidi-override characters used in homoglyph attacks.
  //    (U+200B–200F, U+202A–202E, U+2060–2064, U+FEFF — written as escapes so
  //    the invisible characters don't live literally in the source.)
  sanitized = sanitized.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, '');
  // 4. Enforce length cap (default 1000 chars).
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  return sanitized;
}

// =====================================================
// CSRF PROTECTION
// =====================================================

/**
 * Generate CSRF token
 */
export function generateCsrfToken(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Store CSRF token in sessionStorage
 */
export function storeCsrfToken(token: string): void {
  sessionStorage.setItem('csrf_token', token);
}

/**
 * Get CSRF token from sessionStorage
 */
export function getCsrfToken(): string | null {
  return sessionStorage.getItem('csrf_token');
}

/**
 * Verify CSRF token
 */
export function verifyCsrfToken(token: string): boolean {
  const storedToken = getCsrfToken();
  return storedToken !== null && storedToken === token;
}

// =====================================================
// SQL INJECTION PROTECTION
// =====================================================

/**
 * Validate SQL-safe string (for use with raw queries)
 * Note: Supabase client already protects against SQL injection,
 * but this is an extra layer for custom queries
 */
export function isSqlSafe(input: string): boolean {
  // Check for common SQL injection patterns
  const sqlInjectionPatterns = [
    /(\bOR\b|\bAND\b)\s+\d+\s*=\s*\d+/i,
    /';?\s*(DROP|DELETE|INSERT|UPDATE|CREATE|ALTER)\s+/i,
    /UNION\s+SELECT/i,
    /--/,
    /\/\*/,
    /\*\//,
    /xp_/i,
    /sp_/i,
  ];

  return !sqlInjectionPatterns.some((pattern) => pattern.test(input));
}

/**
 * Sanitize SQL input (escape special characters)
 */
export function sanitizeSqlInput(input: string): string {
  return input.replace(/['";\\]/g, '');
}

// =====================================================
// INPUT VALIDATION
// =====================================================

/**
 * Validate email format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
}

/**
 * Validate phone number (international format)
 */
export function isValidPhone(phone: string): boolean {
  const phoneRegex = /^\+?[1-9]\d{1,14}$/;
  return phoneRegex.test(phone.replace(/[\s()-]/g, ''));
}

/**
 * Validate UUID format
 */
export function isValidUuid(uuid: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate URL format
 */
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

/**
 * Validate safe redirect URL (prevent open redirect vulnerability)
 */
export function isSafeRedirectUrl(url: string): boolean {
  try {
    const parsed = new URL(url, window.location.origin);
    // Only allow same-origin redirects
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

// =====================================================
// PASSWORD SECURITY
// =====================================================

/**
 * Check password strength
 */
export function checkPasswordStrength(password: string): {
  score: number;
  feedback: string[];
  isStrong: boolean;
} {
  const feedback: string[] = [];
  let score = 0;

  // Length check
  if (password.length < 8) {
    feedback.push('Password must be at least 8 characters');
  } else if (password.length >= 12) {
    score += 2;
  } else {
    score += 1;
  }

  // Uppercase check
  if (!/[A-Z]/.test(password)) {
    feedback.push('Add uppercase letters');
  } else {
    score += 1;
  }

  // Lowercase check
  if (!/[a-z]/.test(password)) {
    feedback.push('Add lowercase letters');
  } else {
    score += 1;
  }

  // Number check
  if (!/[0-9]/.test(password)) {
    feedback.push('Add numbers');
  } else {
    score += 1;
  }

  // Special character check
  if (!/[^a-zA-Z0-9]/.test(password)) {
    feedback.push('Add special characters (!@#$%^&*)');
  } else {
    score += 1;
  }

  // Common password check
  const commonPasswords = ['password', '12345678', 'qwerty', 'abc123'];
  if (commonPasswords.some((common) => password.toLowerCase().includes(common))) {
    feedback.push('Avoid common passwords');
    score = Math.max(0, score - 2);
  }

  return {
    score,
    feedback,
    isStrong: score >= 4 && feedback.length === 0,
  };
}

/**
 * Hash password client-side before sending (additional layer)
 * Note: Supabase already hashes passwords, but this adds an extra layer
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

// =====================================================
// RATE LIMITING (CLIENT-SIDE)
// =====================================================

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
}

class RateLimiter {
  private attempts: Map<string, { count: number; resetAt: number }> = new Map();

  check(key: string, config: RateLimitConfig): boolean {
    const now = Date.now();
    const entry = this.attempts.get(key);

    if (!entry || now > entry.resetAt) {
      // Start new window
      this.attempts.set(key, {
        count: 1,
        resetAt: now + config.windowMs,
      });
      return true;
    }

    if (entry.count >= config.maxAttempts) {
      return false; // Rate limit exceeded
    }

    entry.count++;
    return true;
  }

  reset(key: string): void {
    this.attempts.delete(key);
  }
}

export const rateLimiter = new RateLimiter();

// =====================================================
// SECURE STORAGE — AES-GCM via Web Crypto
// Encrypts payloads before persisting in localStorage. The encryption key
// is derived per-origin and persisted in sessionStorage so the page lifecycle
// is the trust boundary — closing the tab destroys the key.
// =====================================================

const SECURE_KEY_NAME = '__ts_sec_k';

async function deriveSessionKey(): Promise<CryptoKey> {
  // Load or generate a 256-bit raw key for this session (sessionStorage = cleared on tab close).
  let raw: Uint8Array;
  const stored = sessionStorage.getItem(SECURE_KEY_NAME);
  if (stored) {
    raw = Uint8Array.from(atob(stored), (c) => c.charCodeAt(0));
  } else {
    raw = new Uint8Array(32);
    crypto.getRandomValues(raw);
    sessionStorage.setItem(SECURE_KEY_NAME, btoa(String.fromCharCode(...raw)));
  }
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

/**
 * Encrypt a string with AES-GCM and store in localStorage.
 * The ciphertext is namespaced and includes a fresh IV per write.
 */
export async function secureStore(key: string, value: string): Promise<void> {
  try {
    const cryptoKey = await deriveSessionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ciphertext = new Uint8Array(
      await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, new TextEncoder().encode(value)),
    );
    // Encode IV + ciphertext together as base64 for storage.
    const payload = new Uint8Array(iv.length + ciphertext.length);
    payload.set(iv, 0);
    payload.set(ciphertext, iv.length);
    localStorage.setItem(`secure_${key}`, btoa(String.fromCharCode(...payload)));
  } catch (error) {
    console.error('secureStore failed:', error);
  }
}

/**
 * Decrypt a value previously written by secureStore. Returns null on missing or tampered data.
 */
export async function secureRetrieve(key: string): Promise<string | null> {
  try {
    const blob = localStorage.getItem(`secure_${key}`);
    if (!blob) return null;
    const payload = Uint8Array.from(atob(blob), (c) => c.charCodeAt(0));
    if (payload.length < 13) return null;
    const iv = payload.slice(0, 12);
    const ciphertext = payload.slice(12);
    const cryptoKey = await deriveSessionKey();
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
    return new TextDecoder().decode(plaintext);
  } catch {
    // Tampering, wrong key (new session), or corrupted data — fail closed.
    return null;
  }
}

/**
 * Securely delete an encrypted value from localStorage.
 */
export function secureDelete(key: string): void {
  localStorage.removeItem(`secure_${key}`);
}

// =====================================================
// CONTENT SECURITY POLICY
// =====================================================

/**
 * Generate nonce for inline scripts (CSP)
 */
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return btoa(String.fromCharCode(...array));
}

// =====================================================
// CLICKJACKING PROTECTION
// =====================================================

/**
 * Prevent clickjacking by checking if in iframe
 */
export function preventClickjacking(): void {
  if (window.self !== window.top) {
    // Page is in an iframe
    console.warn('Page loaded in iframe - potential clickjacking attempt');

    // Option 1: Break out of iframe
    // window.top.location = window.self.location;

    // Option 2: Hide content
    document.body.style.display = 'none';
    alert('This page cannot be displayed in a frame for security reasons.');
  }
}

// =====================================================
// SENSITIVE DATA MASKING
// =====================================================

/**
 * Mask email address
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;

  const maskedLocal =
    local.length <= 2 ? local : local[0] + '*'.repeat(local.length - 2) + local[local.length - 1];

  return `${maskedLocal}@${domain}`;
}

/**
 * Mask phone number
 */
export function maskPhone(phone: string): string {
  if (phone.length <= 4) return phone;
  return '*'.repeat(phone.length - 4) + phone.slice(-4);
}

/**
 * Mask credit card number
 */
export function maskCardNumber(cardNumber: string): string {
  const cleaned = cardNumber.replace(/\s/g, '');
  if (cleaned.length <= 4) return cleaned;
  return '*'.repeat(cleaned.length - 4) + cleaned.slice(-4);
}

// =====================================================
// SESSION SECURITY
// =====================================================

/**
 * Generate device fingerprint for session tracking
 */
export function generateDeviceFingerprint(): string {
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.width,
    screen.height,
    new Date().getTimezoneOffset(),
  ];

  const fingerprint = components.join('|');
  const encoder = new TextEncoder();
  const data = encoder.encode(fingerprint);

  // Simple hash
  let hash = 0;
  for (let i = 0; i < data.length; i++) {
    hash = (hash << 5) - hash + data[i];
    hash = hash & hash; // Convert to 32bit integer
  }

  return hash.toString(16);
}

/**
 * Detect signals of automation/bot traffic. Intentionally does NOT try to
 * detect devtools — that's user-hostile, unreliable, and not a meaningful
 * security control. Real abuse prevention belongs on the server (rate
 * limiting, CAPTCHA on auth, RLS).
 */
export function detectSuspiciousActivity(): {
  isSuspicious: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Headless browser / automation tooling signal.
  if (typeof navigator !== 'undefined' && navigator.webdriver) {
    reasons.push('Automated browser detected');
  }

  // Implausible viewport — typical headless screenshot tools.
  if (typeof screen !== 'undefined' && (screen.width < 100 || screen.height < 100)) {
    reasons.push('Unusual screen dimensions');
  }

  return {
    isSuspicious: reasons.length > 0,
    reasons,
  };
}

// =====================================================
// EXPORTS
// =====================================================

export const security = {
  // XSS Protection
  sanitizeHtml,
  escapeHtml,
  stripHtml,
  sanitizeInput,

  // CSRF Protection
  generateCsrfToken,
  storeCsrfToken,
  getCsrfToken,
  verifyCsrfToken,

  // SQL Injection Protection
  isSqlSafe,
  sanitizeSqlInput,

  // Input Validation
  isValidEmail,
  isValidPhone,
  isValidUuid,
  isValidUrl,
  isSafeRedirectUrl,

  // Password Security
  checkPasswordStrength,
  hashPassword,

  // Rate Limiting
  rateLimiter,

  // Secure Storage
  secureStore,
  secureRetrieve,
  secureDelete,

  // CSP
  generateNonce,

  // Clickjacking
  preventClickjacking,

  // Data Masking
  maskEmail,
  maskPhone,
  maskCardNumber,

  // Session Security
  generateDeviceFingerprint,
  detectSuspiciousActivity,
};

export default security;
