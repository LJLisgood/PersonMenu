import { useEffect, useRef, useState } from 'react';
import { assetUrl } from './state';
import type { Filters, Manifest } from './types';
export function useSearch(manifest: Manifest | null, filters: Filters) {
  const worker = useRef<Worker | null>(null);
  const counter = useRef(0);
  const [ready, setReady] = useState(false);
  const [ids, setIds] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const requestKeys = useRef(new Map<number, string>());
  const [resultKey, setResultKey] = useState('');
  const [duration, setDuration] = useState(0);
  useEffect(() => {
    if (!manifest) return;
    const next = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' });
    const controller = new AbortController();
    worker.current = next;
    setReady(false);
    setError('');
    next.onmessage = ({ data }) => {
      if (data.type === 'ready') setReady(true);
      if (data.type === 'error') {
        setError(data.message);
        setBusy(false);
      }
      if (data.type === 'results' && data.requestId === counter.current) {
        setResultKey(requestKeys.current.get(data.requestId) || '');
        requestKeys.current.clear();
        setIds(data.ids);
        setDuration(data.duration);
        setBusy(false);
      }
    };
    next.onerror = () => {
      setError('搜索加载失败，请刷新页面重试。');
      setBusy(false);
    };
    fetch(assetUrl('data/search.json'), { signal: controller.signal })
      .then((r) => {
        if (!r.ok) throw new Error('搜索索引加载失败');
        return r.text();
      })
      .then((index) => next.postMessage({ type: 'init', index, recipes: manifest.recipes }))
      .catch((e) => {
        if (e.name !== 'AbortError') {
          setError(e.message);
          setBusy(false);
        }
      });
    return () => {
      controller.abort();
      next.terminate();
      worker.current = null;
    };
  }, [manifest]);
  useEffect(() => {
    if (!ready) return;
    const requestId = ++counter.current;
    setBusy(true);
    requestKeys.current.set(requestId, JSON.stringify(filters));
    worker.current?.postMessage({ type: 'search', filters, requestId });
  }, [ready, filters]);
  return { ids, error, busy, ready, duration, resultKey };
}
