import { useState, type FormEvent } from 'react';
import { useCloud } from './Cloud';
import { useCaptcha } from './Captcha';
import { prepareRecipe } from '../shared/recipe';
import type { RecipeDetail } from './types';
import type { RecipeRecord } from '../shared/cloud';
import { Markdown } from './Markdown';
import { compressPhoto } from './photo';

const initialBody =
  '## 食材\n\n- 请填写实际食材与用量\n\n## 步骤\n\n1. 请填写第一步。\n2. 请填写下一步。\n\n## 小贴士\n\n记录需要留意的细节。';
export function RecipeEditor({
  record,
  onSaved,
  submission = false,
  initial,
  onCancel,
}: {
  record?: RecipeRecord;
  onSaved: () => void;
  submission?: boolean;
  initial?: RecipeDetail;
  onCancel?: () => void;
}) {
  const cloud = useCloud(),
    captcha = useCaptcha();
  const value = record?.document ?? initial;
  const [name, setName] = useState(value?.name ?? ''),
    [category, setCategory] = useState(value?.category ?? '家常菜'),
    [description, setDescription] = useState(value?.description ?? '');
  const [original, setOriginal] = useState(value?.original ?? initialBody),
    [tags, setTags] = useState(value?.tags.join('、') ?? '');
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
  const document = () => ({
    name,
    category,
    description,
    original,
    tags: tags
      .split(/[、,，]/)
      .map((s) => s.trim())
      .filter(Boolean),
    cover: cover || null,
    difficulty: difficulty ? Number(difficulty) : null,
    totalMinutes: minutes ? Number(minutes) : null,
    servings: servings ? Number(servings) : null,
  });
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setNotice('');
    try {
      if (submission) {
        const session = await cloud.ensureGuest(captcha.challenge);
        const result = await cloud.api<{ notification: string }>('requests', {
          method: 'POST',
          body: JSON.stringify({
            id: requestId,
            kind: 'submission',
            nickname,
            email,
            payload: { recipe: document(), notes: '' },
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
            document: document(),
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
      setOriginal((current) => `${current}\n\n![步骤照片](${result.url})\n`);
      setNotice('图片已上传，已追加到正文。可移动到对应步骤。待审核照片仅你和管理员可查看。');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '图片上传失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="cloud-form" onSubmit={submit}>
      <div className="form-columns">
        <label>
          菜名
          <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label>
          分类
          <input
            required
            maxLength={40}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
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
      <label>
        标签
        <input
          placeholder="例如：家常菜、少油"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
        />
      </label>
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
      <label>
        封面图片地址
        <input
          placeholder="上传照片后自动填入，也可选择正文中已上传的图片地址"
          value={cover}
          onChange={(e) => setCover(e.target.value)}
        />
      </label>
      <label>
        上传照片
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            void upload(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
        <small>照片会先缩小到最长边 1600 像素，再上传。</small>
      </label>
      <label>
        食材、步骤与备注（Markdown）
        <textarea
          className="recipe-source"
          rows={18}
          required
          maxLength={50000}
          value={original}
          onChange={(e) => setOriginal(e.target.value)}
        />
      </label>
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
      <div ref={captcha.element} />
      <div className="cloud-actions">
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? '正在处理…' : submission ? '提交审核' : '保存菜谱'}
        </button>
        <button
          type="button"
          className="button subtle"
          disabled={busy}
          onClick={() => {
            void prepareRecipe(document(), record?.id ?? 'preview', record?.document)
              .then(setPreview)
              .catch((e) => setNotice(e.message));
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
