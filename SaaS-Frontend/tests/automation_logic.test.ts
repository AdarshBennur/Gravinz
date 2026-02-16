
import { processUserAutomation } from "../server/services/automation";
import { storage } from "../server/storage";
import { generateEmail } from "../server/services/email-generator";
import { sendEmail } from "../server/services/gmail";

// Mocks
jest.mock("../server/storage");
jest.mock("../server/services/email-generator");
jest.mock("../server/services/gmail");
jest.mock("../server/services/notion");

describe("Automation Logic", () => {
    const userId = "test-user";

    beforeEach(() => {
        jest.clearAllMocks();
        jest.useFakeTimers();
        (storage.getCampaignSettings as jest.Mock).mockResolvedValue({
            automationStatus: "running",
            startTime: "00:00",
            dailyLimit: 10,
            followupCount: 2,
            followupDelays: [2, 4],
            timezone: "UTC"
        });
        (storage.getIntegration as jest.Mock).mockResolvedValue({ connected: true });
        (storage.getDailyUsage as jest.Mock).mockResolvedValue({ emailsSent: 0 });
        (storage.getUserProfile as jest.Mock).mockResolvedValue({ resumeUrl: "http://resume.pdf" });
        (generateEmail as jest.Mock).mockResolvedValue({ subject: "Test", body: "Body", resumeUrl: "http://resume.pdf" });
        (sendEmail as jest.Mock).mockResolvedValue({ messageId: "msg1", threadId: "thread1" });
        (storage.getEmailSendsForContact as jest.Mock).mockResolvedValue([]);
    });

    afterEach(() => {
        jest.useRealTimers();
    });

    test("Send FIRST email if status is 'not-sent'", async () => {
        const contact = { id: "c1", email: "test@example.com", status: "not-sent", name: "Test" };
        (storage.getContacts as jest.Mock).mockResolvedValue([contact]);

        const promise = processUserAutomation(userId);
        jest.advanceTimersByTime(60000); // Skip 60s delay
        await promise;

        expect(generateEmail).toHaveBeenCalledWith(expect.objectContaining({ isFollowup: false }));
        expect(sendEmail).toHaveBeenCalled();
        expect(storage.updateContact).toHaveBeenCalledWith("c1", userId, expect.objectContaining({ status: "sent" }));
    });

    test("Send FOLLOW-UP 1 if status is 'sent' and delay passed", async () => {
        const contact = {
            id: "c1",
            email: "test@example.com",
            status: "sent",
            name: "Test",
            lastSentAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)
        };
        (storage.getContacts as jest.Mock).mockResolvedValue([contact]);

        const promise = processUserAutomation(userId);
        jest.advanceTimersByTime(60000);
        await promise;

        expect(generateEmail).toHaveBeenCalledWith(expect.objectContaining({ isFollowup: true, followupNumber: 1 }));
        expect(sendEmail).toHaveBeenCalled();
        expect(storage.updateContact).toHaveBeenCalledWith("c1", userId, expect.objectContaining({ status: "followup-1" }));
    });

    test("Do NOT send FOLLOW-UP if delay NOT passed", async () => {
        const contact = {
            id: "c1",
            email: "test@example.com",
            status: "sent",
            name: "Test",
            lastSentAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000)
        };
        (storage.getContacts as jest.Mock).mockResolvedValue([contact]);

        const promise = processUserAutomation(userId);
        jest.advanceTimersByTime(60000);
        await promise;

        expect(sendEmail).not.toHaveBeenCalled();
    });

    test("Stop if Replied", async () => {
        const contact = { id: "c1", email: "test@example.com", status: "replied", name: "Test" };
        (storage.getContacts as jest.Mock).mockResolvedValue([contact]);

        const promise = processUserAutomation(userId);
        jest.advanceTimersByTime(60000);
        await promise;

        expect(sendEmail).not.toHaveBeenCalled();
    });
});
