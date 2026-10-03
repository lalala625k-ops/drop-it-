import type { ReverseResolution } from './recognizeCardImage';

type ManualSearch = NonNullable<ReverseResolution['manual_search']>;

const siteSearches: Record<string, [string, (query: string) => string]> = {
  xiaohongshu: ['小红书', (q) => `https://www.xiaohongshu.com/search_result?keyword=${q}`],
  douban: ['豆瓣', (q) => `https://www.douban.com/search?q=${q}`],
  douyin: ['抖音', (q) => `https://www.douyin.com/search/${q}`],
  github: ['GitHub', (q) => `https://github.com/search?q=${q}&type=repositories`],
  bilibili: ['B 站', (q) => `https://search.bilibili.com/all?keyword=${q}`],
  youtube: ['YouTube', (q) => `https://www.youtube.com/results?search_query=${q}`],
  sspai: ['少数派', (q) => `https://sspai.com/search?keyword=${q}`],
  wechat: ['微信文章', (q) => `https://weixin.sogou.com/weixin?type=2&query=${q}`],
  zhihu: ['知乎', (q) => `https://www.zhihu.com/search?type=content&q=${q}`],
  twitter: ['X', (q) => `https://x.com/search?q=${q}`],
  weibo: ['微博', (q) => `https://s.weibo.com/weibo?q=${q}`],
};

const domainPlatforms: Record<string, string> = {
  'xiaohongshu.com': 'xiaohongshu', 'douban.com': 'douban',
  'douyin.com': 'douyin', 'github.com': 'github',
  'bilibili.com': 'bilibili', 'youtube.com': 'youtube',
  'sspai.com': 'sspai', 'mp.weixin.qq.com': 'wechat',
  'zhihu.com': 'zhihu', 'x.com': 'twitter', 'twitter.com': 'twitter',
  'weibo.com': 'weibo',
};

export function manualSearchFallback(clues: ReverseResolution['clues'], ocrText: string): ManualSearch {
  const author = clues?.author?.trim() || '';
  const suggested = author
    ? (clues?.search_query || '').replace(new RegExp(author.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '').trim()
    : clues?.search_query?.trim() || '';
  const title = clues?.title?.trim().slice(0, 120) ||
    suggested.slice(0, 120) ||
    ocrText.split(/\r?\n/).map((line) => line.trim())
      .find((line) => line.length >= 4 && line.toLocaleLowerCase() !== author.toLocaleLowerCase())?.slice(0, 80) || '';
  const query = title;
  const domain = (clues?.site_domain || '').trim().toLowerCase().replace(/^www\./, '');
  const platform = clues?.platform && siteSearches[clues.platform] ? clues.platform : domainPlatforms[domain];
  const encoded = encodeURIComponent(query);
  if (platform && siteSearches[platform]) {
    const [name, makeUrl] = siteSearches[platform];
    return { url: makeUrl(encoded), query, platform: name, kind: 'site' };
  }
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}$/.test(domain)) {
    return { url: `https://www.bing.com/search?q=${encodeURIComponent(`site:${domain} ${query}`)}`,
      query, platform: domain, kind: 'domain' };
  }
  return { url: `https://www.bing.com/search?q=${encoded}`, query, platform: '网页', kind: 'web' };
}
