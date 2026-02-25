// ALL date formatting in the application MUST go through this file.
// Direct formatting elsewhere is forbidden.
//
// date-utils.ts
//
// Single source of truth for all date/time formatting across the frontend.
// All timestamps are stored in UTC in the DB. This module converts them
// to the user's selected timezone (from campaign_settings.timezone) for display.
//
// Rules:
//  - Always 12-hour format with AM/PM
//  - Falls back to "UTC" if no timezone is provided
//  - Returns "—" for null/undefined/invalid dates
//  - Never mutates DB values — display layer only

import { formatInTimeZone } from "date-fns-tz";
import { isValid, parseISO } from "date-fns";

const FALLBACK_TZ = "UTC";

/**
 * Normalize a bare ISO datetime string to explicit UTC.
 *
 * Postgres TIMESTAMP WITHOUT TIME ZONE columns (e.g. sent_at, created_at)
 * return strings like "2026-02-25T10:35:13.75" — no Z, no offset.
 * date-fns parseISO treats no-offset strings as LOCAL time, causing a
 * double-conversion when we later apply formatInTimeZone.
 *
 * Rule: if it looks like an ISO datetime with no Z or +/- offset,
 * it came from Postgres and IS stored as UTC → append Z.
 * Strings that already have Z or ±HH:MM are left unchanged.
 */
function normalizeToUTC(value: string): string {
    // Already has timezone info — leave alone
    if (/[Zz]$/.test(value) || /[+-]\d{2}:\d{2}$/.test(value)) {
        return value;
    }
    // Looks like ISO datetime (has T separator) → treat as UTC
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
        return value + "Z";
    }
    return value;
}

/**
 * Safely parse a date value into a Date object.
 * Handles ISO strings, Date objects, and timestamps.
 * Bare ISO strings (no Z / offset) are treated as UTC.
 */
function toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    if (value instanceof Date) return isValid(value) ? value : null;
    // Normalize no-offset ISO strings to UTC before parsing
    const normalized = normalizeToUTC(value as string);
    const parsed = parseISO(normalized);
    if (isValid(parsed)) return parsed;
    // Fallback: native Date constructor (handles edge cases)
    const fallback = new Date(normalized);
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
 * Format a full human-readable string for tooltips / detail views.
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

/**
 * Convert a 24-hour "HH:MM" time string (as stored in campaign_settings.start_time)
 * to a 12-hour AM/PM display string.
 *
 * @param timeStr - "HH:MM" string, e.g. "09:00" or "21:30"
 * @returns        "09:00 AM" / "09:30 PM", or the raw string if parsing fails
 *
 * @example
 * formatStartTime("09:00")  // → "09:00 AM"
 * formatStartTime("21:30")  // → "09:30 PM"
 * formatStartTime(undefined) // → "—"
 */
export function formatStartTime(timeStr: string | null | undefined): string {
    if (!timeStr) return "—";
    const [hourStr, minuteStr] = timeStr.split(":");
    const hour = parseInt(hourStr ?? "", 10);
    const minute = parseInt(minuteStr ?? "", 10);
    if (isNaN(hour) || isNaN(minute)) return timeStr;
    const period = hour >= 12 ? "PM" : "AM";
    const h12 = hour % 12 === 0 ? 12 : hour % 12;
    return `${String(h12).padStart(2, "0")}:${String(minute).padStart(2, "0")} ${period}`;
}
