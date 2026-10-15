import ThoughtLine from './ThoughtLine';
import { validateAiDraft } from '../shared/recipeAi';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCloud } from './Cloud';
import { useCaptcha } from './Captcha';
import { prepareRecipe } from '../shared/recipe';
import type { Manifest, RecipeDetail } from './types';
import type { RecipeRecord } from '../shared/cloud';
import { Markdown } from './Markdown';
import { compressPhoto } from './photo';
import { categoryOrder, sortedCategories } from './categories';
import { recipeFormMarkdown, readRecipeForm, recipeTags } from './recipeForm';
import { RecipeTagPicker } from './RecipeTagPicker';
import { RecipeFormFields, type FormStep } from './RecipeFormFields';
import { PrivatePhoto } from './PrivatePhoto';
export function RecipeEditor({
  record,
  onSaved,
  submission = false,
  initial,
  onCancel,
  catalog,
}: {
  record?: RecipeRecord;
  onSaved: () => void;
  submission?: boolean;
  initial?: RecipeDetail;
  onCancel?: () => void;
  catalog: Pick<Manifest, 'categories' | 'tags'>;
}) {
  const cloud = useCloud(),
    captcha = useCaptcha();
  const value = record?.document ?? initial;
  const [name, setName] = useState(value?.name ?? ''),
    [category, setCategory] = useState(value?.category ?? ''),
    [description, setDescription] = useState(value?.description ?? '');
  const [original, setOriginal] = useState(value?.original ?? '');
  const [initialForm] = useState(() => (value ? readRecipeForm(value.original) : null));
  const simple = !value || !!initialForm;
  const [ingredients, setIngredients] = useState(initialForm?.ingredients ?? '');
  const [steps, setSteps] = useState<FormStep[]>(() =>
    (initialForm?.steps ?? ['']).map((text) => ({ id: crypto.randomUUID(), text })),
  );
  const [notes, setNotes] = useState(initialForm?.notes ?? '');
  const [photos, setPhotos] = useState(initialForm?.photos ?? []);
  const [tags, setTags] = useState(value?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const categories = sortedCategories(Object.keys(catalog.categories));
  const options = categories.length ? categories : categoryOrder;
  const [cover, setCover] = useState(value?.cover ?? ''),
    [difficulty, setDifficulty] = useState(value?.difficulty?.toString() ?? '');
  const [minutes, setMinutes] = useState(value?.totalMinutes?.toString() ?? ''),
    [servings, setServings] = useState(value?.servings?.toString() ?? '');
  const [nickname, setNickname] = useState(''),
    [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(''),
    [preview, setPreview] = useState<RecipeDetail | null>(null),
    [state, setState] = useState(record?.state ?? 'draft');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [aiText, setAiText] = useState('');
  const [aiStatus, setAiStatus] = useState<'idle' | 'working' | 'done' | 'error'>('idle');
  const [aiError, setAiError] = useState('');
  const [aiWarnings, setAiWarnings] = useState<string[]>([]);
  const aiRequest = useRef<AbortController | null>(null);
  useEffect(() => () => aiRequest.current?.abort(), []);
  const aiWorking = aiStatus === 'working';
  const organize = async () => {
    if (busy || aiRequest.current || !aiText.trim()) return;
    if (
      (name ||
        category ||
        description ||
        ingredients ||
        steps.some((s) => s.text) ||
        notes ||
        tags.length ||
        tagInput ||
        difficulty ||
        minutes ||
        servings) &&
      !window.confirm('AI 整理结果会替换下方文字字段，已上传照片会保留。继续吗？')
    )
      return;
    const controller = new AbortController();
    aiRequest.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 70000);
    setAiStatus('working');
    setAiError('');
    setAiWarnings([]);
    try {
      const result = await cloud.api<unknown>('admin/recipe-assist', {
        method: 'POST',
        body: JSON.stringify({ text: aiText, categories: options }),
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      const draft = validateAiDraft(result, options);
      setName(draft.name);
      setCategory(draft.category);
      setDescription(draft.description);
      setTags(draft.tags);
      setTagInput('');
      setIngredients(draft.ingredients);
      setSteps(draft.steps.map((text) => ({ id: crypto.randomUUID(), text })));
      setNotes(draft.notes);
      setDifficulty(draft.difficulty?.toString() ?? '');
      setMinutes(draft.totalMinutes?.toString() ?? '');
      setServings(draft.servings?.toString() ?? '');
      setAiWarnings(draft.warnings);
      setPreview(null);
      setAiStatus('done');
    } catch (error) {
      setAiStatus('error');
      setAiError(
        controller.signal.aborted
          ? '整理已超时或取消，原有表单未更改。'
          : error instanceof Error
            ? error.message
            : '整理失败，请重试',
      );
    } finally {
      window.clearTimeout(timeout);
      aiRequest.current = null;
    }
  };
  const formMarkdown = () =>
    recipeFormMarkdown({ ingredients, steps: steps.map((step) => step.text), notes, photos });
  const document = () => {
    if (simple && (!ingredients.trim() || steps.some((step) => !step.text.trim())))
      throw new Error('请填写食材与每一步的做法，不需要的步骤可以删除。');
    const body = simple ? formMarkdown() : original;
    if (body.length > 50000) throw new Error('菜谱内容过长，请缩短到 50000 字内。');
    return {
      name,
      category,
      description,
      original: body,
      tags: recipeTags(tags, tagInput),
      cover: cover || null,
      difficulty: difficulty ? Number(difficulty) : null,
      totalMinutes: minutes ? Number(minutes) : null,
      servings: servings ? Number(servings) : null,
    };
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || aiWorking) return;
    setBusy(true);
    setNotice('');
    try {
      const recipe = document();
      if (submission) {
        const session = await cloud.ensureGuest(captcha.challenge);
        const result = await cloud.api<{ notification: string }>('requests', {
          method: 'POST',
          body: JSON.stringify({
            id: requestId,
            kind: 'submission',
            nickname,
            email,
            payload: { recipe, notes: '' },
            captcha: session.user.is_anonymous ? await captcha.challenge() : '',
          }),
        });
        setRequestId(crypto.randomUUID());
        setNotice(
          `投稿已保存，等待管理员审核。${result.notification === 'sent' ? '管理员已收到邮件提醒。' : '通知暂未发出，管理员仍可在工作台查看。'}`,
        );
        onSaved();
      } else {
        await cloud.api(`admin/recipes${record ? `/${record.id}` : ''}`, {
          method: record ? 'PATCH' : 'POST',
          body: JSON.stringify({
            document: recipe,
            state,
            revision: record?.revision,
            creationId: record ? undefined : requestId,
          }),
        });
        setNotice('菜谱已保存。');
        onSaved();
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };
  const upload = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setNotice('');
    try {
      const session = await cloud.ensureGuest(captcha.challenge);
      const blob = await compressPhoto(file);
      const result = await cloud.api<{ url: string }>('uploads', {
        method: 'POST',
        headers: {
          'Content-Type': blob.type,
          'X-Captcha-Token': session.user.is_anonymous ? await captcha.challenge() : '',
        },
        body: blob,
      });
      if (!cover) setCover(result.url);
      if (simple) setPhotos((current) => [...current, result.url]);
      else setOriginal((current) => `${current}\n\n![步骤照片](${result.url})\n`);
      setNotice(
        simple
          ? '照片已添加，第一张会作为封面。待审核照片仅你和管理员可查看。'
          : '图片已上传，已追加到正文。可移动到对应步骤。待审核照片仅你和管理员可查看。',
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="cloud-form" onSubmit={submit}>
      {!submission && !value && cloud.admin && (
        <section className="recipe-ai" aria-label="AI 整理菜谱" aria-busy={aiWorking}>
          <label>
            粘贴菜谱原文
            <textarea
              rows={7}
              maxLength={15000}
              value={aiText}
              disabled={busy || aiWorking}
              placeholder="把 OCR 识别文字、食材用量和零散做法粘贴在这里，一次整理一道菜。"
              onChange={(e) => setAiText(e.target.value)}
            />
          </label>
          <small>点击整理后，原文会发送给 DeepSeek。缺失信息会留空，填入后请核对用量再保存。</small>
          <div>
            <button
              type="button"
              className="button subtle"
              disabled={busy || aiWorking || !aiText.trim()}
              onClick={() => void organize()}
            >
              {aiWorking ? '正在整理…' : 'AI 整理并填入'}
            </button>
          </div>
          {(aiStatus === 'working' || aiStatus === 'done') && (
            <ThoughtLine
              working={aiWorking}
              steps={
                aiWorking
                  ? ['原文已准备', '正在请求 AI 整理并校验结果']
                  : ['原文已准备', '整理结果已校验', '已填入表单，请核对后保存']
              }
            />
          )}
          {aiStatus === 'error' && <p role="alert">{aiError}</p>}
          {aiWarnings.length > 0 && (
            <div role="status">
              <strong>请核对</strong>
              <ul>
                {aiWarnings.map((warning, index) => (
                  <li key={index}>{warning}</li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}
      <fieldset className="recipe-editor-fields" disabled={busy || aiWorking}>
        <div className="form-columns">
          <label>
            菜名
            <input
              required
              maxLength={100}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          <label>
            分类
            <select required value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="" disabled>
                请选择分类
              </option>
              {category && !options.includes(category) && (
                <option value={category}>{category}（当前分类）</option>
              )}
              {options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          简介
          <textarea
            rows={2}
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </label>
        <RecipeTagPicker
          selected={tags}
          available={catalog.tags}
          input={tagInput}
          onInput={setTagInput}
          onChange={setTags}
        />
        <div className="form-columns thirds">
          <label>
            难度（可不填）
            <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)}>
              <option value="">未提供</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </label>
          <label>
            耗时／分钟（可不填）
            <input
              type="number"
              min="0.1"
              step="any"
              value={minutes}
              onChange={(e) => setMinutes(e.target.value)}
            />
          </label>
          <label>
            份数（可不填）
            <input
              type="number"
              min="0.1"
              step="any"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            />
          </label>
        </div>
        {!simple && (
          <label>
            封面图片地址
            <input
              placeholder="上传照片后自动填入，也可选择正文中已上传的图片地址"
              value={cover}
              onChange={(e) => setCover(e.target.value)}
            />
          </label>
        )}
        <label>
          {simple ? '上传菜谱照片（可选）' : '上传照片'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || aiWorking}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <small>照片会先缩小到最长边 1600 像素，再上传。</small>
        </label>
        {simple ? (
          <>
            {photos.length > 0 && (
              <div className="recipe-form-photos" aria-label="已上传照片">
                {photos.map((url, index) => (
                  <div key={url}>
                    <PrivatePhoto url={url} />
                    <div className="cloud-actions">
                      <button
                        type="button"
                        className="text-button"
                        aria-pressed={cover === url}
                        onClick={() => setCover(url)}
                      >
                        {cover === url ? '当前封面' : '设为封面'}
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        aria-label={`移除照片 ${index + 1}`}
                        onClick={() => {
                          const remaining = photos.filter((photo) => photo !== url);
                          setPhotos(remaining);
                          if (cover === url) setCover(remaining[0] ?? '');
                        }}
                      >
                        移除照片
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <RecipeFormFields
              ingredients={ingredients}
              steps={steps}
              notes={notes}
              onIngredients={setIngredients}
              onSteps={setSteps}
              onNotes={setNotes}
            />
            <details className="recipe-generated-source">
              <summary>查看自动整理的原文</summary>
              <pre>{formMarkdown()}</pre>
            </details>
          </>
        ) : (
          <label>
            食材、步骤与备注（原文）
            <small>这份菜谱含有原有格式，保留原文编辑可避免遗漏图片、公式或嵌套说明。</small>
            <textarea
              className="recipe-source"
              rows={18}
              required
              maxLength={50000}
              value={original}
              onChange={(e) => setOriginal(e.target.value)}
            />
          </label>
        )}
        {submission ? (
          <div className="form-columns">
            <label>
              你的昵称
              <input
                required
                maxLength={40}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
              />
            </label>
            <label>
              联系邮箱（可选，仅管理员可见）
              <input
                type="email"
                maxLength={254}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
          </div>
        ) : (
          <label>
            发布状态
            <select value={state} onChange={(e) => setState(e.target.value as typeof state)}>
              <option value="draft">草稿</option>
              <option value="published">发布</option>
              <option value="deleted">回收站</option>
            </select>
          </label>
        )}
      </fieldset>
      <div ref={captcha.element} />
      <div className="cloud-actions">
        <button type="submit" className="button primary" disabled={busy || aiWorking}>
          {busy ? '正在处理…' : submission ? '提交审核' : '保存菜谱'}
        </button>
        <button
          type="button"
          className="button subtle"
          disabled={busy || aiWorking}
          onClick={() => {
            try {
              void prepareRecipe(document(), record?.id ?? 'preview', record?.document)
                .then(setPreview)
                .catch((e) => setNotice(e.message));
            } catch (error) {
              setNotice(error instanceof Error ? error.message : '请检查菜谱内容');
            }
          }}
        >
          预览
        </button>
        {onCancel && (
          <button type="button" className="button subtle" onClick={onCancel}>
            返回列表
          </button>
        )}
      </div>
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {preview && (
        <section className="cloud-panel">
          <h2>{preview.name}</h2>
          <Markdown html={preview.html} />
        </section>
      )}
    </form>
  );
}
