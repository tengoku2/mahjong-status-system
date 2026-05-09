function dateAtNoon(year: number, month: number, day: number): Date {
  const date = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error("存在する日付を入力してください。例: 5/5, 昨日, 2026-05-07");
  }
  return date;
}

export function parsePlayedAtInput(value: string | undefined | null, now = new Date()): Date {
  const text = value?.trim();
  if (!text) {
    return now;
  }

  if (["今日", "きょう", "today"].includes(text.toLowerCase())) {
    return dateAtNoon(now.getFullYear(), now.getMonth() + 1, now.getDate());
  }

  if (["昨日", "きのう", "yesterday"].includes(text.toLowerCase())) {
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0, 0);
    return dateAtNoon(yesterday.getFullYear(), yesterday.getMonth() + 1, yesterday.getDate());
  }

  if (["明日", "あした", "tomorrow"].includes(text.toLowerCase())) {
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0);
    return dateAtNoon(tomorrow.getFullYear(), tomorrow.getMonth() + 1, tomorrow.getDate());
  }

  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text);
  if (iso) {
    return dateAtNoon(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  const slash = /^(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (slash) {
    return dateAtNoon(now.getFullYear(), Number(slash[1]), Number(slash[2]));
  }

  const compact = /^(\d{3,4})$/.exec(text);
  if (compact) {
    const digits = compact[1];
    const month = digits.length === 3 ? Number(digits[0]) : Number(digits.slice(0, 2));
    const day = digits.length === 3 ? Number(digits.slice(1)) : Number(digits.slice(2));
    return dateAtNoon(now.getFullYear(), month, day);
  }

  throw new Error("対局日は 5/5, 0505, 昨日, 今日, 明日, YYYY-MM-DD のように入力してください。");
}
