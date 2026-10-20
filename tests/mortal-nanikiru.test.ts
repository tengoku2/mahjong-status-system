import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { createApiServer } from "../src/external-api.js";
import { Collection, MessageFlags, type Client } from "discord.js";
import type { MortalCandidate } from "@prisma/client";
const { db } = vi.hoisted(() => ({ db: {} as any }));
vi.mock("../src/prisma.js", () => ({ prisma: db }));
import { answerComparison, answerMenu, deliverMortalCandidate, handleMortalAnswer, handleMortalFeedback, problemEmbed, processMortalQueue, registerMortalImport, selectMortalManually } from "../src/mortal-nanikiru.js";
import { classifyDecision, inWindow, parseImport, shapeCounts, tileNumber, WEEK_MS, type DecisionInput } from "../src/mortal-nanikiru-domain.js";
import { MADOROMI_GUILD_ID } from "../src/guild-rules.js";
const now = new Date("2026-10-20T12:00:00+09:00");
function decision(gap = 0, entry = 1): DecisionInput {
    // A synthetic open hand: keep tenpai or retain an extra two-sided shape.
    const hand = ["4m", "4m", "5p", "6p", "7p", "3s", "4s", "8s", "8s", "8s", "3m"];
    return { anchor: "kyoku-6-0", entry, round: "南3局", turn: 2, hand, melds: [["7m", "5m", "6m"]], actual: gap ? "打 4m" : "打 3m",
        actions: ["3m", "4m", "8s", "7p", "4s", "6p", "5p", "3s"].map((t, i) => ({ action: `打 ${t}`, q: i === 0 ? 0 : i === 1 ? -gap : -2 - i })), seat: 1, startingScores: [25000, 25000, 25000, 25000] };
}
const review = (id: string, days: number, gaps: number[]) => ({ id: id.repeat(64), playedAt: new Date(now.getTime() - days * 86400000).toISOString(), decisions: gaps.map((g, i) => decision(g, i + 1)) });
let reviews: Map<string, any>, batches: Map<string, any>, candidates: Map<string, any>, answers: Map<string, any>, feedback: Map<string, any>;
function matches(p: any, w: any = {}) {
    for (const [key, value] of Object.entries(w)) {
        if (value === undefined)
            continue;
        if (key === "review") {
            const date = reviews.get(p.reviewId).playedAt, range = (value as any).playedAt;
            if (!date || date < range.gte || date > range.lte)
                return false;
        }
        else if (value && typeof value === "object" && !(value instanceof Date)) {
            const v = value as any;
            if ("in" in v && !v.in.includes(p[key]))
                return false;
            if ("not" in v && p[key] === v.not)
                return false;
            if ("lte" in v && (!p[key] || p[key] > v.lte))
                return false;
        }
        else if (p[key] !== value)
            return false;
    }
    return true;
}
beforeEach(() => {
    reviews = new Map();
    batches = new Map();
    candidates = new Map();
    answers = new Map();
    feedback = new Map();
    let tail = Promise.resolve();
    db.$transaction = async (fn: any) => { const previous = tail; let unlock!: () => void; tail = new Promise<void>(resolve => unlock = resolve); await previous; try {
        return await fn(db);
    }
    finally {
        unlock();
    } };
    db.$queryRaw = vi.fn().mockResolvedValue([]);
    db.mortalBatch = { findUnique: vi.fn(async ({ where }: any) => batches.get(where.id) ?? null), create: vi.fn(async ({ data }: any) => { batches.set(data.id, data); return data; }) };
    db.mortalReview = { findUnique: vi.fn(async ({ where }: any) => reviews.get(where.id) ?? null), findUniqueOrThrow: vi.fn(async ({ where }: any) => reviews.get(where.id)),
        findMany: vi.fn(async () => [...reviews.values()]), findFirst: vi.fn(async () => [...reviews.values()].filter(r => r.playedAt).sort((a, b) => b.playedAt - a.playedAt)[0] ?? null),
        create: vi.fn(async ({ data }: any) => { reviews.set(data.id, data); return data; }) };
    db.mortalCandidate = { createMany: vi.fn(async ({ data }: any) => { for (const p of data)
            candidates.set(p.id, { ...p, batchId: null, delivery: "ready", issuedAt: null, attemptAt: null, messageId: null, channelId: null, closedAt: null, closesAt: null, closeSynced: false, resultChannelId: null, resultDelivery: "ready", resultMessageId: null, resultAttemptAt: null }); }),
        findMany: vi.fn(async ({ where, include }: any) => [...candidates.values()].filter(p => matches(p, where)).map(p => include?.review ? { ...p, review: reviews.get(p.reviewId) } : { ...p })),
        findUnique: vi.fn(async ({ where }: any) => candidates.get(where.id) ?? null),
        updateMany: vi.fn(async ({ where, data }: any) => { let count = 0; for (const p of candidates.values())
            if (matches(p, where)) {
                Object.assign(p, data);
                count++;
            } return { count }; }),
        update: vi.fn(async ({ where, data }: any) => { Object.assign(candidates.get(where.id), data); return candidates.get(where.id); }) };
    db.nanikiruGuildSetting = { findUnique: vi.fn().mockResolvedValue({ questionChannelId: "channel", resultChannelId: null }) };
    db.mortalAnswer = { upsert: vi.fn(async ({ create }: any) => { if (!answers.has(create.interactionId))
            answers.set(create.interactionId, { ...create, createdAt: new Date() }); }), findMany: vi.fn(async ({ where }: any) => [...answers.values()].filter(p => matches(p, where)).reverse()), findFirst: vi.fn(async ({ where }: any) => [...answers.values()].find(p => matches(p, where))) };
    db.mortalFeedback = { upsert: vi.fn(async ({ create }: any) => feedback.set(create.interactionId, create)) };
});
function discord() {
    const history = new Collection<string, any>();
    const channel: any = { id: "channel", guildId: MADOROMI_GUILD_ID, isSendable: () => true, messages: { fetch: vi.fn(async (q: any) => typeof q === "string" ? history.get(q) : history) }, send: vi.fn(async (options: any) => {
            const m = { id: `message${history.size + 1}`, author: { id: "bot" }, createdAt: new Date(), createdTimestamp: Date.now(), embeds: options.embeds.map((e: any) => e.toJSON()), edit: vi.fn() };
            history.set(m.id, m);
            return m;
        }) };
    const client = { user: { id: "bot" }, isReady: () => true, channels: { fetch: vi.fn(async () => channel) } } as unknown as Client;
    return { client, channel, history };
}
async function reserved() {
    const r = review("a", 0, [.1]);
    r.playedAt = new Date().toISOString();
    await registerMortalImport({ baseline: false, reviews: [r] });
    return [...candidates.values()][0] as MortalCandidate;
}
describe("Mortal candidate rules", () => {
    it("includes zero and tiny gaps and early turns when there is a shape branch", () => {
        expect(classifyDecision(decision())?.gap).toBe(0);
        expect(classifyDecision(decision(.00001))?.gap).toBe(.00001);
        expect(classifyDecision(decision())?.metrics.find(m => m.tile === "3m")?.shanten).toBe(0);
    });
    it("excludes isolated-tile tidying even with a large gap", () => {
        const d = decision(5);
        d.hand[d.hand.indexOf("3m")] = "e";
        d.actions[0].action = "打 e";
        expect(classifyDecision(d)).toBeNull();
    });
    it("does not count completed sequences as incomplete shapes", () => {
        expect(shapeCounts([0, 1, 2, 9, 10, 11, 18, 19, 20, 24, 24, 24, 27])).toMatchObject({ shanten: 0, ryanmen: 0 });
    });
    it("validates timezone, physical tiles, complete choices and distinct red fives", () => {
        const input = { baseline: false, reviews: [review("a", 0, [.1])] };
        expect(parseImport(input).reviews).toHaveLength(1);
        expect(() => parseImport({ ...input, reviews: [{ ...input.reviews[0], playedAt: "2026-10-20T12:00:00" }] })).toThrow();
        const bad = structuredClone(input);
        bad.reviews[0].decisions[0].actions.pop();
        expect(() => parseImport(bad)).toThrow();
        const red = decision();
        red.hand[2] = "5pr";
        red.actions.find(a => a.action === "打 5p")!.action = "打 5pr";
        expect(parseImport({ baseline: true, reviews: [{ ...review("a", 0, []), decisions: [red] }] }).reviews[0].decisions[0].hand).toContain("5pr");
        expect(tileNumber("5pr")).toBe(tileNumber("5p"));
    });
    it("uses an inclusive 168-hour actual-game window", () => {
        expect(inWindow(new Date(now.getTime() - WEEK_MS), now)).toBe(true);
        expect(inWindow(new Date(now.getTime() - WEEK_MS - 1), now)).toBe(false);
        expect(inWindow(new Date(now.getTime() + 1), now)).toBe(false);
        expect(inWindow(null, now)).toBe(false);
    });
});
describe("Mortal persistent selection", () => {
    it("uses only the newest newly imported game, then ranks past unissued across games", async () => {
        const input = { baseline: false, reviews: [review("a", 3, [1.2, .95, .6]), review("b", 1, [.9, .8, .4]), review("c", 0, [.75, .65, .5])] };
        const first = await registerMortalImport(input, now);
        const selected = () => [...candidates.values()].filter(c => c.batchId === first.batchId);
        expect(selected().map(c => c.gap).sort()).toEqual([.5, .65, .75]);
        const past = await selectMortalManually("manual1", "past", now);
        expect([...candidates.values()].filter(c => c.batchId === past).map(c => c.gap).sort()).toEqual([.9, .95, 1.2]);
        expect([...candidates.values()].every(c => c.issuedAt === null)).toBe(true);
    });
    it("does not refill a short latest game from older candidates", async () => {
        const result = await registerMortalImport({ baseline: false, reviews: [review("a", 1, [3, 2, 1]), review("b", 0, [.2, .1])] }, now);
        expect([...candidates.values()].filter(c => c.batchId === result.batchId)).toHaveLength(2);
    });
    it("an empty latest game does not borrow older candidates", async () => {
        const result = await registerMortalImport({ baseline: false, reviews: [review("a", 1, [1]), review("b", 0, [])] }, now);
        expect([...candidates.values()].filter(c => c.batchId === result.batchId)).toHaveLength(0);
    });
    it("reimports, filename-free identities and concurrent imports preserve the frozen set", async () => {
        const input = { baseline: false, reviews: [review("a", 0, [.5, .4, .3, .2])] };
        const results = await Promise.all([registerMortalImport(input, now), registerMortalImport(input, now)]);
        expect(new Set(results.map(r => r.batchId)).size).toBe(1);
        expect(candidates.size).toBe(4);
        expect([...candidates.values()].filter(c => c.batchId)).toHaveLength(3);
        await registerMortalImport(input, now);
        expect(batches.size).toBe(1);
    });
    it("baselines retain all candidates without posting; expiry retains history", async () => {
        await registerMortalImport({ baseline: true, reviews: [review("a", 8, [2]), review("b", 0, [1])] }, now);
        expect(candidates.size).toBe(2);
        expect([...candidates.values()].some(c => c.batchId)).toBe(false);
        await selectMortalManually("past", "past", now);
        expect([...candidates.values()].filter(c => c.batchId)).toHaveLength(1);
        expect(candidates.size).toBe(2);
    });
});
describe("Mortal Discord delivery and privacy", () => {
    it("marks only a successful post as issued and never leaks Q ordering in choices", async () => {
        const p = await reserved(), { client, channel } = discord();
        await deliverMortalCandidate(client, p);
        expect(p.issuedAt).toBeInstanceOf(Date);
        expect(p.messageId).toBeTruthy();
        expect(channel.send.mock.calls[0][0]).toMatchObject({ enforceNonce: true, allowedMentions: { parse: [] } });
        const publicText = JSON.stringify(problemEmbed(p).toJSON());
        expect(publicText).not.toContain("actualTile");
        expect(publicText).not.toContain("gap");
        const options = answerMenu(p).toJSON().components[0].options;
        expect(options[0].value).toBe("3m");
        expect(options.every(o => !o.description)).toBe(true);
        expect(answerMenu({ ...p, data: { ...(p.data as any), metrics: [...(p.data as any).metrics].reverse() } }).toJSON().components[0].options.map(o => o.value)).toEqual(options.map(o => o.value));
    });
    it("does not issue a failed post; a definitive rejection can be retried", async () => {
        const p = await reserved(), { client, channel } = discord();
        channel.send.mockRejectedValueOnce({ status: 403 });
        await expect(deliverMortalCandidate(client, p)).rejects.toThrow();
        expect(p.issuedAt).toBeNull();
        expect(p.delivery).toBe("ready");
        await deliverMortalCandidate(client, p);
        expect(p.issuedAt).not.toBeNull();
    });
    it("never resends an ambiguous timeout without positive message evidence", async () => {
        const p = await reserved(), { client, channel } = discord();
        channel.send.mockRejectedValueOnce(new Error("timeout"));
        await expect(deliverMortalCandidate(client, p)).rejects.toThrow();
        await deliverMortalCandidate(client, p);
        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(p.delivery).toBe("uncertain");
        expect(p.issuedAt).toBeNull();
    });
    it("reconciles send-success/database-failure after restart without a duplicate", async () => {
        const p = await reserved(), { client, channel } = discord();
        db.mortalCandidate.update.mockRejectedValueOnce(new Error("db offline"));
        await expect(deliverMortalCandidate(client, p)).rejects.toThrow();
        expect(p.delivery).toBe("sending");
        await deliverMortalCandidate(client, p);
        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(p.issuedAt).not.toBeNull();
    });
    it("concurrent workers only claim one Discord post", async () => {
        const p = await reserved(), { client, channel } = discord();
        await Promise.all([deliverMortalCandidate(client, p), deliverMortalCandidate(client, p)]);
        expect(channel.send).toHaveBeenCalledTimes(1);
    });
    it("preserves an expired reservation without posting", async () => {
        const p = await reserved(), { client, channel } = discord();
        reviews.get(p.reviewId).playedAt = new Date(Date.now() - WEEK_MS - 1);
        await deliverMortalCandidate(client, p);
        expect(channel.send).not.toHaveBeenCalled();
        expect(p.delivery).toBe("expired");
        expect(p.batchId).toBeTruthy();
        expect(p.issuedAt).toBeNull();
    });
    it("replies privately and records each respondent and answer revision separately", async () => {
        const p = await reserved(), { client } = discord();
        await deliverMortalCandidate(client, p);
        const i: any = { customId: `mjs:mortal:a:${p.id}`, values: ["4m"], guildId: MADOROMI_GUILD_ID, message: { id: p.messageId }, user: { id: "person1" }, id: "answer1", deferReply: vi.fn(), editReply: vi.fn() };
        await handleMortalAnswer(i);
        expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(i.editReply.mock.calls[0][0].content).toContain("実戦：");
        i.id = "answer2";
        i.values = ["3m"];
        await handleMortalAnswer(i);
        i.id = "answer3";
        i.user.id = "person2";
        await handleMortalAnswer(i);
        expect(answers.size).toBe(3);
        expect(p.issuedAt).not.toBeNull();
        expect(answerComparison(p.data as any, "3m")).toContain("最大Q値と一致");
        i.id = "feedback1";
        i.customId = `mjs:mortal:f:${p.id}:simple`;
        await handleMortalFeedback(i);
        expect(feedback.size).toBe(1);
    });
    it("rejects expired answers, closes after restart and shows only the public distribution", async () => {
        const p = await reserved(), { client, history } = discord();
        await deliverMortalCandidate(client, p);
        p.closesAt = new Date(Date.now() - 1);
        const i: any = { customId: `mjs:mortal:a:${p.id}`, values: ["3m"], guildId: MADOROMI_GUILD_ID, message: { id: p.messageId }, user: { id: "person1" }, id: "late", deferReply: vi.fn(), editReply: vi.fn() };
        await expect(handleMortalAnswer(i)).rejects.toThrow("受付は終了");
        expect(answers.size).toBe(0);
        await processMortalQueue(client);
        expect(p.closedAt).not.toBeNull();
        expect(p.closeSynced).toBe(true);
        const edit = history.get(p.messageId!)!.edit.mock.calls[0][0];
        expect(edit.components).toEqual([]);
        expect(edit.embeds[0].toJSON().description).not.toContain("実戦：");
    });
});
describe("Mortal import API", () => {
    afterEach(() => vi.unstubAllEnvs());
    async function post(body: unknown, authorization?: string, method = "POST") {
        const server = createApiServer({ isReady: () => false } as unknown as Client);
        await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
        try {
            const port = (server.address() as AddressInfo).port;
            return await fetch(`http://127.0.0.1:${port}/api/mortal-nanikiru/import`, { method, headers: { ...(authorization ? { authorization } : {}), "content-type": "application/json" }, body: method === "POST" ? JSON.stringify(body) : undefined });
        }
        finally {
            server.closeAllConnections();
            await new Promise<void>(resolve => server.close(() => resolve()));
        }
    }
    it("is disabled without a key and rejects unauthenticated imports", async () => {
        vi.stubEnv("EXTERNAL_API_KEY", "");
        expect((await post({})).status).toBe(503);
        vi.stubEnv("EXTERNAL_API_KEY", "test-key");
        expect((await post({})).status).toBe(401);
        expect((await post({}, "test-key")).status).toBe(401);
        expect(reviews.size).toBe(0);
    });
    it("validates bodies before writing and only accepts POST", async () => {
        vi.stubEnv("EXTERNAL_API_KEY", "test-key");
        expect((await post({}, "Bearer test-key")).status).toBe(400);
        expect((await post({}, "Bearer test-key", "GET")).status).toBe(405);
        expect(reviews.size).toBe(0);
    });
    it("acknowledges a durable baseline and repeated import without Discord posts", async () => {
        vi.stubEnv("EXTERNAL_API_KEY", "test-key");
        const payload = { baseline: true, reviews: [review("a", 0, [.1])] };
        const first = await post(payload, "Bearer test-key");
        expect(first.status).toBe(200);
        expect(await first.json()).toMatchObject({ ok: true, addedReviews: 1 });
        expect(await (await post(payload, "Bearer test-key")).json()).toMatchObject({ duplicate: true });
        expect([...candidates.values()].some(c => c.batchId)).toBe(false);
    });
});

it("reconciles a result-channel send after DB failure and publishes no comparison", async () => {
    db.nanikiruGuildSetting.findUnique.mockResolvedValue({ questionChannelId:"channel", resultChannelId:"results" });
    const p=await reserved(), first=discord(), result=discord();
    result.channel.id="results";
    (first.client.channels.fetch as any).mockImplementation(async(id:string)=>id==="results"?result.channel:first.channel);
    await deliverMortalCandidate(first.client,p);
    p.closesAt=new Date(Date.now()-1);
    db.mortalCandidate.update.mockRejectedValueOnce(new Error("db offline after result POST"));
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
        await processMortalQueue(first.client);
        expect(result.channel.send).toHaveBeenCalledTimes(1);
        expect(p.closeSynced).toBe(false);
        await processMortalQueue(first.client);
        expect(result.channel.send).toHaveBeenCalledTimes(1);
        expect(p.closeSynced).toBe(true);
        const description=result.channel.send.mock.calls[0][0].embeds[0].toJSON().description;
        expect(description).toContain("回答 0人");
        expect(description).not.toContain("実戦：");
        expect(description).not.toContain("Q値");
    } finally { log.mockRestore(); }
});
