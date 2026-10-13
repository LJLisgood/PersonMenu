import MiniSearch from 'minisearch';
import { pinyin } from 'pinyin-pro';
const segmenter = new Intl.Segmenter('zh-CN', { granularity: 'word' });
export const normalize = (text) => text.normalize('NFKC').toLowerCase().trim();
export function tokenize(text) {
  const value = normalize(text);
  const tokens = new Set();
  for (const segment of segmenter.segment(value))
    if (segment.isWordLike) tokens.add(segment.segment);
  // Chinese bigrams bridge segmentation differences; single characters allow short queries.
  for (const chunk of value.match(/[\p{Script=Han}]+/gu) ?? []) {
    for (let i = 0; i < chunk.length; i++) {
      tokens.add(chunk[i]);
      if (i + 1 < chunk.length) tokens.add(chunk.slice(i, i + 2));
    }
  }
  for (const word of value.match(/[a-z\d]+/g) ?? []) tokens.add(word);
  return [...tokens];
}
export const searchOptions = {
  fields: ['name', 'ingredientsText', 'tagsText', 'body', 'romanized'],
  tokenize,
  searchOptions: {
    boost: { name: 8, ingredientsText: 4, tagsText: 3, romanized: 4 },
    prefix: true,
    combineWith: 'AND',
  },
};
export function romanize(value) {
  return `${pinyin(value, { toneType: 'none' }).replace(/\s+/g, '')} ${pinyin(value, { pattern: 'first', toneType: 'none' }).replace(/\s+/g, '')}`;
}
export function buildIndex(recipes) {
  const search = new MiniSearch(searchOptions);
  search.addAll(
    recipes.map((r) => ({
      id: r.id,
      name: r.name,
      ingredientsText: r.ingredients.join(' '),
      tagsText: r.tags.join(' '),
      body: r.searchBody,
      romanized: [r.name, ...r.ingredients].map(romanize).join(' '),
    })),
  );
  return search;
}
export function queryRecipes(search, recipes, state) {
  const query = normalize(state.q || '');
  const results = query
    ? search
        .search(query)
        .sort((a, b) => {
          const first = recipes.find((r) => r.id === a.id);
          const second = recipes.find((r) => r.id === b.id);
          const rank = (r) =>
            normalize(r.name) === query
              ? 3
              : normalize(r.name).startsWith(query)
                ? 2
                : normalize(r.name).includes(query)
                  ? 1
                  : 0;
          return rank(second) - rank(first) || b.score - a.score;
        })
        .map((r) => r.id)
    : recipes.map((r) => r.id);
  const allowed = new Set(
    recipes
      .filter((r) => {
        if (state.category && r.category !== state.category) return false;
        if (state.source && r.source !== state.source) return false;
        if (state.difficulty && r.difficulty !== Number(state.difficulty)) return false;
        if (state.tag && !r.tags.includes(state.tag)) return false;
        const ingredients = normalize(r.ingredients.join(' '));
        const terms = (value) =>
          (value || '')
            .split(/[，,、\n]+/)
            .map(normalize)
            .filter(Boolean);
        return (
          terms(state.include).every((x) => ingredients.includes(x)) &&
          !terms(state.exclude).some((x) => ingredients.includes(x))
        );
      })
      .map((r) => r.id),
  );
  return results.filter((id) => allowed.has(id));
}
