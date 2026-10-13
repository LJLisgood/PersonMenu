import { useMemo } from 'react';
import { assetUrl } from './state';
// HTML is generated from Markdown AST and sanitized at build time.
// Rebase generated local assets for both root and repository-path deployments.
export function Markdown({ html, className = '' }: { html: string; className?: string }) {
  const rebased = useMemo(
    () =>
      html.replace(
        /(src|href)="\.\/((?:media|data)\/[^"\n]+)"/g,
        (_match, attr, url) => `${attr}="${assetUrl(url)}"`,
      ),
    [html],
  );
  return <div className={`markdown ${className}`} dangerouslySetInnerHTML={{ __html: rebased }} />;
}
