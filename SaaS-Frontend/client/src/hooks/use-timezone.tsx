/**
 * use-timezone.tsx
 *
 * Global timezone context. Fetches the user's selected timezone from
 * /api/campaign-settings once and exposes it to the entire component tree.
 *
 * Usage:
 *   const tz = useTimezone();
 *   formatInUserTimezone(someDate, tz);
 */

import { createContext, useContext, ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";

interface CampaignSettingsTimezone {
    timezone?: string;
}

const TimezoneContext = createContext<string>("UTC");

/**
 * Wrap your app (or the authenticated portion) with this provider.
 * It fetches /api/campaign-settings and stores the timezone globally.
 * Falls back to "UTC" while loading or on error.
 */
export function TimezoneProvider({ children }: { children: ReactNode }) {
    const { data } = useQuery<CampaignSettingsTimezone>({
        queryKey: ["/api/campaign-settings"],
        queryFn: () => apiGet<CampaignSettingsTimezone>("/api/campaign-settings"),
        // Use a long stale time — timezone rarely changes mid-session
        staleTime: 5 * 60 * 1000,
        // Don't throw on error — just fall back to UTC
        retry: false,
    });

    const timezone = data?.timezone?.trim() || "UTC";

    return (
        <TimezoneContext.Provider value={timezone}>
            {children}
        </TimezoneContext.Provider>
    );
}

/**
 * Returns the user's selected timezone string (e.g. "Asia/Kolkata").
 * Falls back to "UTC" if not set or still loading.
 *
 * Must be used inside <TimezoneProvider>.
 */
export function useTimezone(): string {
    return useContext(TimezoneContext);
}
