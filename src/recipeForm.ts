export type RecipeFormContent = {
  ingredients: string;
  steps: string[];
  notes: string;
  photos: string[];
};
const marker = '<!-- kitchen-form:v1 -->';
const special = new Set('\\`*_{}[]()#+-.!<>|~&='.split(''));
const escapeText = (value: string) =>
  [...value].map((c) => (special.has(c) ? `\\${c}` : c)).join('');
function unescapeText(value: string): string {
  let result = '';
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\' && special.has(value[i + 1])) i++;
    result += value[i];
  }
  return result;
}
const lines = (value: string) => value.replace(/\r\n?/g, '\n').split('\n');

export function recipeFormMarkdown(content: RecipeFormContent): string {
  const ingredients = lines(content.ingredients)
    .map((s) => s.trim())
    .filter(Boolean);
  const steps = content.steps.map((s) => s.trim()).filter(Boolean);
  const sections = [
    marker,
    '## 食材',
    ingredients.map((s) => `- ${escapeText(s)}`).join('\n'),
    '## 步骤',
    steps
      .map((step, index) => {
        const prefix = `${index + 1}. `;
        return (
          prefix +
          lines(step)
            .map(escapeText)
            .join(`  \n${' '.repeat(prefix.length)}`)
        );
      })
      .join('\n\n'),
  ];
  if (content.notes.trim())
    sections.push('## 小贴士', lines(content.notes.trim()).map(escapeText).join('  \n'));
  if (content.photos.length) {
    if (
      content.photos.some((url) => !/^\/api\/media\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/.test(url))
    )
      throw new Error('只能使用本站上传的照片');
    sections.push('## 照片', content.photos.map((url) => `![菜谱照片](${url})`).join('\n\n'));
  }
  return sections.filter(Boolean).join('\n\n');
}

// Only reopen documents produced by this form, and require an exact round trip.
// Arbitrary Markdown, frontmatter, formulas and nested sections remain in the source editor.
export function readRecipeForm(original: string): RecipeFormContent | null {
  if (!original.startsWith(`${marker}\n\n## 食材\n\n`)) return null;
  const sections = original.split('\n\n## ');
  if (sections[0] !== marker || sections.length < 3 || sections.length > 5) return null;
  const ingredientSection = sections[1].split('\n\n');
  const stepSection = sections[2].split('\n\n');
  if (
    ingredientSection.shift() !== '食材' ||
    ingredientSection.length !== 1 ||
    stepSection.shift() !== '步骤'
  )
    return null;
  const ingredients = ingredientSection[0].split('\n');
  if (ingredients.some((line) => !line.startsWith('- '))) return null;
  const steps: string[] = [];
  for (const [index, step] of stepSection.entries()) {
    const prefix = `${index + 1}. `;
    if (!step.startsWith(prefix)) return null;
    steps.push(
      unescapeText(
        step
          .slice(prefix.length)
          .split(`  \n${' '.repeat(prefix.length)}`)
          .join('\n'),
      ),
    );
  }
  const result: RecipeFormContent = {
    ingredients: ingredients.map((s) => unescapeText(s.slice(2))).join('\n'),
    steps,
    notes: '',
    photos: [],
  };
  for (const section of sections.slice(3)) {
    if (section.startsWith('小贴士\n\n') && !result.notes && !result.photos.length)
      result.notes = unescapeText(section.slice('小贴士\n\n'.length).split('  \n').join('\n'));
    else if (section.startsWith('照片\n\n') && !result.photos.length) {
      const photos = section.slice('照片\n\n'.length).split('\n\n');
      for (const photo of photos) {
        const match = photo.match(
          /^!\[菜谱照片\]\((\/api\/media\/[a-zA-Z0-9_-]+(?:\.[a-zA-Z0-9]+)?)\)$/,
        );
        if (!match) return null;
        result.photos.push(match[1]);
      }
    } else return null;
  }
  return recipeFormMarkdown(result) === original ? result : null;
}

export function recipeTags(selected: string[], input: string): string[] {
  const tags = [
    ...new Set([...selected, ...input.split(/[、,，\n]/)].map((s) => s.trim()).filter(Boolean)),
  ];
  if (tags.length > 20) throw new Error('标签最多 20 个');
  if (tags.some((tag) => tag.length > 40)) throw new Error('每个标签最多 40 字');
  return tags;
}
