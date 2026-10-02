import React from 'react';
import { Card } from '../../types';

interface CardHeaderBadgesProps {
  card: Card;
}

export const CardHeaderBadges: React.FC<CardHeaderBadgesProps> = ({
  card,
}) => {
  return (
    <div className="absolute top-2 right-2 flex items-center gap-1.5 z-20 pointer-events-auto">
      {card.reminder && (
        <div
          title={`提醒时间: ${card.reminder}`}
          className="px-2 py-0.5 bg-stone border border-ash text-ink text-[11px] font-bold uppercase tracking-[0.05em] flex items-center gap-1 rounded-[10px] pointer-events-none select-none"
        >
          <svg className="w-2.5 h-2.5 text-ink" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <span>{card.reminder.slice(5)}</span>
        </div>
      )}

    </div>
  );
};
