import crypto from "crypto";

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

if (!ENCRYPTION_KEY) {
    throw new Error("ENCRYPTION_KEY environment variable is required");
}

if (ENCRYPTION_KEY.length < KEY_LENGTH) {
    throw new Error(`ENCRYPTION_KEY must be at least ${KEY_LENGTH} characters long`);
}

// Derive a consistent 32-byte key from the provided encryption key
const derivedKey = crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64-encoded string containing: IV + auth tag + ciphertext
 */
export function encryptToken(plaintext: string): string {
    if (!plaintext) {
        throw new Error("Cannot encrypt empty plaintext");
    }

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, derivedKey, iv);

    let ciphertext = cipher.update(plaintext, "utf8", "base64");
    ciphertext += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    // Combine: IV + auth tag + ciphertext, all base64 encoded
    const combined = Buffer.concat([
        iv,
        authTag,
        Buffer.from(ciphertext, "base64"),
    ]);

    return combined.toString("base64");
}

/**
 * Decrypts a ciphertext string encrypted with encryptToken.
 * Expects base64-encoded string containing: IV + auth tag + ciphertext
 */
export function decryptToken(ciphertext: string): string {
    if (!ciphertext) {
        throw new Error("Cannot decrypt empty ciphertext");
    }

    const combined = Buffer.from(ciphertext, "base64");

    // Extract components
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encryptedData = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = crypto.createDecipheriv(ALGORITHM, derivedKey, iv);
    decipher.setAuthTag(authTag);

    let plaintext = decipher.update(encryptedData, undefined, "utf8");
    plaintext += decipher.final("utf8");

    return plaintext;
}
