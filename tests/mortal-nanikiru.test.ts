import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { createApiServer } from "../src/external-api.js";
import { Collection, MessageFlags, type Client } from "discord.js";
import type { MortalCandidate } from "@prisma/client";
const { db } = vi.hoisted(() => ({ db: {} as any }));
vi.mock("../src/prisma.js", () => ({ prisma: db }));
import { answerComparison, answerMenu, deliverMortalCandidate, handleMortalAnswer, handleMortalCommand, handleMortalFeedback, problemEmbed, processMortalQueue, registerMortalImport, selectMortalManually } from "../src/mortal-nanikiru.js";
import { classifyDecision, formatMortalTiles, inWindow, parseImport, shapeCounts, tileNumber, RECENT_MS, type DecisionInput } from "../src/mortal-nanikiru-domain.js";
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
        else if (key === "batch") {
            if (!p.batchId || !matches(batches.get(p.batchId), value)) return false;
        }
        else if (value && typeof value === "object" && !(value instanceof Date)) {
            const v = value as any;
            if ("in" in v && !v.in.includes(p[key]))
                return false;
            if ("not" in v && p[key] === v.not)
                return false;
            if ("lte" in v && (!p[key] || p[key] > v.lte))
                return false;
            if ("gt" in v && (!p[key] || p[key] <= v.gt))
                return false;
            if ("gte" in v && (!p[key] || p[key] < v.gte))
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
        findMany: vi.fn(async () => [...reviews.values()]), findFirst: vi.fn(async ({where}: any) => [...reviews.values()].filter(r => matches(r,where)).sort((a, b) => b.playedAt - a.playedAt || a.id.localeCompare(b.id))[0] ?? null),
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
            answers.set(create.interactionId, { ...create, createdAt: new Date() }); }), findMany: vi.fn(async ({ where, orderBy }: any) => {
                const rows = [...answers.values()].filter(p => matches(p, where));
                return orderBy?.[0]?.createdAt === "asc" ? rows : rows.reverse();
            }), findFirst: vi.fn(async ({ where }: any) => [...answers.values()].find(p => matches(p, where))) };
    db.mortalFeedback = { upsert: vi.fn(async ({ create }: any) => feedback.set(create.interactionId, create)) };
});
function discord() {
    const history = new Collection<string, any>();
    const channel: any = { id: "channel", guildId: MADOROMI_GUILD_ID, isSendable: () => true, messages: { fetch: vi.fn(async (q: any) => typeof q === "string" ? history.get(q) : q.message ? history.get(q.message) : history) }, send: vi.fn(async (options: any) => {
            const m: any = { id: `message${history.size + 1}`, author: { id: "bot" }, createdAt: new Date(), createdTimestamp: Date.now(), embeds: options.embeds.map((e: any) => e.toJSON()), components: (options.components ?? []).map((row: any) => ({components: row.toJSON().components.map((c:any)=>({customId:c.custom_id}))})), edit: vi.fn(async (edit: any) => {
                m.embeds = edit.embeds.map((e: any) => e.toJSON());
                if (edit.components) m.components = edit.components;
                return m;
            }) };
            history.set(m.id, m);
            return m;
        }) };
    const members = { fetch: vi.fn(async (id: string) => ({ displayName: ({person1:"一人目",person2:"二人目"} as Record<string,string>)[id] ?? id })) };
    const client = { user: { id: "bot" }, isReady: () => true, channels: { fetch: vi.fn(async () => channel) }, guilds: { fetch: vi.fn(async () => ({members})) } } as unknown as Client;
    return { client, channel, history };
}
async function reserved() {
    const r = review("a", 0, [.1]);
    r.playedAt = new Date().toISOString();
    await registerMortalImport({ baseline: false, reviews: [r] });
    await selectMortalManually("request");
    return [...candidates.values()][0] as MortalCandidate;
}
describe("Mortal candidate rules", () => {
    it("groups suits and melds using the existing red-five notation", () => {
        expect(formatMortalTiles(["4m", "4m", "5p", "6p", "6p", "9p"])).toBe("44m 5669p");
        expect(formatMortalTiles(["7m", "5mr", "6m"])).toBe("5(赤)67m");
        expect(formatMortalTiles(["p", "p", "p"])).toBe("白白白");
    });
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
    it("uses an inclusive 72-hour actual-game window", () => {
        expect(inWindow(new Date(now.getTime() - RECENT_MS), now)).toBe(true);
        expect(inWindow(new Date(now.getTime() - RECENT_MS - 1), now)).toBe(false);
        expect(inWindow(new Date(now.getTime() + 1), now)).toBe(false);
        expect(inWindow(null, now)).toBe(false);
    });
});
describe("Mortal persistent selection", () => {
    it("imports many games without posting, then selects at most three across the last 72 hours on request", async () => {
        const input = { baseline: false, reviews: [review("a", 3, [1.2, .95, .6]), review("b", 1, [.9, .8, .4]), review("c", 0, [.75, .65, .5]), review("d", 3+1/86400000, [10])] };
        await registerMortalImport(input);
        const {client,channel}=discord();
        await processMortalQueue(client);
        expect(channel.send).not.toHaveBeenCalled();
        expect([...candidates.values()].some(c=>c.batchId)).toBe(false);
        const batch = await selectMortalManually("manual1", now);
        expect([...candidates.values()].filter(c => c.batchId === batch).map(c => c.gap).sort()).toEqual([.9, .95, 1.2]);
        expect([...candidates.values()].every(c => c.issuedAt === null)).toBe(true);
    });
    it("does not refill a short recent pool from older games", async () => {
        await registerMortalImport({ baseline: false, reviews: [review("a", 4, [3, 2, 1]), review("b", 0, [.2, .1])] });
        const batch=await selectMortalManually("short",now);
        expect([...candidates.values()].filter(c => c.batchId === batch)).toHaveLength(2);
    });
    it("falls back to only the latest game even beyond seven days, excluding future games", async () => {
        await registerMortalImport({ baseline: false, reviews: [review("a", 9, [5,4]), review("b", 8, [.2,.1]), review("c", -1, [10])] });
        const batch=await selectMortalManually("fallback",now);
        expect([...candidates.values()].filter(c => c.batchId === batch).map(c=>c.gap).sort()).toEqual([.1,.2]);
    });
    it("does not borrow older games when the fallback latest game has no candidates", async () => {
        await registerMortalImport({ baseline: false, reviews: [review("a", 9, [1]), review("b", 8, [])] });
        const batch=await selectMortalManually("empty",now);
        expect([...candidates.values()].filter(c => c.batchId === batch)).toHaveLength(0);
    });
    it("reimports, filename-free identities and concurrent imports preserve the frozen set", async () => {
        const input = { baseline: false, reviews: [review("a", 0, [.5, .4, .3, .2])] };
        const results = await Promise.all([registerMortalImport(input), registerMortalImport(input)]);
        expect(new Set(results.map(r => r.batchId)).size).toBe(1);
        expect(candidates.size).toBe(4);
        expect([...candidates.values()].filter(c => c.batchId)).toHaveLength(0);
        const [first,second]=await Promise.all([selectMortalManually("same",now),selectMortalManually("same",now)]);
        expect(first).toBe(second);
        expect([...candidates.values()].filter(c=>c.batchId===first)).toHaveLength(3);
        await registerMortalImport(input);
        expect(batches.size).toBe(2);
        const next=await selectMortalManually("next",now);
        expect([...candidates.values()].filter(c=>c.batchId===next)).toHaveLength(1);
    });
    it("baselines retain all candidates without posting; manual requests preserve old history", async () => {
        await registerMortalImport({ baseline: true, reviews: [review("a", 8, [2]), review("b", 0, [1])] });
        expect(candidates.size).toBe(2);
        expect([...candidates.values()].some(c => c.batchId)).toBe(false);
        await selectMortalManually("request", now);
        expect([...candidates.values()].filter(c => c.batchId)).toHaveLength(1);
        expect(candidates.size).toBe(2);
    });
});
describe("Mortal Discord delivery and privacy", () => {
    it("posts only three on an explicit command with no mode option", async () => {
        const r=review("a",0,[.5,.4,.3,.2]);
        r.playedAt=new Date().toISOString();
        await registerMortalImport({baseline:false,reviews:[r]});
        const {client,channel}=discord();
        const i:any={id:"manual-command",guildId:MADOROMI_GUILD_ID,options:{getString:vi.fn(()=>null)},deferReply:vi.fn(),editReply:vi.fn()};
        await handleMortalCommand(i,client,true);
        expect(channel.send).toHaveBeenCalledTimes(3);
        expect(i.editReply.mock.calls[0][0]).toContain("3問を投稿済み");
        await handleMortalCommand(i,client,true);
        expect(channel.send).toHaveBeenCalledTimes(3);
    });
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
    it("shows grouped hand, grouped melds and dora without explanatory text or IDs", async () => {
        const p = await reserved();
        (p.data as any).dora=["1m","c"];
        const embed=problemEmbed(p).toJSON();
        expect(embed.description).toContain("手牌：344m 567p 34" );
        expect(embed.description).toContain("副露・槓：567m");
        expect(embed.description).toContain("ドラ：1m 中");
        expect(embed.description).toContain("北家");
        expect(embed.description).not.toContain("自席");
        expect(embed.description).not.toContain("省略");
        expect(embed.description).not.toContain("牌を選ぶと");
        expect(embed.description).not.toContain("mjs-mortal");
        expect(embed.footer?.text).toBe("回答数: 0 / 回答者: なし");
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
    it("delivers an explicitly requested fallback even when its game is old", async () => {
        const p = await reserved(), { client, channel } = discord();
        reviews.get(p.reviewId).playedAt = new Date(Date.now() - 10*86400000);
        await deliverMortalCandidate(client, p);
        expect(channel.send).toHaveBeenCalledTimes(1);
        expect(p.batchId).toBeTruthy();
        expect(p.issuedAt).not.toBeNull();
    });
    it("never posts a legacy automatic reservation, including after restart", async () => {
        const p = await reserved(), { client, channel } = discord();
        batches.get(p.batchId!).mode="latest";
        await deliverMortalCandidate(client,p);
        await processMortalQueue(client);
        expect(channel.send).not.toHaveBeenCalled();
        expect(p.issuedAt).toBeNull();
        expect(p.delivery).toBe("ready");
    });
    it("replies privately and records each respondent and answer revision separately", async () => {
        const p = await reserved(), { client, history } = discord();
        await deliverMortalCandidate(client, p);
        const message = history.get(p.messageId!);
        const description = message.embeds[0].description, components = message.components;
        const i: any = { client, customId: `mjs:mortal:a:${p.id}`, values: ["4m"], guildId: MADOROMI_GUILD_ID, message: { id: p.messageId }, user: { id: "person1" }, id: "answer1", deferReply: vi.fn(), editReply: vi.fn() };
        await handleMortalAnswer(i);
        expect(i.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
        expect(i.editReply.mock.calls[0][0].content).toContain("実戦：");
        i.id = "answer2";
        i.values = ["3m"];
        await handleMortalAnswer(i);
        expect(message.embeds[0].footer.text).toBe("回答数: 1 / 回答者: 一人目");
        i.id = "answer3";
        i.user.id = "person2";
        await handleMortalAnswer(i);
        expect(message.embeds[0].footer.text).toBe("回答数: 2 / 回答者: 一人目, 二人目");
        expect(message.embeds[0].description).toBe(description);
        expect(message.components).toEqual(components);
        expect(message.embeds[0].description).not.toContain("Mortal 最大Q値");
        expect(answers.size).toBe(3);
        expect(p.issuedAt).not.toBeNull();
        expect(answerComparison(p.data as any, "3m")).toContain("最大Q値と一致");
        i.id = "feedback1";
        i.customId = `mjs:mortal:f:${p.id}:simple`;
        await handleMortalFeedback(i);
        expect(feedback.size).toBe(1);
    });
    it("keeps successful answers private when a public edit fails, then repairs from history", async () => {
        const p = await reserved(), { client, history } = discord();
        await deliverMortalCandidate(client, p);
        await processMortalQueue(client); // Cache the initial empty respondent list.
        const message = history.get(p.messageId!);
        const deadline = p.closesAt;
        message.edit.mockRejectedValueOnce(new Error("Discord unavailable"));
        const log = vi.spyOn(console, "error").mockImplementation(() => {});
        try {
            const i: any = { client, customId: `mjs:mortal:a:${p.id}`, values: ["3m"], guildId: MADOROMI_GUILD_ID, message, user: { id: "person1" }, id: "answer1", deferReply: vi.fn(), editReply: vi.fn() };
            await handleMortalAnswer(i);
            expect(answers.size).toBe(1);
            expect(i.editReply.mock.calls[0][0].content).toContain("実戦：");
            expect(message.embeds[0].footer.text).toContain("回答数: 0");
            await processMortalQueue(client);
            expect(message.embeds[0].footer.text).toBe("回答数: 1 / 回答者: 一人目");
            expect(p.closesAt).toBe(deadline);
            const edits = message.edit.mock.calls.length;
            await processMortalQueue(client);
            expect(message.edit).toHaveBeenCalledTimes(edits);
            // Restart: no in-memory display state, but the stored answers still restore the footer.
            message.embeds[0].footer.text = "旧表示";
            await processMortalQueue({ ...client } as Client);
            expect(message.embeds[0].footer.text).toBe("回答数: 1 / 回答者: 一人目");
        } finally { log.mockRestore(); }
    });
    it("serializes concurrent respondent updates and keeps the list after closing", async () => {
        const p = await reserved(), { client, history } = discord();
        await deliverMortalCandidate(client, p);
        const message = history.get(p.messageId!);
        await Promise.all(["person1", "person2"].map((id, n) => handleMortalAnswer({ client, customId: `mjs:mortal:a:${p.id}`, values: [n ? "4m" : "3m"], guildId: MADOROMI_GUILD_ID, message, user: { id }, id: `answer${n}`, deferReply: vi.fn(), editReply: vi.fn() } as any)));
        expect(message.embeds[0].footer.text).toBe("回答数: 2 / 回答者: 一人目, 二人目");
        p.closesAt = new Date(Date.now() - 1);
        await processMortalQueue(client);
        expect(message.components).toEqual([]);
        expect(message.embeds[0].footer.text).toBe("回答数: 2 / 回答者: 一人目, 二人目");
        expect(message.embeds[0].description).toContain("回答 2人");
        expect(message.embeds[0].description).not.toContain("実戦：");
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
