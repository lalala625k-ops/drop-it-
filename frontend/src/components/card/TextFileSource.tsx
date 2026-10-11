import React from 'react';
import type { FileSource } from '../../types';
import { LocalFileIcon } from '../LocalFileIcon';

export const TextFileSource = ({ source, onClick, selected }: {
  source: FileSource; onClick: (event: React.MouseEvent) => void; selected: boolean;
}) => <div className="shrink-0 px-3.5 py-2 border-t border-ink/20" data-file-source>
  <div className="flex items-center gap-2 text-[15px] leading-[1.4]"><LocalFileIcon /><span className="truncate">{source.name}</span></div>
  <button type="button" title={source.path} onClick={onClick} data-source-open
    className={`block max-w-full truncate mt-1 text-[11px] font-mono text-left ${selected ? 'text-ink/80 hover:underline' : 'text-ink/40'}`}>
    ↗ {source.path}
  </button>
</div>;
