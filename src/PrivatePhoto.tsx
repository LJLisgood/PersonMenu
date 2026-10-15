import { useEffect, useState } from 'react';
import { useCloud } from './Cloud';

export function PrivatePhoto({ url }: { url: string }) {
  const cloud = useCloud();
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    setSource('');
    setError('');
    if (!/^\/api\/media\/[a-zA-Z0-9_.-]+$/.test(url) || !cloud.client) return;
    const controller = new AbortController();
    let objectUrl = '';
    void (async () => {
      const session = (await cloud.client!.auth.getSession()).data.session;
      if (!session) throw new Error('请登录后查看照片');
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok) throw new Error('照片加载失败，请刷新后再试');
      const blob = await response.blob();
      if (controller.signal.aborted) return;
      objectUrl = URL.createObjectURL(blob);
      setSource(objectUrl);
    })().catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => {
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, cloud.client, cloud.session?.user.id]);
  return source ? (
    <img className="photo-upload-preview" src={source} alt="申请人提交的菜品照片" />
  ) : (
    <p role="status">{error || '正在读取照片…'}</p>
  );
}
