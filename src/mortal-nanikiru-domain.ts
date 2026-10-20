import { createHash } from "node:crypto";
import { calculateShanten, formatNanikiruHand, tileLabel } from "./nanikiru.js";
export const MORTAL_RULE_VERSION = "shape-1.0.0";
export const RECENT_MS = 72 * 60 * 60 * 1000;
export const hashId = (value: string) => createHash("sha256").update(value).digest("hex");
const honors = ["e", "s", "w", "n", "p", "f", "c"];
export function tileNumber(code: string): number {
    const honor = honors.indexOf(code);
    if (honor >= 0)
        return 27 + honor;
    if (!/^(?:[1-9][mps]|5[mps]r)$/.test(code))
        throw new Error("Invalid tile code.");
    return "mps".indexOf(code[1]) * 9 + Number(code[0]) - 1;
}
export function codeLabel(code: string): string {
    return `${code.endsWith("r") ? "赤" : ""}${tileLabel(tileNumber(code))}`;
}
export function formatMortalTiles(codes: string[]): string {
    return formatNanikiruHand({ hand: codes.map(tileNumber), redDoraTiles: codes.filter(c => c.endsWith("r")).map(tileNumber) });
}
export interface DecisionInput {
    anchor: string;
    entry: number;
    round: string;
    turn: number | null;
    hand: string[];
    melds: string[][];
    actual: string;
    actions: {
        action: string;
        q: number;
    }[];
    seat: number;
    startingScores: number[] | null;
    dora?: string[];
}
export interface ReviewInput {
    id: string;
    playedAt: string | null;
    decisions: DecisionInput[];
}
export interface ImportInput {
    baseline: boolean;
    reviews: ReviewInput[];
}
export interface DiscardMetric {
    tile: string;
    q: number;
    shanten: number;
    ryanmen: number;
    pairs: number;
    penchan: number;
}
export interface ProblemData extends DecisionInput {
    gap: number;
    best: string[];
    actualTile: string;
    reason: string;
    metrics: DiscardMetric[];
    ruleVersion: string;
}
function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("Expected an object.");
    return value as Record<string, unknown>;
}
function shortString(value: unknown, max = 100): string {
    if (typeof value !== "string" || !value.length || value.length > max || /[\u0000-\u001f]/.test(value))
        throw new Error("Invalid text field.");
    return value;
}
function integer(value: unknown, min: number, max: number): number {
    if (!Number.isInteger(value) || (value as number) < min || (value as number) > max)
        throw new Error("Invalid integer.");
    return value as number;
}
export function parseImport(value: unknown): ImportInput {
    const input = object(value);
    if (typeof input.baseline !== "boolean" || !Array.isArray(input.reviews) || input.reviews.length > 200)
        throw new Error("Invalid import envelope.");
    const reviews = input.reviews.map((raw): ReviewInput => {
        const r = object(raw), id = shortString(r.id);
        if (!/^[a-f0-9]{64}$/.test(id))
            throw new Error("Review ID must be a SHA-256 identity.");
        const playedAt = r.playedAt === null ? null : shortString(r.playedAt);
        if (playedAt !== null && (!/(Z|[+-]\d{2}:\d{2})$/.test(playedAt) || !Number.isFinite(Date.parse(playedAt))))
            throw new Error("playedAt needs a timezone.");
        if (!Array.isArray(r.decisions) || r.decisions.length > 1000)
            throw new Error("Invalid decisions.");
        const decisions = r.decisions.map((rawDecision): DecisionInput => {
            const d = object(rawDecision);
            if (!Array.isArray(d.hand) || !Array.isArray(d.melds) || d.melds.length > 4 || !Array.isArray(d.actions) || d.actions.length > 14)
                throw new Error("Invalid hand/actions.");
            const hand = d.hand.map(t => shortString(t, 3));
            const melds = d.melds.map(m => {
                if (!Array.isArray(m) || ![3, 4].includes(m.length))
                    throw new Error("Invalid meld.");
                return m.map(t => shortString(t, 3));
            });
            if (hand.length !== 14 - melds.length * 3)
                throw new Error("Incorrect hand length.");
            const counts = Array(34).fill(0), reds = new Set<string>();
            for (const t of [...hand, ...melds.flat()]) {
                if (++counts[tileNumber(t)] > 4)
                    throw new Error("More than four copies of a tile.");
                if (t.endsWith("r")) {
                    if (reds.has(t))
                        throw new Error("Duplicate red tile.");
                    reds.add(t);
                }
            }
            for (const m of melds) {
                const ns = m.map(tileNumber).sort((a, b) => a - b);
                if (!ns.every(n => n === ns[0]) && !(ns.length === 3 && ns[0] < 27 && ns[0] % 9 <= 6 && ns[1] === ns[0] + 1 && ns[2] === ns[0] + 2))
                    throw new Error("Invalid meld shape.");
            }
            const actions = d.actions.map(rawAction => {
                const a = object(rawAction), action = shortString(a.action, 12);
                if (!action.startsWith("打 ") || !hand.includes(action.slice(2)) || typeof a.q !== "number" || !Number.isFinite(a.q) || Math.abs(a.q) > 1000)
                    throw new Error("Invalid discard action.");
                return { action, q: a.q };
            });
            if (actions.length < 2 || new Set(actions.map(a => a.action)).size !== actions.length)
                throw new Error("Duplicate/missing choices.");
            if (new Set(hand).size !== actions.length)
                throw new Error("Incomplete discard choices.");
            const actual = shortString(d.actual, 12);
            if (!actions.some(a => a.action === actual))
                throw new Error("Actual discard missing.");
            const startingScores = d.startingScores === null ? null : d.startingScores;
            if (startingScores !== null && (!Array.isArray(startingScores) || startingScores.length !== 4 || !startingScores.every(n => Number.isInteger(n) && Math.abs(n) <= 1000000)))
                throw new Error("Invalid starting scores.");
            let dora: string[] | undefined;
            if (d.dora !== undefined) {
                if (!Array.isArray(d.dora) || d.dora.length < 1 || d.dora.length > 5) throw new Error("Invalid dora.");
                dora = d.dora.map(t => { const code = shortString(t, 2); tileNumber(code); return code; });
            }
            return { anchor: shortString(d.anchor), entry: integer(d.entry, 1, 1000), round: shortString(d.round, 40), turn: d.turn === null ? null : integer(d.turn, 1, 100), hand, melds, actual, actions, seat: integer(d.seat, 0, 3), startingScores: startingScores as number[] | null, ...(dora ? { dora } : {}) };
        });
        if (new Set(decisions.map(d => `${d.anchor}:${d.entry}`)).size !== decisions.length)
            throw new Error("Duplicate decision identity.");
        return { id, playedAt, decisions };
    });
    if (new Set(reviews.map(r => r.id)).size !== reviews.length)
        throw new Error("Duplicate review identity.");
    return { baseline: input.baseline, reviews };
}
// Select a decomposition attaining minimum shanten, preferring two-sided blocks.
// A completed sequence is never counted again as an incomplete two-sided block.
export function shapeCounts(hand: number[], fixedMelds = 0) {
    const counts = Array(34).fill(0);
    for (const t of hand)
        counts[t]++;
    const target = calculateShanten(hand, fixedMelds);
    let best = { ryanmen: 0, penchan: 0, pairs: counts.filter(c => c >= 2).length }, score = -Infinity;
    function search(start: number, melds: number, blocks: number, head: boolean, ryanmen: number, penchan: number, pairs: number) {
        if (melds + fixedMelds > 4 || blocks > 4 - fixedMelds)
            return;
        let t = start;
        while (t < 34 && !counts[t])
            t++;
        if (t === 34) {
            if (blocks > 4 - melds - fixedMelds || 8 - 2 * (melds + fixedMelds) - blocks - Number(head) !== target)
                return;
            const value = ryanmen * 100 - penchan * 10 + pairs;
            if (value > score) {
                score = value;
                best = { ryanmen, penchan, pairs };
            }
            return;
        }
        const next = (m = melds, b = blocks, h = head, r = ryanmen, p = penchan, ps = pairs) => search(t, m, b, h, r, p, ps);
        if (counts[t] >= 3) {
            counts[t] -= 3;
            next(melds + 1);
            counts[t] += 3;
        }
        if (t < 27 && t % 9 <= 6 && counts[t + 1] && counts[t + 2]) {
            counts[t]--;
            counts[t + 1]--;
            counts[t + 2]--;
            next(melds + 1);
            counts[t]++;
            counts[t + 1]++;
            counts[t + 2]++;
        }
        if (counts[t] >= 2) {
            counts[t] -= 2;
            if (!head)
                next(melds, blocks, true, ryanmen, penchan, pairs + 1);
            next(melds, blocks + 1, head, ryanmen, penchan, pairs + 1);
            counts[t] += 2;
        }
        for (const offset of [1, 2])
            if (t < 27 && t % 9 <= 8 - offset && counts[t + offset]) {
                counts[t]--;
                counts[t + offset]--;
                const edge = offset === 1 && (t % 9 === 0 || t % 9 === 7);
                next(melds, blocks + 1, head, ryanmen + Number(offset === 1 && !edge), penchan + Number(edge));
                counts[t]++;
                counts[t + offset]++;
            }
        counts[t]--;
        search(t + 1, melds, blocks, head, ryanmen, penchan, pairs);
        counts[t]++;
    }
    search(0, 0, 0, false, 0, 0, 0);
    return { shanten: target, ...best };
}
export function classifyDecision(d: DecisionInput): ProblemData | null {
    const maxQ = Math.max(...d.actions.map(a => a.q));
    const isConnected = (code: string) => {
        const tile = tileNumber(code), counts = d.hand.map(tileNumber);
        return counts.filter(t => t === tile).length >= 2 || (tile < 27 && counts.some(t => t < 27 && Math.floor(t / 9) === Math.floor(tile / 9) && Math.abs(t - tile) >= 1 && Math.abs(t - tile) <= 2));
    };
    // If Mortal's best discards are all isolated tiles, treat the scene as basic
    // tidying. Breaking an unrelated block must not manufacture a quiz branch.
    const bestTiles = d.actions.filter(a => a.q === maxQ).map(a => a.action.slice(2));
    if (!bestTiles.some(isConnected))
        return null;
    const metrics = d.actions.map(a => {
        const tile = a.action.slice(2), after = [...d.hand];
        after.splice(after.indexOf(tile), 1);
        const numbers = after.map(tileNumber);
        return { tile, q: a.q, ...shapeCounts(numbers, d.melds.length) };
    });
    const min = Math.min(...metrics.map(m => m.shanten));
    // Compare plausible choices at most one shanten behind the quickest option.
    // Neither Q proximity nor the turn number is evidence of a meaningful branch.
    const plausible = metrics.filter(m => m.shanten === min || (min === 0 && m.shanten === 1));
    let reason: string | undefined;
    for (const a of plausible)
        for (const b of plausible) {
            if (!bestTiles.includes(a.tile) && !bestTiles.includes(b.tile))
                continue;
            if (!isConnected(a.tile) || !isConnected(b.tile))
                continue;
            if (a.shanten < b.shanten && b.ryanmen > a.ryanmen && b.penchan <= a.penchan)
                reason ??= "向聴数と両面になりうる連続形の比較";
            if (a.shanten === b.shanten && a.ryanmen > b.ryanmen && a.pairs < b.pairs)
                reason ??= "連続形と対子の残し方の比較";
            if (a.shanten === b.shanten && a.ryanmen > b.ryanmen && a.penchan > b.penchan)
                reason ??= "両面・辺張になりうる形の残し方の比較";
        }
    if (!reason)
        return null;
    return { ...d, gap: Number((maxQ - metrics.find(m => m.tile === d.actual.slice(2))!.q).toFixed(5)),
        best: metrics.filter(m => m.q === maxQ).map(m => m.tile), actualTile: d.actual.slice(2), reason, metrics, ruleVersion: MORTAL_RULE_VERSION };
}
export function inWindow(playedAt: Date | null, now: Date): boolean {
    return playedAt !== null && playedAt.getTime() >= now.getTime() - RECENT_MS && playedAt <= now;
}
export function rankCandidates<T extends {
    id: string;
    gap: number;
    playedAt: Date | null;
}>(items: T[]): T[] {
    return [...items].sort((a, b) => b.gap - a.gap || (b.playedAt?.getTime() ?? 0) - (a.playedAt?.getTime() ?? 0) || a.id.localeCompare(b.id));
}
