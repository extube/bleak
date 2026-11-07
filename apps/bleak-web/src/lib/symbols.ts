const PALETTE = [
  "◆",
  "★",
  "✦",
  "✧",
  "●",
  "○",
  "▲",
  "△",
  "▼",
  "▽",
  "■",
  "□",
  "✸",
  "❊",
  "✽",
  "✿",
  "♠",
  "♣",
  "♥",
  "♦",
  "◇",
  "◈",
  "◐",
  "◑",
  "✚",
  "✜",
  "❖",
  "✵",
  "✰",
  "✪",
  "✫",
  "✬",
  "☰",
  "☲",
  "☱",
  "☴",
  "▽",
  "▱",
  "⬖",
  "⬗",
];

/** Deterministic symbol identicon for a userId — same id, same symbols, everywhere. */
export function userSymbolList(userId: string, count = 6): string[] {
  let h = 2166136261;
  for (const ch of userId) {
    h ^= ch.codePointAt(0) ?? 0;
    h = Math.imul(h, 16777619);
  }
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    out.push(PALETTE[(h >>> 0) % PALETTE.length]);
  }
  return out;
}
