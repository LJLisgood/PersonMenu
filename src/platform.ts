export async function acquireWakeLock(provider: Partial<Pick<Navigator, 'wakeLock'>> = navigator) {
  if (!provider.wakeLock) {
    return {
      sentinel: null,
      message: '当前浏览器不支持屏幕常亮，可调整设备的自动锁屏设置。',
    };
  }
  try {
    return { sentinel: await provider.wakeLock.request('screen'), message: '屏幕常亮已开启' };
  } catch {
    return { sentinel: null, message: '暂时无法保持屏幕常亮，请检查设备节电设置。' };
  }
}
