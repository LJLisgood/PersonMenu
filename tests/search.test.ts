import { describe, it, expect } from 'vitest';
import fs from 'node:fs/promises';
import MiniSearch from 'minisearch';
import { buildIndex, queryRecipes, searchOptions } from '../scripts/search.mjs';
const recipes = [
  {
    id: 'tomato',
    name: '西红柿炒鸡蛋',
    category: '素菜',
    tags: ['快手'],
    difficulty: 2,
    source: 'howtocook',
    ingredients: ['西红柿', '鸡蛋', '葱'],
    searchBody: '关火盛盘 不要洗锅',
  },
  {
    id: 'egg',
    name: '鸡蛋羹',
    category: '早餐',
    tags: [],
    difficulty: 1,
    source: 'personal',
    ingredients: ['鸡蛋', '牛奶'],
    searchBody: '搅拌 水蒸气',
  },
  {
    id: 'meat',
    name: '红烧肉',
    category: '荤菜',
    tags: [],
    difficulty: 3,
    source: 'howtocook',
    ingredients: ['五花肉'],
    searchBody: '小火炖煮',
  },
];
const index = buildIndex(recipes);
const empty = {
  q: '',
  category: '',
  difficulty: '',
  tag: '',
  include: '',
  exclude: '',
  source: '',
};
const query = (filters: object) => queryRecipes(index, recipes, { ...empty, ...filters });
describe('search and intersection filters', () => {
  it('matches Chinese title, ingredients, and original steps', () => {
    expect(query({ q: '西红柿炒鸡蛋' })[0]).toBe('tomato');
    expect(query({ q: '五花肉' })).toEqual(['meat']);
    expect(query({ q: '不要洗锅' })).toEqual(['tomato']);
  });
  it('supports full pinyin and initials without duplicate results', () => {
    expect(query({ q: 'xihongshichaojidan' })).toEqual(['tomato']);
    expect(query({ q: 'xhscjd' })).toEqual(['tomato']);
    expect(new Set(query({ q: '鸡蛋' })).size).toBe(query({ q: '鸡蛋' }).length);
  });
  it('requires all include ingredients and rejects any excluded ingredient', () => {
    expect(query({ include: '鸡蛋，西红柿' })).toEqual(['tomato']);
    expect(query({ include: '鸡蛋', exclude: '牛奶' })).toEqual(['tomato']);
    expect(query({ include: '鸡蛋', category: '素菜', difficulty: '2', tag: '快手' })).toEqual([
      'tomato',
    ]);
    expect(query({ category: '荤菜', include: '鸡蛋' })).toEqual([]);
  });
  it('filters source and returns empty results for unrelated text', () => {
    expect(query({ source: 'personal' })).toEqual(['egg']);
    expect(query({ q: '不存在的菜123' })).toEqual([]);
  });
  it('searches the real imported data using serialized index', async () => {
    const manifest = JSON.parse(await fs.readFile('public/data/manifest.json', 'utf8'));
    const serialized = await fs.readFile('public/data/search.json', 'utf8');
    const loaded = MiniSearch.loadJSON(serialized, searchOptions);
    expect(
      queryRecipes(loaded, manifest.recipes, { ...empty, q: 'xhscjd' }).map(
        (id: string) => manifest.recipes.find((r: { id: string }) => r.id === id).name,
      ),
    ).toContain('西红柿炒鸡蛋');
  });
});
