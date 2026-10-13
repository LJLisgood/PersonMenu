import { expect, it } from 'vitest';
import { acquireWakeLock } from './platform';
it('keeps cooking available when wake lock is unsupported', async () => {
  const result = await acquireWakeLock({});
  expect(result.sentinel).toBeNull();
  expect(result.message).toContain('不支持');
});
it('handles a platform rejection without propagating an exception', async () => {
  const result = await acquireWakeLock({
    wakeLock: {
      request: async () => {
        throw new Error('Battery saver');
      },
    },
  });
  expect(result.sentinel).toBeNull();
  expect(result.message).toContain('节电');
});
