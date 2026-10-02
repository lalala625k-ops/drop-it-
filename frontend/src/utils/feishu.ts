export const FEISHU_LOGO_URLS = [
  'https://www.feishu.cn/favicon.ico',
  'https://sf3-scmcdn-cn.feishucdn.com/goofy/ee/suite/passport/favicon.ico',
];

export function isFeishuUrl(url?: string): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'feishu.cn' || host.endsWith('.feishu.cn')
      || host === 'larksuite.com' || host.endsWith('.larksuite.com');
  } catch {
    return false;
  }
}
