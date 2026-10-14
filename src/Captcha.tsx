import { useCallback, useEffect, useRef, useState } from 'react';
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
  if (window.turnstile) return Promise.resolve();
  return (script ??= new Promise<void>((resolve, reject) => {
    const element = document.createElement('script');
    const fail = (message: string) => {
      clearTimeout(timeout);
      element.onload = element.onerror = null;
      element.remove();
      script = null;
      reject(new Error(message));
    };
    const timeout = setTimeout(() => fail('人机验证加载超时，请检查网络后重新提交。'), 15000);
    element.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    element.async = true;
    element.onload = () => {
      if (!window.turnstile) {
        fail('人机验证加载失败，请检查网络后重新提交。');
        return;
      }
      clearTimeout(timeout);
      element.onload = element.onerror = null;
      resolve();
    };
    element.onerror = () => fail('人机验证加载失败，请检查网络后重新提交。');
    document.head.appendChild(element);
  }));
}
export function useCaptcha() {
  const { config } = useCloud();
  const [status, setStatus] = useState<'idle' | 'loading' | 'verifying'>('idle');
  const element = useRef<HTMLDivElement>(null),
    widget = useRef<string | null>(null);
  const pending = useRef<{
    reject: (error: Error) => void;
    cancel: () => void;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const removeWidget = useCallback(() => {
    const id = widget.current;
    widget.current = null;
    if (id !== null) window.turnstile?.remove(id);
  }, []);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const task = pending.current;
      pending.current = null;
      task?.reject(new Error('验证已取消'));
      removeWidget();
    },
    [removeWidget],
  );
  const challenge = useCallback(() => {
    if (!config.turnstileSiteKey) return Promise.resolve('');
    if (pending.current) return Promise.reject(new Error('请先完成人机验证'));
    return new Promise<string>((resolve, reject) => {
      const finish = (error?: Error, token?: string) => {
        // An old widget can still deliver callbacks after cancellation or replacement.
        if (pending.current !== task) return;
        clearTimeout(timer.current);
        pending.current = null;
        setStatus('idle');
        if (error) reject(error);
        else if (token) resolve(token);
        else reject(new Error('人机验证未完成，请重新提交。'));
      };
      const task = {
        reject,
        cancel: () => {
          finish(new Error('人机验证已取消，可以重新提交。'));
          removeWidget();
        },
      };
      pending.current = task;
      setStatus('loading');
      timer.current = setTimeout(() => {
        finish(new Error('人机验证超时，请重新提交；如持续失败，请检查网络或浏览器扩展。'));
        removeWidget();
      }, 90000);
      void (async () => {
        try {
          await load();
          if (pending.current !== task) return;
          removeWidget();
          if (!element.current || !window.turnstile) throw new Error('无法打开人机验证');
          setStatus('verifying');
          widget.current = window.turnstile.render(element.current, {
            sitekey: config.turnstileSiteKey,
            action: 'kitchen',
            execution: 'execute',
            appearance: 'always',
            retry: 'never',
            'refresh-expired': 'never',
            'refresh-timeout': 'never',
            callback: (token: string) => finish(undefined, token),
            'error-callback': (code: string) => {
              const safeCode = /^\d{3,6}$/.test(code) ? `（错误码 ${code}）` : '';
              finish(
                new Error(
                  `人机验证失败${safeCode}，请重新提交；如持续失败，请检查网络、VPN 或浏览器扩展。`,
                ),
              );
            },
            'expired-callback': () => finish(new Error('人机验证已过期，请重新提交。')),
            'timeout-callback': () => finish(new Error('人机验证超时，请重新提交。')),
            'unsupported-callback': () =>
              finish(new Error('当前浏览器不支持人机验证，请更新或更换浏览器。')),
          });
          if (pending.current === task) window.turnstile.execute(widget.current);
        } catch (error) {
          finish(error instanceof Error ? error : new Error('无法打开人机验证'));
        }
      })();
    });
  }, [config.turnstileSiteKey, removeWidget]);
  const cancel = useCallback(() => pending.current?.cancel(), []);
  return { challenge, element, status, cancel };
}
