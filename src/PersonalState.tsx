import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

type Visit = { id: string; at: number };
type Saved = { favorites: string[]; recent: Visit[] };
const key = 'zaotai-personal:v1';
function readSaved(): Saved {
  const raw: unknown = JSON.parse(localStorage.getItem(key) || '{}');
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
  toggle: (id: string, name: string) => void;
  visit: (id: string) => void;
  clearRecent: () => void;
  dismiss: () => void;
} | null>(null);
export function PersonalProvider({ children }: { children: ReactNode }) {
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
      localStorage.setItem(key, JSON.stringify(next));
      setTemporary(false);
    } catch {
      setTemporary(true);
    }
  }, []);
  useEffect(() => {
    const sync = (event: StorageEvent) => {
      if (event.key !== key && event.key !== null) return;
      try {
        const next = readSaved();
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
        notice,
        visit,
        toggle: (id, name) => {
          const exists = current.current.favorites.includes(id);
          change((s) => ({
            ...s,
            favorites: exists ? s.favorites.filter((v) => v !== id) : [...s.favorites, id],
          }));
          setNotice(`${exists ? '已取消收藏' : '已收藏'}：${name}`);
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
