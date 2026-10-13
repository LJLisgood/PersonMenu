import { ArrowLeft, ChefHat, Clock, Users, ExternalLink, FileText } from 'lucide-react';
import type { RecipeDetail, Route } from './types';
import { routeHash, assetUrl } from './state';
import { Difficulty } from './RecipeCard';
import { Markdown } from './Markdown';
export function Detail({ recipe, route }: { recipe: RecipeDetail; route: Route }) {
  return (
    <>
      <a className="back-link" href={routeHash({ ...route, page: 'library', id: undefined })}>
        <ArrowLeft size={18} />
        返回菜谱库
      </a>
      <header className={`detail-header ${recipe.cover ? '' : 'without-cover'}`}>
        <div>
          <span className="detail-category">{recipe.category}</span>
          <h1>{recipe.name}</h1>
          <p>{recipe.description}</p>
          <div className="detail-meta">
            <Difficulty value={recipe.difficulty} />
            <span>
              <Clock size={16} />
              {recipe.totalMinutes ? `${recipe.totalMinutes} 分钟` : '耗时未提供'}
            </span>
            <span>
              <Users size={16} />
              {recipe.servings ? `${recipe.servings} 人份` : '份数未提供'}
            </span>
          </div>
          <a className="button primary" href={routeHash({ ...route, page: 'cook' })}>
            <ChefHat size={19} />
            开始做这道菜
          </a>
        </div>
        {recipe.cover && (
          <img className="detail-cover" src={assetUrl(recipe.cover)} alt={recipe.name} />
        )}
      </header>
      <div className="detail-source">
        {recipe.sourceUrl ? (
          <a href={recipe.sourceUrl} target="_blank" rel="noreferrer">
            <ExternalLink size={15} />
            HowToCook 原文
          </a>
        ) : (
          <span>
            <FileText size={15} />
            我的本地菜谱
          </span>
        )}
        <details>
          <summary>本地文件</summary>
          <code>{recipe.sourcePath}</code>
        </details>
      </div>
      <article className="detail-body">
        <Markdown html={recipe.html} />
      </article>
      <footer className="detail-bottom">
        <a className="button primary" href={routeHash({ ...route, page: 'cook' })}>
          <ChefHat size={19} />
          进入烹饪模式
        </a>
        <a className="back-link" href={routeHash({ ...route, page: 'library', id: undefined })}>
          继续找菜谱
        </a>
      </footer>
    </>
  );
}
