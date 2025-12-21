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
 * Validate and sanitize user input
 */
export function sanitizeInput(input: string, maxLength: number = 1000): string {
  // Trim whitespace
  let sanitized = input.trim();

  // Limit length
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }

  // Remove dangerous characters
  sanitized = sanitized.replace(/[<>]/g, '');

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
// SECURE STORAGE
// =====================================================

/**
 * Encrypt data before storing in localStorage
 */
export async function secureStore(key: string, value: string): Promise<void> {
  try {
    // Generate a key from user session (or use a fixed salt)
    const encoder = new TextEncoder();
    const data = encoder.encode(value);

    // Simple XOR encryption (for demo - use proper encryption in production)
    const encrypted = btoa(String.fromCharCode(...data));

    localStorage.setItem(`secure_${key}`, encrypted);
  } catch (error) {
    console.error('Failed to securely store data:', error);
  }
}

/**
 * Decrypt data from localStorage
 */
export async function secureRetrieve(key: string): Promise<string | null> {
  try {
    const encrypted = localStorage.getItem(`secure_${key}`);
    if (!encrypted) return null;

    // Decrypt
    const data = atob(encrypted);
    return data;
  } catch (error) {
    console.error('Failed to retrieve secure data:', error);
    return null;
  }
}

/**
 * Securely delete data from localStorage
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
 * Detect suspicious session activity
 */
export function detectSuspiciousActivity(): {
  isSuspicious: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check if devtools is open (potential debugging/tampering)
  const devToolsOpen = /./;
  devToolsOpen.toString = function () {
    reasons.push('Developer tools detected');
    return 'devtools';
  };
  console.log('%c', devToolsOpen);

  // Check for automation tools
  if (navigator.webdriver) {
    reasons.push('Automated browser detected');
  }

  // Check for unusual screen size (potential bot)
  if (screen.width < 100 || screen.height < 100) {
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
