import { useRef } from 'react';
import { Plus, ArrowUp, ArrowDown, X } from 'lucide-react';
export type FormStep = { id: string; text: string };

export function RecipeFormFields({
  ingredients,
  steps,
  notes,
  onIngredients,
  onSteps,
  onNotes,
}: {
  ingredients: string;
  steps: FormStep[];
  notes: string;
  onIngredients: (value: string) => void;
  onSteps: (value: FormStep[]) => void;
  onNotes: (value: string) => void;
}) {
  const fields = useRef(new Map<string, HTMLTextAreaElement>());
  const move = (index: number, to: number) => {
    const next = [...steps];
    [next[index], next[to]] = [next[to], next[index]];
    onSteps(next);
  };
  return (
    <div className="recipe-form-sections">
      <label>
        食材与用量
        <textarea
          rows={5}
          required
          maxLength={15000}
          value={ingredients}
          placeholder={'例如：\n番茄 2 个\n鸡蛋 3 个\n盐 适量'}
          onChange={(event) => onIngredients(event.target.value)}
        />
        <small>每行一种食材，写上实际用量即可。</small>
      </label>
      <fieldset className="recipe-step-editor">
        <legend>制作步骤</legend>
        <p className="cloud-hint">每一步分别填写，可以添加、删除或调整顺序。</p>
        {steps.map((step, index) => (
          <div className="recipe-step-field" key={step.id}>
            <div className="recipe-step-heading">
              <label htmlFor={`recipe-step-${step.id}`}>步骤 {index + 1}</label>
              <div>
                <button
                  type="button"
                  className="icon-button"
                  disabled={!index}
                  aria-label={`上移步骤 ${index + 1}`}
                  onClick={() => move(index, index - 1)}
                >
                  <ArrowUp size={17} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={index === steps.length - 1}
                  aria-label={`下移步骤 ${index + 1}`}
                  onClick={() => move(index, index + 1)}
                >
                  <ArrowDown size={17} />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  disabled={steps.length === 1}
                  aria-label={`删除步骤 ${index + 1}`}
                  onClick={() => {
                    const next = steps.filter((s) => s.id !== step.id);
                    onSteps(next);
                    fields.current.get(next[Math.min(index, next.length - 1)].id)?.focus();
                  }}
                >
                  <X size={17} />
                </button>
              </div>
            </div>
            <textarea
              id={`recipe-step-${step.id}`}
              ref={(element) => {
                if (element) fields.current.set(step.id, element);
                else fields.current.delete(step.id);
              }}
              required
              rows={3}
              maxLength={10000}
              value={step.text}
              placeholder="写清楚这一步怎么做，也可以注明火候和时间。"
              onChange={(event) =>
                onSteps(
                  steps.map((s) => (s.id === step.id ? { ...s, text: event.target.value } : s)),
                )
              }
            />
          </div>
        ))}
        <button
          type="button"
          className="button subtle"
          disabled={steps.length >= 80}
          onClick={() => {
            const next = { id: crypto.randomUUID(), text: '' };
            onSteps([...steps, next]);
            requestAnimationFrame(() => fields.current.get(next.id)?.focus());
          }}
        >
          <Plus size={18} />
          添加一步
        </button>
      </fieldset>
      <label>
        小贴士（可选）
        <textarea
          rows={3}
          maxLength={10000}
          value={notes}
          placeholder="例如替换食材、口味调整或容易忽略的小细节。"
          onChange={(event) => onNotes(event.target.value)}
        />
      </label>
    </div>
  );
}
