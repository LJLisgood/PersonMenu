import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCloud } from './Cloud';
import { useCaptcha } from './Captcha';
import { compressPhoto } from './photo';
import type { RecipeDetail } from './types';

export function PhotoUpload({
  recipe,
  onSaved,
  onCancel,
}: {
  recipe: RecipeDetail;
  onSaved?: () => void;
  onCancel: () => void;
}) {
  const cloud = useCloud();
  const captcha = useCaptcha();
  const heading = useRef<HTMLHeadingElement>(null);
  const [file, setFile] = useState<File>();
  const [preview, setPreview] = useState('');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [notice, setNotice] = useState('');
  const [uploaded, setUploaded] = useState<{ owner: string; url: string }>();
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const owner = cloud.session?.user.id;
  const activeOwner = useRef(owner);
  activeOwner.current = owner;
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView?.({ block: 'start', behavior: 'auto' });
  }, []);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !file) return;
    setBusy(true);
    setNotice('');
    try {
      const blob = await compressPhoto(file);
      const session = await cloud.ensureGuest(captcha.challenge);
      let url = uploaded?.owner === session.user.id ? uploaded.url : '';
      if (!url) {
        const result = await cloud.api<{ url: string }>('uploads', {
          method: 'POST',
          headers: {
            'Content-Type': blob.type,
            'X-Captcha-Token': session.user.is_anonymous ? await captcha.challenge() : '',
          },
          body: blob,
        });
        url = result.url;
        setUploaded({ owner: session.user.id, url });
      }
      if (activeOwner.current && activeOwner.current !== session.user.id)
        throw new Error('账号已切换，请重新提交照片');
      if (cloud.admin) {
        await cloud.api(`admin/recipes/${encodeURIComponent(recipe.id)}/cover`, {
          method: 'PUT',
          body: JSON.stringify({ cover: url, baseCover: recipe.cover }),
        });
        setNotice('照片已设为这道菜的封面。');
        onSaved?.();
      } else {
        const result = await cloud.api<{ notification: string }>('requests', {
          method: 'POST',
          body: JSON.stringify({
            id: requestId,
            kind: 'photo',
            nickname,
            email,
            payload: { photo: { recipeId: recipe.id, url, baseCover: recipe.cover } },
            captcha: session.user.is_anonymous ? await captcha.challenge() : '',
          }),
        });
        setNotice(
          `照片已提交，等待管理员审核。${
            result.notification === 'sent'
              ? '管理员已收到邮件提醒。'
              : '邮件提醒暂未发出，管理员仍可在工作台查看。'
          }`,
        );
      }
      setDone(true);
    } catch (failure) {
      setNotice(failure instanceof Error ? failure.message : '照片提交失败，请重试');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="cloud-panel photo-upload-panel" id="recipe-photo-upload" aria-busy={busy}>
      <h2 ref={heading} tabIndex={-1}>
        为「{recipe.name}」补一张照片
      </h2>
      <p>
        {cloud.admin
          ? '保存后会直接显示为这道菜的封面。'
          : '上传你拍摄的成品照片，管理员审核后显示。审核前仅你和管理员可查看。'}
      </p>
      {!done && (
        <form className="cloud-form" onSubmit={submit}>
          <label>
            选择成品照片
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              required
              disabled={busy}
              onChange={(event) => {
                setFile(event.target.files?.[0]);
                setUploaded(undefined);
                setRequestId(crypto.randomUUID());
                setNotice('');
              }}
            />
            <small>支持 20 MB 内的 JPEG、PNG、WebP；上传前会缩小到最长边 1600 像素。</small>
          </label>
          {preview && (
            <img className="photo-upload-preview" src={preview} alt="待上传的成品照片预览" />
          )}
          {!cloud.admin && (
            <div className="form-columns">
              <label>
                你的昵称
                <input
                  required
                  maxLength={40}
                  value={nickname}
                  disabled={busy}
                  onChange={(e) => setNickname(e.target.value)}
                />
              </label>
              <label>
                联系邮箱（可选，仅管理员可见）
                <input
                  type="email"
                  maxLength={254}
                  value={email}
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
            </div>
          )}
          <div ref={captcha.element} />
          <div className="cloud-actions">
            <button className="button primary" disabled={busy || !file}>
              {busy ? '正在提交照片…' : cloud.admin ? '保存为菜谱封面' : '提交照片审核'}
            </button>
            <button type="button" className="button subtle" disabled={busy} onClick={onCancel}>
              取消
            </button>
          </div>
        </form>
      )}
      {notice && (
        <p className="notice" role="status">
          {notice}
        </p>
      )}
      {done && (
        <button className="button subtle" onClick={onCancel}>
          收起
        </button>
      )}
    </section>
  );
}
