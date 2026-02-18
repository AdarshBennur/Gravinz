/**
 * date-utils.ts
 *
 * Single source of truth for all date/time formatting across the frontend.
 * All timestamps are stored in UTC in the DB. This module converts them
 * to the user's selected timezone (from campaign_settings.timezone) for display.
 *
 * Rules:
 *  - Always 12-hour format with AM/PM
 *  - Falls back to "UTC" if no timezone is provided
 *  - Returns "—" for null/undefined/invalid dates
 *  - Never mutates DB values — display layer only
 */

import { formatInTimeZone } from "date-fns-tz";
import { isValid, parseISO } from "date-fns";

const FALLBACK_TZ = "UTC";

/**
 * Safely parse a date value into a Date object.
 * Handles ISO strings, Date objects, and timestamps.
 */
function toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return isValid(value) ? value : null;
    // Try ISO parse first (most common — DB timestamps are ISO strings)
    const parsed = parseISO(value as string);
    if (isValid(parsed)) return parsed;
    // Fallback: native Date constructor
    const fallback = new Date(value as string);
    return isValid(fallback) ? fallback : null;
}

/**
 * Format a date in the user's selected timezone with 12-hour AM/PM.
 *
 * @param date     - ISO string, Date object, null, or undefined
 * @param timezone - IANA timezone string (e.g. "Asia/Kolkata"). Falls back to "UTC".
 * @param fmt      - date-fns format string. Defaults to "MMM d, yyyy hh:mm a"
 * @returns        Formatted string, or "—" if date is null/invalid
 *
 * @example
 * formatInUserTimezone("2024-03-15T14:30:00Z", "Asia/Kolkata")
 * // → "Mar 15, 2024 08:00 PM"
 *
 * formatInUserTimezone("2024-03-15T14:30:00Z", "Asia/Kolkata", "hh:mm a")
 * // → "08:00 PM"
 *
 * formatInUserTimezone(null, "Asia/Kolkata")
 * // → "—"
 */
export function formatInUserTimezone(
    date: string | Date | null | undefined,
    timezone: string | null | undefined,
    fmt: string = "MMM d, yyyy hh:mm a"
): string {
    const d = toDate(date);
    if (!d) return "—";

    const tz = timezone?.trim() || FALLBACK_TZ;

    try {
        return formatInTimeZone(d, tz, fmt);
    } catch {
        // If the timezone string is invalid, fall back to UTC
        try {
            return formatInTimeZone(d, FALLBACK_TZ, fmt);
        } catch {
            return "—";
        }
    }
}

/**
 * Format a date as a short relative-style label for inbox thread lists.
 * - Same day  → "hh:mm AM/PM"  (e.g. "09:05 AM")
 * - Yesterday → "Yesterday"
 * - This week → "Mon", "Tue", etc.
 * - Older     → "Mar 15"
 *
 * All comparisons are done in the user's timezone so "today" is correct
 * regardless of UTC offset.
 */
export function formatThreadTime(
    dateStr: string | null | undefined,
    timezone: string | null | undefined
): string {
    if (!dateStr) return "";
    const d = toDate(dateStr);
    if (!d) return "";

    const tz = timezone?.trim() || FALLBACK_TZ;

    try {
        // Get "today" in the user's timezone as a YYYY-MM-DD string
        const todayStr = formatInTimeZone(new Date(), tz, "yyyy-MM-dd");
        const dateOnlyStr = formatInTimeZone(d, tz, "yyyy-MM-dd");

        const todayDate = new Date(todayStr);
        const msgDate = new Date(dateOnlyStr);
        const diffDays = Math.round(
            (todayDate.getTime() - msgDate.getTime()) / (1000 * 60 * 60 * 24)
        );

        if (diffDays === 0) {
            return formatInTimeZone(d, tz, "hh:mm a");
        } else if (diffDays === 1) {
            return "Yesterday";
        } else if (diffDays < 7) {
            return formatInTimeZone(d, tz, "EEE");
        }
        return formatInTimeZone(d, tz, "MMM d");
    } catch {
        return "";
    }
}

/**
 * Format a date as a full human-readable string for tooltips / detail views.
 * e.g. "Mon, Mar 15 09:05 AM"
 */
export function formatFullDate(
    dateStr: string | null | undefined,
    timezone: string | null | undefined
): string {
    if (!dateStr) return "";
    const d = toDate(dateStr);
    if (!d) return "";
    return formatInUserTimezone(d, timezone, "EEE, MMM d hh:mm a");
}
