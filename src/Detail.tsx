import { lazy, Suspense, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChefHat,
  Clock,
  Users,
  ListChecks,
  Type,
  Share2,
  ImagePlus,
} from 'lucide-react';
import type { RecipeDetail, Route } from './types';
import { routeHash, returnRoute } from './state';
import { Difficulty, FavoriteButton, RecipeImage } from './RecipeCard';
import { Markdown } from './Markdown';
import { useCloud } from './Cloud';
const PhotoUpload = lazy(() => import('./PhotoUpload').then((m) => ({ default: m.PhotoUpload })));
export function Detail({
  recipe,
  route,
  onPhotoSaved,
}: {
  recipe: RecipeDetail;
  route: Route;
  onPhotoSaved?: () => void;
}) {
  const cloud = useCloud();
  const [large, setLarge] = useState(false);
  const [original, setOriginal] = useState(!recipe.steps.length);
  const [message, setMessage] = useState('');
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const uploadTrigger = useRef<HTMLButtonElement>(null);
  const [shareUrl, setShareUrl] = useState('');
  const share = async () => {
    const url = new URL(location.pathname, location.origin);
    url.hash = `/recipe/${encodeURIComponent(recipe.id)}`;
    setMessage('');
    setShareUrl('');
    try {
      await navigator.clipboard.writeText(url.href);
      setMessage('菜谱链接已复制，可以发给亲友。');
    } catch {
      setShareUrl(url.href);
      setMessage('请复制下方菜谱链接，发给亲友。');
    }
  };
  const [checked, setChecked] = useState<string[]>(() => {
    try {
      const value: unknown = JSON.parse(
        localStorage.getItem(`zaotai-steps:v1:${recipe.id}`) || '[]',
      );
      return Array.isArray(value)
        ? [
            ...new Set(
              value.filter(
                (id): id is string =>
                  typeof id === 'string' && recipe.steps.some((step) => step.id === id),
              ),
            ),
          ]
        : [];
    } catch {
      return [];
    }
  });
  const toggleStep = (id: string) => {
    const next = checked.includes(id) ? checked.filter((item) => item !== id) : [...checked, id];
    setChecked(next);
    try {
      localStorage.setItem(`zaotai-steps:v1:${recipe.id}`, JSON.stringify(next));
    } catch {
      setMessage('浏览器无法保存步骤标记，本次阅读仍可使用。');
    }
  };
  const jump = (id: string) => {
    const target = document.getElementById(id);
    target?.scrollIntoView({ block: 'start', behavior: 'auto' });
    target?.focus({ preventScroll: true });
  };
  const back = routeHash(returnRoute(route));
  const backLabel =
    route.from === 'home'
      ? '返回首页'
      : route.from === 'favorites'
        ? '返回我的收藏'
        : route.from === 'recent'
          ? '返回最近浏览'
          : '返回菜谱库';
  return (
    <div className={`recipe-detail ${large ? 'large-reading' : ''}`}>
      <a className="back-link" href={back}>
        <ArrowLeft size={18} />
        {backLabel}
      </a>
      <header className="detail-header">
        <RecipeImage
          recipe={recipe}
          eager
          className="detail-cover"
          placeholderAction={
            cloud.config.enabled && (
              <button
                ref={uploadTrigger}
                className="button subtle"
                aria-expanded={uploadingPhoto}
                aria-controls="recipe-photo-upload"
                onClick={() => setUploadingPhoto((v) => !v)}
              >
                <ImagePlus size={18} />
                上传这道菜的照片
              </button>
            )
          }
        />
        <div>
          <span className="detail-category">{recipe.category}</span>
          <h1>{recipe.name}</h1>
          {recipe.description && <p>{recipe.description}</p>}
          <div className="detail-meta">
            <Difficulty value={recipe.difficulty} />
            {recipe.totalMinutes !== null && (
              <span>
                <Clock size={16} />
                {recipe.totalMinutes} 分钟
              </span>
            )}
            {recipe.servings !== null && (
              <span>
                <Users size={16} />
                {recipe.servings} 人份
              </span>
            )}
          </div>
          {!!recipe.tags.length && (
            <div className="card-tags">
              {recipe.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
          )}
          <div className="detail-actions">
            {cloud.config.enabled && (
              <a
                className="button subtle"
                href={routeHash({ ...route, page: 'requests', id: recipe.id })}
              >
                我想吃这道
              </a>
            )}
            <a className="button primary" href={routeHash({ ...route, page: 'cook' })}>
              <ChefHat size={19} />
              开始做这道菜
            </a>
            <FavoriteButton recipe={recipe} />
            <button className="button subtle" onClick={() => void share()}>
              <Share2 size={18} />
              分享菜谱
            </button>
          </div>
          <small className="local-hint">
            {cloud.session && !cloud.session.user.is_anonymous
              ? '收藏同步至当前账号；步骤标记保存在当前浏览器。'
              : '收藏与步骤标记仅保存在当前浏览器。'}
          </small>
        </div>
      </header>
      {uploadingPhoto && (
        <Suspense fallback={<p className="notice">正在打开照片上传…</p>}>
          <PhotoUpload
            recipe={recipe}
            onSaved={onPhotoSaved}
            onCancel={() => {
              setUploadingPhoto(false);
              uploadTrigger.current?.focus();
            }}
          />
        </Suspense>
      )}
      {message && (
        <p className="reading-notice" role="status">
          {message}
        </p>
      )}
      {shareUrl && (
        <label className="share-link-field">
          菜谱链接
          <input readOnly value={shareUrl} onFocus={(e) => e.target.select()} />
        </label>
      )}
      <nav className="reading-toolbar" aria-label="菜谱阅读导航">
        <div>
          <button className="button subtle" onClick={() => jump('recipe-method')}>
            做法与原文
          </button>
          {recipe.ingredients.length > 0 && (
            <button className="button subtle" onClick={() => jump('recipe-ingredients')}>
              食材清单
            </button>
          )}
          {!original && recipe.steps.length > 0 && recipe.supporting.length > 0 && (
            <button className="button subtle" onClick={() => jump('recipe-notes')}>
              用量与备注
            </button>
          )}
        </div>
        <button className="button subtle" aria-pressed={large} onClick={() => setLarge(!large)}>
          <Type size={18} />
          大字阅读
        </button>
      </nav>
      <div className="detail-reading-layout">
        <article className="detail-body" id="recipe-method" tabIndex={-1}>
          <div className="method-heading">
            <h2>做法与原文</h2>
            {recipe.steps.length > 0 && (
              <button
                className="text-button"
                aria-pressed={original}
                onClick={() => setOriginal(!original)}
              >
                {original ? '查看分步做法' : '阅读完整原文'}
              </button>
            )}
          </div>
          {original ? (
            recipe.html.trim() ? (
              <Markdown html={recipe.html} />
            ) : (
              <p>暂未记录详细做法。</p>
            )
          ) : (
            <>
              <p className="section-description">
                已完成 {checked.length} / {recipe.steps.length} 步 · 可手动标记，保存在此浏览器
              </p>
              <ol className="recipe-steps">
                {recipe.steps.map((step, index) => (
                  <li key={step.id} className={checked.includes(step.id) ? 'completed' : ''}>
                    <div className="step-label">
                      <span>步骤 {String(index + 1).padStart(2, '0')}</span>
                      <label>
                        <input
                          type="checkbox"
                          checked={checked.includes(step.id)}
                          onChange={() => toggleStep(step.id)}
                        />
                        标记完成
                      </label>
                    </div>
                    <Markdown html={step.html} />
                  </li>
                ))}
              </ol>
              {recipe.supporting.length > 0 && (
                <section id="recipe-notes" tabIndex={-1} className="recipe-notes">
                  <h2>用量与备注</h2>
                  {recipe.supporting.map((section, index) => (
                    <section key={index}>
                      <h3>{section.name}</h3>
                      <Markdown html={section.html} />
                    </section>
                  ))}
                </section>
              )}
            </>
          )}
        </article>
        {recipe.ingredients.length > 0 && (
          <aside className="detail-ingredients" id="recipe-ingredients" tabIndex={-1}>
            <h2>
              <ListChecks size={20} />
              食材清单
            </h2>
            <p>保留菜谱原文记录；详细用量与计算请参照正文。</p>
            <ul>
              {recipe.ingredients.map((ingredient, index) => (
                <li key={index}>{ingredient}</li>
              ))}
            </ul>
            <a className="text-button" href={routeHash({ ...route, page: 'cook' })}>
              进入烹饪模式勾选备料
              <ChefHat size={17} />
            </a>
          </aside>
        )}
      </div>
      <footer className="detail-bottom">
        <a className="button primary" href={routeHash({ ...route, page: 'cook' })}>
          <ChefHat size={19} />
          进入烹饪模式
        </a>
        <a className="back-link" href={back}>
          {backLabel}
        </a>
      </footer>
    </div>
  );
}
