import React, { useState } from 'react';
import { FEISHU_LOGO_URLS } from '../utils/feishu';

export const FeishuLogo: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => {
  const [sourceIndex, setSourceIndex] = useState(0);

  if (sourceIndex >= FEISHU_LOGO_URLS.length) {
    return <span aria-label="飞书" className={`${className} flex shrink-0 items-center justify-center bg-[#3370ff] text-[10px] font-bold text-white`}>飞</span>;
  }
  return <img src={FEISHU_LOGO_URLS[sourceIndex]} alt="飞书" className={`${className} shrink-0 object-contain pointer-events-none`}
    referrerPolicy="no-referrer" onError={() => setSourceIndex((index) => index + 1)} />;
};
