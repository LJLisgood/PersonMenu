import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useCloud } from './Cloud';

type Visit = { id: string; at: number };
type Saved = { favorites: string[]; recent: Visit[] };
const key = 'zaotai-personal:v1';
function readSaved(storageKey = key): Saved {
  const raw: unknown = JSON.parse(localStorage.getItem(storageKey) || '{}');
  const value = raw && typeof raw === 'object' ? (raw as Partial<Saved>) : {};
  return {
    favorites: Array.isArray(value.favorites)
      ? [...new Set(value.favorites.filter((id): id is string => typeof id === 'string'))]
      : [],
    recent: Array.isArray(value.recent)
      ? value.recent
          .filter(
            (item): item is Visit =>
              !!item &&
              typeof item.id === 'string' &&
              typeof item.at === 'number' &&
              Number.isFinite(item.at),
          )
          .sort((a, b) => b.at - a.at)
          .filter((item, index, items) => items.findIndex((v) => v.id === item.id) === index)
          .slice(0, 40)
      : [],
  };
}
const PersonalContext = createContext<{
  saved: Saved;
  notice: string;
  temporary: boolean;
  syncing: boolean;
  toggle: (id: string, name: string) => void;
  visit: (id: string) => void;
  clearRecent: () => void;
  dismiss: () => void;
} | null>(null);
export function PersonalProvider({ children }: { children: ReactNode }) {
  const cloud = useCloud();
  const owner = cloud.session && !cloud.session.user.is_anonymous ? cloud.session.user.id : null;
  const storageKey = useRef(key);
  const currentOwner = useRef<string | null>(null);
  const writes = useRef(Promise.resolve());
  const [syncing, setSyncing] = useState(false);
  const [initial] = useState(() => {
    try {
      return { saved: readSaved(), temporary: false };
    } catch {
      return { saved: { favorites: [], recent: [] } as Saved, temporary: true };
    }
  });
  const [saved, setSaved] = useState(initial.saved);
  const current = useRef(saved);
  const [temporary, setTemporary] = useState(initial.temporary);
  const [notice, setNotice] = useState('');
  const change = useCallback((update: (s: Saved) => Saved) => {
    const next = update(current.current);
    current.current = next;
    setSaved(next);
    try {
      localStorage.setItem(storageKey.current, JSON.stringify(next));
      setTemporary(false);
    } catch {
      setTemporary(true);
    }
  }, []);
  useEffect(() => {
    if (!cloud.ready) return;
    let active = true;
    storageKey.current = owner ? `${key}:${owner}` : key;
    currentOwner.current = owner;
    try {
      const next = readSaved(storageKey.current);
      current.current = next;
      setSaved(next);
    } catch {
      current.current = { favorites: [], recent: [] };
      setSaved(current.current);
    }
    setSyncing(!!owner);
    if (owner)
      void cloud
        .api<{ recipe_id: string }[]>('favorites')
        .then((rows) => {
          if (active) change((s) => ({ ...s, favorites: rows.map((r) => r.recipe_id) }));
        })
        .catch(() => {
          if (active) setNotice('云端收藏暂时无法读取，当前显示此账号的本机缓存。');
        })
        .finally(() => {
          if (active) setSyncing(false);
        });
    return () => {
      active = false;
    };
  }, [owner, cloud.ready, cloud.api, change]);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== storageKey.current && event.key !== null) return;
      try {
        const next = readSaved(storageKey.current);
        current.current = next;
        setSaved(next);
      } catch {
        setTemporary(true);
      }
    };
    window.addEventListener('storage', sync);
    return () => window.removeEventListener('storage', sync);
  }, []);
  const visit = useCallback(
    (id: string) =>
      change((s) => ({
        ...s,
        recent: [{ id, at: Date.now() }, ...s.recent.filter((item) => item.id !== id)].slice(0, 40),
      })),
    [change],
  );
  return (
    <PersonalContext.Provider
      value={{
        saved,
        temporary,
        syncing,
        notice,
        visit,
        toggle: (id, name) => {
          if (syncing) return;
          const exists = current.current.favorites.includes(id);
          change((s) => ({
            ...s,
            favorites: exists ? s.favorites.filter((v) => v !== id) : [...s.favorites, id],
          }));
          setNotice(`${exists ? '已取消收藏' : '已收藏'}：${name}`);
          if (owner) {
            const writingOwner = owner;
            writes.current = writes.current.then(async () => {
              try {
                if (currentOwner.current !== writingOwner) return;
                await cloud.api(`favorites/${encodeURIComponent(id)}`, {
                  method: exists ? 'DELETE' : 'PUT',
                });
                if (currentOwner.current === writingOwner)
                  setNotice(`${exists ? '已取消收藏' : '已收藏'}：${name}（已同步账号）`);
              } catch {
                if (currentOwner.current === writingOwner) {
                  change((s) => ({
                    ...s,
                    favorites: exists
                      ? [...new Set([...s.favorites, id])]
                      : s.favorites.filter((v) => v !== id),
                  }));
                  setNotice('云端收藏未更新，请稍后重试。');
                }
              }
            });
          }
        },
        clearRecent: () => {
          change((s) => ({ ...s, recent: [] }));
          setNotice('已清空最近浏览');
        },
        dismiss: () => setNotice(''),
      }}
    >
      {children}
    </PersonalContext.Provider>
  );
}
export function usePersonal() {
  const context = useContext(PersonalContext);
  if (!context) throw new Error('PersonalProvider is required');
  return context;
}
