import type { IncomingMessage, ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import { setImmediate } from "node:timers/promises";
import { Prisma, type MortalCandidate } from "@prisma/client";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags, StringSelectMenuBuilder, type ChatInputCommandInteraction, type Client, type Message, type SendableChannels, type StringSelectMenuInteraction, type ButtonInteraction } from "discord.js";
import { MADOROMI_GUILD_ID } from "./guild-rules.js";
import { prisma } from "./prisma.js";
import { classifyDecision, codeLabel, formatMortalTiles, hashId, MORTAL_RULE_VERSION, parseImport, rankCandidates, RECENT_MS, tileNumber, type ImportInput, type ProblemData } from "./mortal-nanikiru-domain.js";
const LOCK = "mjs:mortal-nanikiru:primary";
const marker = (id: string) => `mjs-mortal:${id}`;
const asData = (p: MortalCandidate) => p.data as unknown as ProblemData;
const jsonData = (p: ProblemData) => p as unknown as Prisma.InputJsonValue;
const batchIdFor = (input: ImportInput) => hashId(`${input.baseline ? "baseline" : "import"}:${input.reviews.map(r => r.id).sort().join(":")}`);
export async function registerMortalImport(input: ImportInput) {
    const batchId = batchIdFor(input);
    if (await prisma.mortalBatch.findUnique({ where: { id: batchId } }))
        return { batchId, duplicate: true, addedReviews: 0 };
    const existing = new Set((await prisma.mortalReview.findMany({ where: { id: { in: input.reviews.map(r => r.id) } }, select: { id: true } })).map(r => r.id));
    // Calculation stays outside the selection transaction; immutable identities win on reimport.
    const prepared: (ImportInput["reviews"][number] & {
        candidates: {
            id: string;
            data: ProblemData | null;
        }[];
    })[] = [];
    for (const r of input.reviews.filter(r => !existing.has(r.id))) {
        const candidates = [];
        for (const [index, d] of r.decisions.entries()) {
            const data = classifyDecision(d);
            if (data) candidates.push({ id: hashId(`${r.id}:${d.anchor}:${d.entry}`), data });
            // Keep health checks and Discord interaction acknowledgements responsive on Free CPU.
            if (index % 8 === 7) await setImmediate();
        }
        prepared.push({ ...r, candidates });
        await setImmediate();
    }
    return prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${LOCK}))::text`;
        const previous = await tx.mortalBatch.findUnique({ where: { id: batchId } });
        if (previous)
            return { batchId, duplicate: true, addedReviews: 0 };
        const added: {
            id: string;
            playedAt: Date | null;
        }[] = [];
        for (const r of prepared) {
            if (await tx.mortalReview.findUnique({ where: { id: r.id } }))
                continue;
            const playedAt = r.playedAt ? new Date(r.playedAt) : null;
            await tx.mortalReview.create({ data: { id: r.id, playedAt } });
            added.push({ id: r.id, playedAt });
            if (r.candidates.length)
                await tx.mortalCandidate.createMany({ data: r.candidates.map(c => ({ id: c.id, reviewId: r.id, gap: c.data!.gap, data: jsonData(c.data!), ruleVersion: MORTAL_RULE_VERSION })) });
        }
        // Importing any number of games only stores candidates. Posting requires a request.
        await tx.mortalBatch.create({ data: { id: batchId, mode: input.baseline ? "baseline" : "import" } });
        return { batchId, duplicate: false, addedReviews: added.length };
    }, { timeout: 60000 });
}
export async function selectMortalManually(requestId: string, now = new Date()) {
    const batchId = hashId(`manual:${requestId}`);
    await prisma.$transaction(async (tx) => {
        await tx.$queryRaw `SELECT pg_advisory_xact_lock(hashtext(${LOCK}))::text`;
        if (await tx.mortalBatch.findUnique({ where: { id: batchId } }))
            return;
        await tx.mortalBatch.create({ data: { id: batchId, mode: "request" } });
        let candidates = await tx.mortalCandidate.findMany({ where: { batchId: null, issuedAt: null,
                review: { playedAt: { gte: new Date(now.getTime() - RECENT_MS), lte: now } } }, include: { review: true } });
        if (!candidates.length) {
            const latest = await tx.mortalReview.findFirst({ where: { playedAt: { not: null, lte: now } }, orderBy: [{ playedAt: "desc" }, { id: "asc" }] });
            if (latest)
                candidates = await tx.mortalCandidate.findMany({ where: { batchId: null, issuedAt: null, reviewId: latest.id }, include: { review: true } });
        }
        const selected = rankCandidates(candidates.map(c => ({ ...c, playedAt: c.review.playedAt }))).slice(0, 3);
        if (selected.length)
            await tx.mortalCandidate.updateMany({ where: { id: { in: selected.map(c => c.id) }, batchId: null, issuedAt: null }, data: { batchId } });
    }, { timeout: 30000 });
    return batchId;
}
export function mortalAnswerStatus(names: string[]) {
    const text = `回答数: ${names.length} / 回答者: ${names.length ? names.join(", ") : "なし"}`;
    return text.length <= 1600 ? text : `${text.slice(0, 1597)}...`;
}
async function answerNames(client: Client, answers: { userId: string }[]) {
    const guild = await client.guilds.fetch(MADOROMI_GUILD_ID).catch(() => null);
    return Promise.all([...new Set(answers.map(a => a.userId))].map(async id => {
        const member = await guild?.members.fetch(id).catch(() => null);
        return member?.displayName ?? `User-${id.slice(-4)}`;
    }));
}
export function problemEmbed(p: MortalCandidate, closed = false, distribution?: string, names: string[] = []) {
    const d = asData(p);
    const description = [
        `${d.round} / ${d.turn === null ? "巡目不明" : `${d.turn}巡目`}${/[東南西北]([1-4])局/.test(d.round) ? ` / ${["東家", "南家", "西家", "北家"][(d.seat - Number(/[東南西北]([1-4])局/.exec(d.round)![1]) + 5) % 4]}` : ""}`,
        `手牌：${formatMortalTiles(d.hand)}`,
        d.melds.length ? `副露・槓：${d.melds.map(formatMortalTiles).join(" / ")}` : "門前",
        d.dora?.length ? `ドラ：${formatMortalTiles(d.dora)}` : "",
        d.startingScores ? `局開始時の点数（起家から）：${d.startingScores.join(" / ")}` : "",
        closed ? "回答受付を締め切りました。" : "",
        distribution ?? ""
    ].filter(Boolean).join("\n");
    return new EmbedBuilder().setTitle("実戦からの何切る").setDescription(description).setFooter({ text: mortalAnswerStatus(names) });
}
export function answerMenu(p: MortalCandidate) {
    return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(new StringSelectMenuBuilder()
        .setCustomId(`mjs:mortal:a:${p.id}`).setPlaceholder("切る牌を選んでください")
        .addOptions([...asData(p).metrics].sort((a, b) => tileNumber(a.tile) - tileNumber(b.tile) || a.tile.localeCompare(b.tile)).map(m => ({ label: codeLabel(m.tile), value: m.tile }))));
}
function feedbackButtons(id: string) {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(...[["useful", "考えどころがある"], ["simple", "単純な整理に感じる"], ["context", "情報が足りない"]].map(([kind, label]) => new ButtonBuilder().setCustomId(`mjs:mortal:f:${id}:${kind}`).setLabel(label).setStyle(ButtonStyle.Secondary)));
}
export function answerComparison(d: ProblemData, tile: string): string {
    const m = d.metrics.find(m => m.tile === tile)!;
    const bestQ = Math.max(...d.metrics.map(m => m.q));
    return [
        `あなた：${codeLabel(tile)} / Mortal 最大Q値：${d.best.map(codeLabel).join("・")} / 実戦：${codeLabel(d.actualTile)}`,
        d.best.includes(tile) ? "Mortalの最大Q値と一致しています。" : `最大Q値との差：${(bestQ - m.q).toFixed(5)}（内部評価値）`,
        `候補にした理由：${d.reason}（形からの暫定判定）`,
        ...d.metrics.map(x => `${codeLabel(x.tile)}：${x.shanten === 0 ? "聴牌" : `${x.shanten}向聴`} / 連続形 ${x.ryanmen} / 対子 ${x.pairs} / Q ${x.q.toFixed(5)}`),
        "連続形は最小向聴数の分解で残せる両面形の数です。和了率や安全度を表しません。僅差を誤答とは判定しません。"
    ].join("\n");
}
async function channelFor(client: Client, id: string): Promise<SendableChannels> {
    const channel = await client.channels.fetch(id);
    if (!channel || !("guildId" in channel) || channel.guildId !== MADOROMI_GUILD_ID || !channel.isSendable())
        throw new Error("まどろみの送信可能な何切るチャンネルを設定してください。");
    return channel;
}
const displayStates = new WeakMap<Client, { locks: Map<string, Promise<void>>; synced: Map<string, string> }>();
function displayState(client: Client) {
    let state = displayStates.get(client);
    if (!state) {
        state = { locks: new Map(), synced: new Map() };
        displayStates.set(client, state);
    }
    return state;
}
async function withDisplayLock(client: Client, id: string, render: () => Promise<void>) {
    const locks = displayState(client).locks;
    const previous = locks.get(id) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(render);
    locks.set(id, next);
    try { await next; }
    finally { if (locks.get(id) === next) locks.delete(id); }
}
async function refreshAnswerDisplay(client: Client, id: string, force = false) {
    await withDisplayLock(client, id, async () => {
        const synced = displayState(client).synced;
        if (force) synced.delete(id);
        const p = await prisma.mortalCandidate.findUnique({ where: { id } });
        if (!p?.messageId || !p.channelId || p.closedAt || !p.closesAt || p.closesAt <= new Date()) return;
        const answers = await prisma.mortalAnswer.findMany({ where: { candidateId: id }, orderBy: [{ createdAt: "asc" }, { interactionId: "asc" }] });
        const signature = JSON.stringify([...new Set(answers.map(a => a.userId))]);
        if (synced.get(id) === signature) return;
        const names = await answerNames(client, answers);
        const channel = await channelFor(client, p.channelId);
        const message = await channel.messages.fetch({ message: p.messageId, force: true });
        if (message.author.id !== client.user?.id || !message.embeds[0]) throw new Error("Question message is unavailable.");
        const text = mortalAnswerStatus(names);
        if (message.embeds[0].footer?.text !== text)
            await message.edit({ embeds: [EmbedBuilder.from(message.embeds[0]).setFooter({ text })], allowedMentions: { parse: [] } });
        // A failed edit is retried by the queue, including after a restart.
        synced.set(id, signature);
    });
}
async function markIssued(p: MortalCandidate, message: Message) {
    await prisma.mortalCandidate.update({ where: { id: p.id }, data: { delivery: "confirmed", messageId: message.id, issuedAt: message.createdAt, closesAt: new Date(message.createdTimestamp + 24 * 3600 * 1000) } });
}
// An indeterminate POST is never blindly retried. Find its stable marker in history.
// If no message can be proven, keep it reserved for inspection instead of risking a duplicate.
async function reconcile(client: Client, p: MortalCandidate) {
    if (!p.channelId || !p.attemptAt)
        return;
    const message = await findSentMessage(client, p.channelId, p.attemptAt, marker(p.id));
    if (message)
        await markIssued(p, message);
}
async function findSentMessage(client: Client, channelId: string, attemptAt: Date, expectedMarker: string, resultLink?: string): Promise<Message | null> {
    const channel = await channelFor(client, channelId);
    let before: string | undefined;
    for (let page = 0; page < 100; page++) {
        const messages = await channel.messages.fetch({ limit: 100, before });
        for (const message of messages.values())
            if (message.author.id === client.user?.id && (
                message.embeds.some(e => e.footer?.text === expectedMarker) ||
                (resultLink ? message.embeds.some(e => e.title === "実戦何切る：回答結果" && e.description?.includes(`(${resultLink})`)) :
                    message.components?.some(row => "components" in row && row.components.some(c => "customId" in c && c.customId === `mjs:mortal:a:${expectedMarker.slice("mjs-mortal:".length)}`)))
            ))
                return message;
        const oldest = messages.last();
        if (!oldest || oldest.createdTimestamp < attemptAt.getTime() - 60000 || messages.size < 100)
            return null;
        before = oldest.id;
    }
    return null;
}
export async function deliverMortalCandidate(client: Client, p: MortalCandidate) {
    if (p.issuedAt)
        return;
    const batch = p.batchId ? await prisma.mortalBatch.findUnique({ where: { id: p.batchId } }) : null;
    // Legacy automatic reservations remain in history, but cannot post after the switch.
    if (batch?.mode !== "request")
        return;
    if (p.delivery !== "ready") {
        await reconcile(client, p);
        return;
    }
    const settings = await prisma.nanikiruGuildSetting.findUnique({ where: { guildId: MADOROMI_GUILD_ID } });
    if (!settings?.questionChannelId)
        return;
    const channel = await channelFor(client, settings.questionChannelId);
    const claimed = await prisma.mortalCandidate.updateMany({ where: { id: p.id, delivery: "ready", issuedAt: null }, data: {
            delivery: "sending", attemptAt: new Date(), channelId: channel.id, resultChannelId: settings.resultChannelId
        } });
    if (!claimed.count)
        return;
    let message: Message;
    try {
        message = await channel.send({ embeds: [problemEmbed(p)], components: [answerMenu(p)], allowedMentions: { parse: [] }, nonce: p.id.slice(0, 25), enforceNonce: true });
    }
    catch (error) {
        // Only a definitive API rejection is safe to send again. Network/5xx are ambiguous.
        const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
        await prisma.mortalCandidate.updateMany({ where: { id: p.id, delivery: "sending" }, data: { delivery: status >= 400 && status < 500 ? "ready" : "uncertain" } });
        throw new Error("実戦何切るの投稿を完了できませんでした。保存済みの出題セットを保持しています。");
    }
    // A database failure here deliberately leaves 'sending'; history reconciles on restart.
    await markIssued(p, message);
}
async function closeProblem(client: Client, p: MortalCandidate) {
    if (!p.messageId || !p.channelId)
        return;
    await prisma.mortalCandidate.updateMany({ where: { id: p.id, closedAt: null }, data: { closedAt: new Date() } });
    const answers = await prisma.mortalAnswer.findMany({ where: { candidateId: p.id }, orderBy: [{ createdAt: "desc" }, { interactionId: "desc" }] });
    const names = await answerNames(client, [...answers].reverse());
    const latest = new Map<string, string>();
    for (const a of answers)
        if (!latest.has(a.userId))
            latest.set(a.userId, a.tile);
    const counts = new Map<string, number>();
    for (const tile of latest.values())
        counts.set(tile, (counts.get(tile) ?? 0) + 1);
    const distribution = `回答 ${latest.size}人\n${[...counts].map(([t, n]) => `${codeLabel(t)}：${n}人`).join("\n")}`;
    const channel = await channelFor(client, p.channelId);
    // Editing is idempotent, including after a database write failure.
    const message = await channel.messages.fetch(p.messageId).catch(e => {
        if (e.code === 10008) return null;
        throw e;
    });
    if (message)
        await message.edit({ embeds: [problemEmbed(p, true, distribution, names)], components: [], allowedMentions: { parse: [] } });
    if (p.resultChannelId && p.resultChannelId !== p.channelId && !p.resultMessageId) {
        const resultMarker = `${marker(p.id)}:result`;
        const resultLink = `https://discord.com/channels/${MADOROMI_GUILD_ID}/${p.channelId}/${p.messageId}`;
        if (p.resultDelivery !== "ready") {
            const found = p.resultAttemptAt ? await findSentMessage(client, p.resultChannelId, p.resultAttemptAt, resultMarker, resultLink) : null;
            if (!found)
                return;
            await prisma.mortalCandidate.update({ where: { id: p.id }, data: { resultDelivery: "confirmed", resultMessageId: found.id } });
        }
        else {
            const resultChannel = await channelFor(client, p.resultChannelId);
            const claim = await prisma.mortalCandidate.updateMany({ where: { id: p.id, resultDelivery: "ready" }, data: { resultDelivery: "sending", resultAttemptAt: new Date() } });
            if (!claim.count)
                return;
            let result: Message;
            try {
                result = await resultChannel.send({ embeds: [new EmbedBuilder().setTitle("実戦何切る：回答結果").setDescription(`${distribution}\n[問題を見る](${resultLink})`).setFooter({ text: mortalAnswerStatus(names) })], allowedMentions: { parse: [] }, nonce: hashId(resultMarker).slice(0, 25), enforceNonce: true });
            }
            catch (error) {
                const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
                await prisma.mortalCandidate.update({ where: { id: p.id }, data: { resultDelivery: status >= 400 && status < 500 ? "ready" : "uncertain" } });
                throw error;
            }
            await prisma.mortalCandidate.update({ where: { id: p.id }, data: { resultDelivery: "confirmed", resultMessageId: result.id } });
        }
    }
    displayState(client).synced.delete(p.id);
    // Respondent names are separate from choices; Mortal/actual choices stay private.
    await prisma.mortalCandidate.update({ where: { id: p.id }, data: { closeSynced: true } });
}
export async function processMortalQueue(client: Client) {
    if (!client.isReady())
        return;
    const pending = await prisma.mortalCandidate.findMany({ where: { batch: { mode: "request" }, issuedAt: null, delivery: { in: ["ready", "sending", "uncertain"] } }, orderBy: { id: "asc" }, take: 100 });
    for (const p of pending)
        try {
            await deliverMortalCandidate(client, p);
        }
        catch {
            console.error("Mortal delivery pending; candidate", p.id);
        }
    const closed = await prisma.mortalCandidate.findMany({ where: { closesAt: { lte: new Date() }, closeSynced: false }, take: 100 });
    for (const p of closed)
        try {
            await withDisplayLock(client, p.id, () => closeProblem(client, p));
        }
        catch {
            console.error("Mortal close pending; candidate", p.id);
        }
    const open = await prisma.mortalCandidate.findMany({ where: { issuedAt: { not: null }, closedAt: null, closesAt: { gt: new Date() } }, take: 100 });
    for (const p of open)
        try { await refreshAnswerDisplay(client, p.id); }
        catch { console.error("Mortal respondent display pending; candidate", p.id); }
}
export function startMortalQueue(client: Client) {
    let running = false;
    const tick = async () => {
        if (running) return;
        running = true;
        try {
            await processMortalQueue(client);
        } catch {
            console.error("Mortal queue needs attention.");
        } finally {
            running = false;
        }
    };
    void tick();
    const timer = setInterval(() => void tick(), 30000);
    timer.unref();
    return timer;
}
export async function handleMortalCommand(interaction: ChatInputCommandInteraction, client: Client, canManage: boolean) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (interaction.guildId !== MADOROMI_GUILD_ID || !canManage) {
        await interaction.editReply("まどろみの運営・開発者向けのコマンドです。");
        return;
    }
    const mode = interaction.options.getString("mode");
    let batchId: string | undefined;
    if (mode !== "retry")
        batchId = await selectMortalManually(interaction.id);
    await processMortalQueue(client);
    const items = await prisma.mortalCandidate.findMany({ where: batchId ? { batchId } : { batch: { mode: "request" }, issuedAt: null } });
    await interaction.editReply(`実戦何切る：${items.filter(p => p.issuedAt).length}問を投稿済み、${items.filter(p => !p.issuedAt).length}問を保持中。${items.some(p => ["sending", "uncertain"].includes(p.delivery)) ? "送信結果が不明な問題は履歴照合まで再送を保留しています。" : ""}${items.length ? "" : "対象候補はありません。"}`);
}
export async function handleMortalAnswer(interaction: StringSelectMenuInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const id = interaction.customId.split(":")[3], tile = interaction.values[0];
    if (interaction.guildId !== MADOROMI_GUILD_ID)
        throw new Error("対象のサーバーではありません。");
    const problem = await prisma.$transaction(async (tx) => {
        // Serialize the deadline check with close/update and preserve every answer revision.
        await tx.$queryRaw `SELECT id FROM "MortalCandidate" WHERE id = ${id} FOR UPDATE`;
        const p = await tx.mortalCandidate.findUnique({ where: { id } });
        if (!p?.issuedAt || p.messageId !== interaction.message.id || p.closedAt || !p.closesAt || p.closesAt <= new Date())
            throw new Error("この問題の回答受付は終了しました。");
        if (!asData(p).metrics.some(m => m.tile === tile))
            throw new Error("不正な回答です。");
        await tx.mortalAnswer.upsert({ where: { interactionId: interaction.id }, create: { interactionId: interaction.id, candidateId: id, userId: interaction.user.id, tile }, update: {} });
        return p;
    });
    await interaction.editReply({ content: answerComparison(asData(problem), tile), components: [feedbackButtons(id)], allowedMentions: { parse: [] } });
    try { await refreshAnswerDisplay(interaction.client, id, true); }
    catch { console.error("Mortal respondent display pending; candidate", id); }
}
export async function handleMortalFeedback(interaction: ButtonInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const [, , , id, kind] = interaction.customId.split(":");
    if (interaction.guildId !== MADOROMI_GUILD_ID || !["useful", "simple", "context"].includes(kind))
        throw new Error("不正なフィードバックです。");
    const answer = await prisma.mortalAnswer.findFirst({ where: { candidateId: id, userId: interaction.user.id } });
    if (!answer)
        throw new Error("回答後にフィードバックできます。");
    await prisma.mortalFeedback.upsert({ where: { interactionId: interaction.id }, create: { interactionId: interaction.id, candidateId: id, userId: interaction.user.id, kind }, update: {} });
    await interaction.editReply("フィードバックを保存しました。候補選定の調整に使います。");
}
export function createMortalImportHandler() {
    return async (request: IncomingMessage, response: ServerResponse, pathname: string): Promise<boolean> => {
        if (pathname !== "/api/mortal-nanikiru/import")
            return false;
        const send = (status: number, body: unknown) => { response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }); response.end(JSON.stringify(body)); };
        if (request.method !== "POST") {
            response.setHeader("allow", "POST");
            send(405, { ok: false, error: "Method Not Allowed" });
            return true;
        }
        const key = process.env.EXTERNAL_API_KEY;
        const authorization = request.headers.authorization;
        const given = authorization?.startsWith("Bearer ") ? authorization.slice(7) : "";
        if (!key) {
            send(503, { ok: false, error: "Import API is disabled." });
            return true;
        }
        if (Buffer.byteLength(given) !== Buffer.byteLength(key) || !timingSafeEqual(Buffer.from(given), Buffer.from(key))) {
            send(401, { ok: false, error: "Invalid API key." });
            return true;
        }
        try {
            const chunks: Buffer[] = [];
            let size = 0;
            for await (const chunk of request) {
                const buffer = Buffer.from(chunk);
                size += buffer.length;
                if (size > 16 * 1024 * 1024) {
                    send(413, { ok: false, error: "Request too large." });
                    return true;
                }
                chunks.push(buffer);
            }
            let input: ImportInput;
            try {
                input = parseImport(JSON.parse(Buffer.concat(chunks).toString("utf8")));
            }
            catch {
                send(400, { ok: false, error: "Invalid verified review payload." });
                return true;
            }
            const result = await registerMortalImport(input);
            send(200, { ok: true, ...result });
        }
        catch {
            send(503, { ok: false, error: "Import is pending; retry the identical payload." });
        }
        return true;
    };
}
