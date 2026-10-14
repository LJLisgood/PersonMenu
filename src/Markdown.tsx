import { useEffect, useMemo, useRef } from 'react';
import { assetUrl } from './state';
import { useCloud } from './Cloud';
// HTML is generated from Markdown AST and sanitized at build time.
// Rebase generated local assets for both root and repository-path deployments.
export function Markdown({ html, className = '' }: { html: string; className?: string }) {
  const cloud = useCloud();
  const wrapper = useRef<HTMLDivElement>(null);
  const rebased = useMemo(
    () =>
      html.replace(
        /(src|href)="\.\/((?:media|data)\/[^"\n]+)"/g,
        (_match, attr, url) => `${attr}="${assetUrl(url)}"`,
      ),
    [html],
  );
  useEffect(() => {
    if (!cloud.session || !cloud.client) return;
    let disposed = false;
    const urls: string[] = [];
    for (const img of wrapper.current?.querySelectorAll<HTMLImageElement>(
      'img[src^="/api/media/"]',
    ) ?? []) {
      const source = img.getAttribute('src')!;
      void cloud.client.auth
        .getSession()
        .then(async ({ data }) => {
          if (!data.session) return;
          const response = await fetch(source, {
            headers: { Authorization: `Bearer ${data.session.access_token}` },
          });
          if (!response.ok) return;
          const blob = await response.blob();
          if (disposed) return;
          const url = URL.createObjectURL(blob);
          urls.push(url);
          img.src = url;
        })
        .catch(() => {});
    }
    return () => {
      disposed = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [rebased, cloud.session?.user.id, cloud.client]);
  return (
    <div
      ref={wrapper}
      className={`markdown ${className}`}
      dangerouslySetInnerHTML={{ __html: rebased }}
    />
  );
}
