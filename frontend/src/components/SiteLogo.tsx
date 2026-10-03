import React, { useEffect, useState } from 'react';
import { FeishuLogo } from './FeishuLogo';
import { isFeishuUrl } from '../utils/feishu';

interface SiteLogoProps {
  url?: string;
  favicon?: string;
  className?: string;
}

export const SiteLogo: React.FC<SiteLogoProps> = ({ url, favicon, className = 'w-5 h-5' }) => {
  const [sourceIndex, setSourceIndex] = useState(0);
  useEffect(() => setSourceIndex(0), [url, favicon]);

  if (isFeishuUrl(url)) return <FeishuLogo className={className} />;

  let hostname = '';
  try { hostname = new URL(url || '').hostname.toLowerCase(); } catch { /* Use generic site mark. */ }
  const siteName = hostname.replace(/^www\./, '') || '网站';

  if (hostname === 'medium.com' || hostname.endsWith('.medium.com')) {
    return <svg className={`${className} shrink-0 text-ink pointer-events-none`} viewBox="0 0 24 24"
      role="img" aria-label="Medium logo" fill="currentColor">
      <ellipse cx="7" cy="12" rx="6.5" ry="9" />
      <ellipse cx="18" cy="12" rx="3" ry="8.5" />
      <ellipse cx="23" cy="12" rx="1" ry="7" />
    </svg>;
  }

  const sources = [favicon?.trim() || ''];
  if (hostname) {
    const siteIcon = new URL('/favicon.ico', url).href;
    if (!sources.includes(siteIcon)) sources.push(siteIcon);
    if (!hostname.includes('localhost') && !hostname.endsWith('.local')) {
      sources.push(`https://www.google.com/s2/favicons?domain=${encodeURIComponent(hostname)}&sz=64`);
    }
  }
  const source = sources.filter(Boolean)[sourceIndex];
  if (source) {
    return <img src={source} alt={`${siteName} logo`} title={siteName}
      className={`${className} shrink-0 object-contain pointer-events-none`}
      referrerPolicy="no-referrer" onError={() => setSourceIndex((index) => index + 1)} />;
  }

  return <span className={`${className} shrink-0 inline-flex items-center justify-center bg-ink text-paper text-[11px] font-bold pointer-events-none`}
    title={siteName} aria-label={`${siteName} 网站标识`}>
    {siteName[0]?.toUpperCase() || 'W'}
  </span>;
};
