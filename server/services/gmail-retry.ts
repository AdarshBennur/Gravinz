/**
 * Gmail Send Retry with Exponential Backoff
 *
 * Wraps the sendEmail function with retry logic to handle transient Gmail API failures.
 * - Max 3 retries
 * - Exponential backoff: 2s, 4s, 8s
 * - Only retries on transient errors (429, 500, 503)
 * - Non-retryable errors (400, 401, 403, 404) throw immediately
 */

import { sendEmail } from "./gmail";

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 2000; // 2 seconds

interface RetryableError {
    response?: { status?: number };
    code?: string;
    message?: string;
}

function isRetryable(error: RetryableError): boolean {
    const status = error.response?.status;
    // Rate limited, server error, or service unavailable
    if (status && [429, 500, 502, 503].includes(status)) return true;
    // Network-level errors
    if (error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "ENOTFOUND") return true;
    return false;
}

export async function sendEmailWithRetry(
    userId: string,
    to: string,
    subject: string,
    body: string,
    threadId?: string,
    inReplyToMessageId?: string,
    attachments: { filename: string; content: Buffer; contentType: string }[] = []
): Promise<{ messageId: string; threadId: string }> {
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await sendEmail(userId, to, subject, body, threadId, inReplyToMessageId, attachments);
        } catch (error: any) {
            lastError = error;

            if (!isRetryable(error)) {
                // Non-retryable error — fail immediately
                console.error(`[Gmail Retry] Non-retryable error (attempt ${attempt}): ${error.message}`);
                throw error;
            }

            if (attempt < MAX_RETRIES) {
                const delay = BASE_DELAY_MS * Math.pow(2, attempt - 1); // 2s, 4s, 8s
                console.warn(
                    `[Gmail Retry] Transient error (attempt ${attempt}/${MAX_RETRIES}). ` +
                    `Status: ${error.response?.status || "N/A"}. Retrying in ${delay}ms...`
                );
                await new Promise((resolve) => setTimeout(resolve, delay));
            } else {
                console.error(
                    `[Gmail Retry] All ${MAX_RETRIES} attempts exhausted. Last error: ${error.message}`
                );
            }
        }
    }

    throw lastError;
}
