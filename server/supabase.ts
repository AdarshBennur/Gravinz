import { createClient, SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables"
    );
}

/**
 * Admin Supabase client — uses the service-role key.
 * Has full access to auth admin endpoints and bypasses RLS.
 * Use this for server-side operations like creating users, managing auth, etc.
 */
export const supabaseAdmin: SupabaseClient = createClient(
    supabaseUrl,
    supabaseServiceRoleKey,
    {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    }
);

const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
    throw new Error("Missing SUPABASE_ANON_KEY environment variable");
}

/**
 * Creates a fresh anonymous client.
 * Use this for client-side operations (like signing in a user) where we don't want to persist session state
 * on a global singleton.
 */
export const createAnonClient = () => createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    }
});
