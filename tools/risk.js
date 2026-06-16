import { config } from '../config.js';

export function isBannedCategory(metadata) {
  const categories = metadata?.categories ?? [];
  const banned = config.risk?.bannedCategories ?? [];
  return categories.some((c) =>
    banned.some((b) => c.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(c.toLowerCase()))
  );
}

export function matchesKeywordBlacklist(name = '', symbol = '', description = '') {
  const keywords = config.risk?.keywordBlacklist ?? [];
  const text = `${name} ${symbol} ${description}`.toLowerCase();
  return keywords.some((kw) => text.includes(kw.toLowerCase()));
}

export function passesRiskFilter(pool) {
  const meta = pool.metadata ?? {};
  if (isBannedCategory(meta)) {
    return { pass: false, reason: `banned category: ${meta.categories?.join(', ')}` };
  }
  if (matchesKeywordBlacklist(pool.name, pool.symbol, meta.description)) {
    return { pass: false, reason: 'keyword blacklist match' };
  }
  return { pass: true };
}
