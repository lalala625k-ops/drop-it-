import React from 'react';

export const LocalFileIcon = ({ className = 'w-4 h-4 shrink-0' }: { className?: string }) =>
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-label="本地文件">
    <path d="M14 3H5v18h14V8l-5-5Z" /><path d="M14 3v5h5M8 12h8M8 16h6" />
  </svg>;
