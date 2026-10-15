import { useState } from 'react';
import { recipeTags } from './recipeForm';

export function RecipeTagPicker({
  selected,
  available,
  input,
  onInput,
  onChange,
}: {
  selected: string[];
  available: string[];
  input: string;
  onInput: (value: string) => void;
  onChange: (value: string[]) => void;
}) {
  const [error, setError] = useState('');
  const suggestions = available.filter(
    (tag) =>
      !selected.includes(tag) && tag.toLocaleLowerCase().includes(input.trim().toLocaleLowerCase()),
  );
  const add = (value: string) => {
    try {
      onChange(recipeTags(selected, value));
      onInput('');
      setError('');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : '标签无法添加');
    }
  };
  return (
    <fieldset className="recipe-tag-picker">
      <legend>标签（可选）</legend>
      {selected.length > 0 && (
        <div className="recipe-selected-tags" aria-label="已选标签">
          {selected.map((tag) => (
            <button
              key={tag}
              type="button"
              className="recipe-tag-chip"
              aria-label={`移除标签${tag}`}
              onClick={() => onChange(selected.filter((value) => value !== tag))}
            >
              {tag}
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
      )}
      <div className="recipe-tag-input">
        <label className="sr-only" htmlFor="recipe-tag-search">
          选择或新增标签
        </label>
        <input
          id="recipe-tag-search"
          value={input}
          maxLength={200}
          placeholder="搜索已有标签，或输入新标签"
          onChange={(event) => {
            onInput(event.target.value);
            setError('');
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              if (input.trim()) add(input);
            }
          }}
        />
        <button
          type="button"
          className="button subtle"
          disabled={!input.trim()}
          onClick={() => add(input)}
        >
          添加标签
        </button>
      </div>
      {suggestions.length > 0 ? (
        <div className="recipe-tag-suggestions" aria-label="可选标签">
          {suggestions.slice(0, 16).map((tag) => (
            <button key={tag} type="button" className="button subtle" onClick={() => add(tag)}>
              {tag}
            </button>
          ))}
        </div>
      ) : (
        <small>
          {available.length
            ? '没有匹配的标签，可以输入新标签后添加。'
            : '当前菜谱库暂无可选标签，可自行添加。'}
        </small>
      )}
      {suggestions.length > 16 && <small>输入名称可查找更多标签。</small>}
      <small>可选多个；输入的新标签也会随菜谱保存，发布后可供大家选择。</small>
      {error && <p role="alert">{error}</p>}
    </fieldset>
  );
}
