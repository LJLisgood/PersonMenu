export const categoryOrder = [
  '素菜',
  '荤菜',
  '水产',
  '早餐',
  '主食',
  '汤',
  '甜品',
  '饮品',
  '调味料',
  '半成品',
];

export function sortedCategories(categories: string[]): string[] {
  const rank = (value: string) => {
    const index = categoryOrder.indexOf(value);
    return index < 0 ? 99 : index;
  };
  return [...categories].sort((a, b) => rank(a) - rank(b));
}
