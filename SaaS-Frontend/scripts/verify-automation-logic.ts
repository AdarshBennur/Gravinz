
import { storage } from "../server/storage.ts";
import { processUserAutomation } from "../server/services/automation.ts";
import { supabaseAdmin } from "../server/supabase.ts";
import { eq } from "drizzle-orm";

// --- HELPER: RESET DB STATE ---
async function resetTestState(userId: string) {
    console.log("\n[Resetting Test State]...");
    await supabaseAdmin.from("contacts").delete().eq("user_id", userId);
    await supabaseAdmin.from("email_sends").delete().eq("user_id", userId);
    await supabaseAdmin.from("daily_usage").delete().eq("user_id", userId);
    await storage.upsertCampaignSettings(userId, {
        dailyLimit: 100,
        followupCount: 2,
        followupDelays: [2, 4],
        automationStatus: "running",
        startTime: "00:00", // Allow running now
        timezone: "UTC"
    });
}

async function createTestUser() {
    // Use existing user or create one
    let user = await storage.getUserByUsername("test_automation_user");
    if (!user) {
        user = await storage.createUser({
            username: "test_automation_user",
            password: "password123",
            email: "test_automation@example.com",
            fullName: "Test Automation User"
        });
    }
    return user.id;
}

// --- TEST 1: DUPLICATE PREVENTION ---
async function testDuplicatePrevention(userId: string) {
    console.log("\n🧪 TEST 1: Duplicate Prevention (Locking)");

    // 1. Insert Contact
    const contact = await storage.createContact(userId, {
        name: "Dup Test",
        email: "dup_test@example.com",
        status: "not-sent"
    });

    console.log("-> Inserted contact 'not-sent'");

    // 2. Trigger simultaneous runs
    console.log("-> Triggering 2 Process Runs simultaneously...");

    const p1 = processUserAutomation(userId);
    const p2 = processUserAutomation(userId);

    await Promise.allSettled([p1, p2]);

    // 3. Verify
    const sends = await storage.getEmailSendsForContact(userId, contact.id);
    const updatedContact = await storage.getContact(contact.id, userId);

    console.log(`-> Email Sends Count: ${sends.length} (Expected: 1)`);
    console.log(`-> Contact Status: ${updatedContact?.status} (Expected: 'sent' or 'sending_first' if stuck, but should be 'sent')`);
    console.log(`-> First Email Date: ${updatedContact?.firstEmailDate} (Expected: NOT NULL)`);

    if (sends.length === 1 && updatedContact?.status === "sent") {
        console.log("✅ PASS: Duplicate prevention worked.");
    } else {
        console.error("❌ FAIL: Duplicate prevention failed.");
        console.log("Sends:", sends);
    }
}

// --- TEST 2: FOLLOW-UP DELAY LOGIC ---
async function testFollowupDelay(userId: string) {
    console.log("\n🧪 TEST 2: Follow-up Delay Logic");

    // 1. Insert Contact: Sent NOW
    const contact = await storage.createContact(userId, {
        name: "Delay Test",
        email: "delay_test@example.com",
        status: "sent",
        // We can't easily insert firstEmailDate via createContact schema (it's optional but maybe not in insert schema?)
        // Let's use raw update to be sure
    });

    // Set firstEmailDate to NOW
    await supabaseAdmin.from("contacts").update({
        first_email_date: new Date().toISOString(),
        last_sent_at: new Date().toISOString()
    }).eq("id", contact.id);

    console.log("-> Contact set to 'sent' at NOW. Delay is 2 days.");

    // 2. Trigger Automation
    await processUserAutomation(userId);

    // 3. Verify NO send
    let sends = await storage.getEmailSendsForContact(userId, contact.id);
    console.log(`-> Immediate Run Sends: ${sends.length} (Expected: 0)`);

    if (sends.length > 0) {
        console.error("❌ FAIL: Sent follow-up too early!");
        return;
    }

    // 4. Simulate Time Travel (5 days ago)
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    await supabaseAdmin.from("contacts").update({
        first_email_date: fiveDaysAgo.toISOString(),
        last_sent_at: fiveDaysAgo.toISOString()
    }).eq("id", contact.id);

    console.log("-> Time Travel: Set 'first_email_date' to 5 days ago.");

    // 5. Trigger Automation
    await processUserAutomation(userId);

    // 6. Verify Send
    sends = await storage.getEmailSendsForContact(userId, contact.id);
    const updatedContact = await storage.getContact(contact.id, userId);

    console.log(`-> Time Travel Run Sends: ${sends.length} (Expected: 1)`);
    console.log(`-> Contact Status: ${updatedContact?.status} (Expected: 'followup-1')`);
    console.log(`-> Followup1 Date: ${updatedContact?.followup1Date}`);

    if (sends.length === 1 && updatedContact?.status === "followup-1") {
        console.log("✅ PASS: Follow-up delay logic worked.");
    } else {
        console.error("❌ FAIL: Follow-up not sent after delay.");
    }
}

// --- MAIN ---
async function run() {
    try {
        const userId = await createTestUser();

        // Mock Gmail Integration
        await storage.upsertIntegration(userId, "gmail", {
            accessToken: "mock_token",
            refreshToken: "mock_refresh",
            connected: true,
            tokenExpiresAt: new Date(Date.now() + 3600000)
        });

        await resetTestState(userId);
        await testDuplicatePrevention(userId);

        await resetTestState(userId);
        await testFollowupDelay(userId);

        console.log("\n🏁 Verification Complete.");
        process.exit(0);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
