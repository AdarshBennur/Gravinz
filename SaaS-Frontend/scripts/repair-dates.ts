// Standalone repair script - directly updates Supabase contacts with dates from notion_data
// Run: npx tsx scripts/repair-dates.ts

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://afjoxydurvgrydulhaar.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_KEY) {
    console.error('SUPABASE_SERVICE_ROLE_KEY is required. Run with: source .env && npx tsx scripts/repair-dates.ts');
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function repair() {
    const userId = 'a20df6d3-8270-4424-8b4e-43d863e68834';

    console.log('=== STEP 1a: BEFORE REPAIR ===\n');
    const { data: before, error: e1 } = await supabase
        .from('contacts')
        .select('id, email, status, first_email_date, followup1_date, followup2_date, notion_data, created_at')
        .eq('user_id', userId)
        .order('notion_row_order');

    if (e1) { console.error('Query error:', e1); process.exit(1); }

    console.table(before!.map(c => ({
        email: c.email,
        status: c.status,
        first_email_date: c.first_email_date?.split('T')[0] || 'NULL',
        followup1_date: c.followup1_date?.split('T')[0] || 'NULL',
        followup2_date: c.followup2_date?.split('T')[0] || 'NULL',
        notion_first: c.notion_data?.['First Email Date'] || 'NULL',
        notion_f1: c.notion_data?.['Follow-up 1 Date'] || 'NULL',
        notion_f2: c.notion_data?.['Follow-up 2 Date'] || 'NULL',
    })));

    console.log('\n=== STEP 1b: RUNNING REPAIR ===\n');

    let repaired = 0;
    for (const c of before!) {
        const updates: Record<string, any> = {};
        const nd = c.notion_data as Record<string, any> | null;

        const tryDate = (key: string) => {
            if (nd?.[key]) {
                const d = new Date(nd[key]);
                if (!isNaN(d.getTime())) return d.toISOString();
            }
            return c.created_at; // fallback
        };

        if (c.status === 'sent' && !c.first_email_date) {
            updates.first_email_date = tryDate('First Email Date');
        }
        if (c.status === 'followup-1') {
            if (!c.first_email_date) updates.first_email_date = tryDate('First Email Date');
            if (!c.followup1_date) updates.followup1_date = tryDate('Follow-up 1 Date');
        }
        if (c.status === 'followup-2') {
            if (!c.first_email_date) updates.first_email_date = tryDate('First Email Date');
            if (!c.followup1_date) updates.followup1_date = tryDate('Follow-up 1 Date');
            if (!c.followup2_date) updates.followup2_date = tryDate('Follow-up 2 Date');
        }

        if (Object.keys(updates).length > 0) {
            console.log(`REPAIRING ${c.email} (${c.status}):`, updates);
            const { error } = await supabase
                .from('contacts')
                .update(updates)
                .eq('id', c.id);
            if (error) {
                console.error(`  FAILED:`, error);
            } else {
                console.log(`  SUCCESS`);
                repaired++;
            }
        } else {
            console.log(`SKIP ${c.email} (${c.status}): dates are consistent`);
        }
    }

    console.log(`\n=== STEP 1c: AFTER REPAIR (${repaired} fixed) ===\n`);

    const { data: after } = await supabase
        .from('contacts')
        .select('id, email, status, first_email_date, followup1_date, followup2_date')
        .eq('user_id', userId)
        .order('notion_row_order');

    console.table(after!.map(c => ({
        email: c.email,
        status: c.status,
        first_email_date: c.first_email_date?.split('T')[0] || 'NULL',
        followup1_date: c.followup1_date?.split('T')[0] || 'NULL',
        followup2_date: c.followup2_date?.split('T')[0] || 'NULL',
        consistent: validateConsistency(c),
    })));

    // Final validation
    console.log('\n=== VALIDATION ===');
    for (const c of after!) {
        const ok = validateConsistency(c);
        console.log(`${ok ? '✅' : '❌'} ${c.email}: status=${c.status}, first=${c.first_email_date?.split('T')[0] || 'NULL'}, f1=${c.followup1_date?.split('T')[0] || 'NULL'}, f2=${c.followup2_date?.split('T')[0] || 'NULL'}`);
    }
}

function validateConsistency(c: any): string {
    if (c.status === 'not-sent') return '✅';
    if (c.status === 'sent') return c.first_email_date ? '✅' : '❌ missing firstEmailDate';
    if (c.status === 'followup-1') {
        if (!c.first_email_date) return '❌ missing firstEmailDate';
        if (!c.followup1_date) return '❌ missing followup1Date';
        return '✅';
    }
    if (c.status === 'followup-2') {
        if (!c.first_email_date) return '❌ missing firstEmailDate';
        if (!c.followup1_date) return '❌ missing followup1Date';
        if (!c.followup2_date) return '❌ missing followup2Date';
        return '✅';
    }
    return '✅';
}

repair().catch(console.error);
