import { useCallback, useEffect, useRef } from 'react';
import { useCloud } from './Cloud';
type Turnstile = {
  render: (element: HTMLElement, options: Record<string, unknown>) => string;
  execute: (id: string) => void;
  reset: (id: string) => void;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let script: Promise<void> | null = null;
function load() {
  return (script ??= new Promise<void>((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const element = document.createElement('script');
    element.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    element.async = true;
    element.onload = () => resolve();
    element.onerror = () => {
      script = null;
      reject(new Error('人机验证加载失败，请检查网络后重试'));
    };
    document.head.appendChild(element);
  }));
}
export function useCaptcha() {
  const { config } = useCloud();
  const element = useRef<HTMLDivElement>(null),
    widget = useRef<string | null>(null);
  const pending = useRef<{
    resolve: (token: string) => void;
    reject: (error: Error) => void;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      pending.current?.reject(new Error('验证已取消'));
      if (widget.current) window.turnstile?.remove(widget.current);
    },
    [],
  );
  const challenge = useCallback(async () => {
    if (!config.turnstileSiteKey) return '';
    if (pending.current) throw new Error('请先完成人机验证');
    await load();
    if (!element.current || !window.turnstile) throw new Error('无法打开人机验证');
    const done = (token?: string) => {
      clearTimeout(timer.current);
      const task = pending.current;
      pending.current = null;
      if (token) task?.resolve(token);
      else task?.reject(new Error('人机验证未完成，请重试'));
    };
    if (!widget.current)
      widget.current = window.turnstile.render(element.current, {
        sitekey: config.turnstileSiteKey,
        action: 'kitchen',
        execution: 'execute',
        appearance: 'interaction-only',
        callback: (token: string) => done(token),
        'error-callback': () => done(),
        'expired-callback': () => done(),
      });
    else window.turnstile.reset(widget.current);
    return new Promise<string>((resolve, reject) => {
      pending.current = { resolve, reject };
      timer.current = setTimeout(() => done(), 90000);
      window.turnstile!.execute(widget.current!);
    });
  }, [config.turnstileSiteKey]);
  return { challenge, element };
}
