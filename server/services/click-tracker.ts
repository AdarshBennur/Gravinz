/**
 * Click Tracking Service
 *
 * Provides:
 *   - signClickToken()   — HMAC-SHA256 signed token (emailSendId + userId + expiry)
 *   - verifyClickToken() — Verify and extract payload, reject expired tokens
 *   - rewriteLinksForTracking() — Rewrites <a href="http..."> links in HTML email body
 *
 * Token format: base64url(JSON payload) + "." + base64url(HMAC signature)
 * No DB lookup needed for token validation — fully self-contained.
 */

import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_HOURS = 72;

interface ClickTokenPayload {
    emailSendId: string;
    userId: string;
    exp: number; // Unix timestamp (seconds)
}

function getHmacSecret(): Buffer {
    const key = process.env.ENCRYPTION_KEY;
    if (!key) throw new Error("ENCRYPTION_KEY not set — cannot sign click tokens");
    // ENCRYPTION_KEY is a 64-char hex string → 32 bytes
    return Buffer.from(key.slice(0, 64), "hex");
}

function b64urlEncode(str: string): string {
    return Buffer.from(str, "utf-8")
        .toString("base64")
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function b64urlDecode(str: string): string {
    // Pad back to standard base64
    const padded = str + "=".repeat((4 - (str.length % 4)) % 4);
    return Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

/**
 * Sign a click tracking token for a given emailSendId + userId.
 * Returns a compact, URL-safe token string.
 */
export function signClickToken(emailSendId: string, userId: string): string {
    const payload: ClickTokenPayload = {
        emailSendId,
        userId,
        exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_HOURS * 3600,
    };

    const payloadEncoded = b64urlEncode(JSON.stringify(payload));
    const secret = getHmacSecret();
    const sig = createHmac("sha256", secret).update(payloadEncoded).digest("base64url");

    return `${payloadEncoded}.${sig}`;
}

/**
 * Verify a click token. Returns the payload on success, null on failure.
 * Rejects: invalid format, bad signature, expired tokens.
 */
export function verifyClickToken(token: string): ClickTokenPayload | null {
    try {
        const parts = token.split(".");
        if (parts.length !== 2) return null;

        const [payloadEncoded, receivedSig] = parts;

        const secret = getHmacSecret();
        const expectedSig = createHmac("sha256", secret).update(payloadEncoded).digest("base64url");

        // Constant-time comparison to prevent timing attacks
        const a = Buffer.from(expectedSig, "utf-8");
        const b = Buffer.from(receivedSig, "utf-8");
        if (a.length !== b.length || !timingSafeEqual(a, b)) {
            return null;
        }

        const payload: ClickTokenPayload = JSON.parse(b64urlDecode(payloadEncoded));

        // Reject expired tokens
        if (Math.floor(Date.now() / 1000) > payload.exp) {
            return null;
        }

        if (!payload.emailSendId || !payload.userId) return null;

        return payload;
    } catch {
        return null;
    }
}

/**
 * Rewrite all http/https links in an HTML email body to go through the click tracker.
 * - Skips mailto: links
 * - Skips anchor (#) links
 * - Skips links already pointing to /track/click
 * - Only rewrites href attributes (not src, action, etc.)
 */
export function rewriteLinksForTracking(
    html: string,
    emailSendId: string,
    userId: string,
    baseUrl: string
): string {
    // Regex: match href="..." or href='...' — captures the URL inside quotes
    // We only rewrite http:// and https:// links
    return html.replace(
        /href=["'](https?:\/\/[^"']+)["']/gi,
        (match, originalUrl) => {
            // Skip already-tracked links
            if (originalUrl.includes("/track/click")) return match;

            // Skip javascript: or data: (extra safety — regex above already excludes, but be explicit)
            const lower = originalUrl.toLowerCase();
            if (lower.startsWith("javascript:") || lower.startsWith("data:")) return match;

            const token = signClickToken(emailSendId, userId);
            const encodedUrl = encodeURIComponent(originalUrl);
            const trackUrl = `${baseUrl}/track/click?token=${token}&url=${encodedUrl}`;

            // Preserve the original quote style
            const quote = match[5]; // 5th char: h,r,e,f,= → next char is quote
            return `href=${quote}${trackUrl}${quote}`;
        }
    );
}
