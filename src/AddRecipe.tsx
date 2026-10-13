import { useState } from 'react';
import { ArrowLeft, Copy, Check, Download, FileText, Image, Eye } from 'lucide-react';
import type { Route } from './types';
import { assetUrl, routeHash } from './state';
export function AddRecipe({ route }: { route: Route }) {
  const [name, setName] = useState('');
  const [category, setCategory] = useState('家常菜');
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState('');
  const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;
  const command = `npm run recipe:new -- --name ${shellQuote(name || '我的新菜谱')} --category ${shellQuote(category || '家常菜')}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setCopyError('');
    } catch {
      setCopyError('无法自动复制，请选中下方命令手动复制。');
    }
  };
  return (
    <div className="add-page">
      <a className="back-link" href={routeHash({ ...route, page: 'library', id: undefined })}>
        <ArrowLeft size={18} />
        返回菜谱库
      </a>
      <header>
        <h1>把拿手菜，留在这里。</h1>
        <p>
          一个 Markdown 文件，几张本地照片。
          <br />
          下次做菜时，就能找回熟悉的味道。
        </p>
      </header>
      <div className="add-workflow">
        <section>
          <div className="workflow-number">01</div>
          <h2>
            <FileText size={22} />
            新建菜谱文件
          </h2>
          <p>在项目目录运行命令，自动生成带稳定 ID 的模板。</p>
          <div className="add-fields">
            <label>
              菜名
              <input
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setCopied(false);
                }}
                placeholder="例如：妈妈的红烧肉"
              />
            </label>
            <label>
              分类
              <input
                value={category}
                onChange={(e) => {
                  setCategory(e.target.value);
                  setCopied(false);
                }}
                placeholder="可填写自定义分类"
              />
            </label>
          </div>
          <div className="command-box">
            <code>{command}</code>
            <button className="icon-button" aria-label="复制新建命令" onClick={copy}>
              {copied ? <Check size={19} /> : <Copy size={19} />}
            </button>
          </div>
          {(copied || copyError) && (
            <small role="status">{copied ? '命令已复制' : copyError}</small>
          )}
          <a className="download-template" href={assetUrl('recipe-template.md')} download>
            <Download size={17} />
            也可以下载 Markdown 模板
          </a>
        </section>
        <section>
          <div className="workflow-number">02</div>
          <h2>
            <Image size={22} />
            写下做法，放入照片
          </h2>
          <p>
            编辑 <code>content/personal/菜名/菜名.md</code>
            ，填写食材、用量、步骤和备注。图片放在同目录的 <code>images/</code> 中。
          </p>
          <pre>{`# cover: ./images/cover.jpg\n\n## 步骤\n\n1. 准备食材。\n   - 把需要记住的小技巧也写下来。`}</pre>
          <p className="help-note">
            取消 cover 行的注释即可设置封面。难度、耗时和份数只在你填写后显示。
          </p>
        </section>
        <section>
          <div className="workflow-number">03</div>
          <h2>
            <Eye size={22} />
            本地预览，提交发布
          </h2>
          <p>
            运行 <code>npm run dev</code>。保存菜谱后，预览会自动更新；搜索索引与分类也会一起刷新。
          </p>
          <pre>{`npm run build\ngit add content/personal\ngit commit -m "添加一道新菜谱"\ngit push`}</pre>
          <p className="help-note">
            连接 GitHub Pages
            后，推送会触发构建发布。网站中的新增入口用于辅助维护本地文件，不会在线保存菜谱。
          </p>
        </section>
      </div>
    </div>
  );
}
