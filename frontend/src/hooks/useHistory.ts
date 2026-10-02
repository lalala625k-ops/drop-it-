import { useRef, useCallback } from 'react';
import { Card, Group, HistoryState } from '../types';

export function useHistory() {
  const historyStackRef = useRef<HistoryState[]>([]);
  const isUndoActionRef = useRef(false);

  const pushHistory = useCallback((cards: Card[], groups: Group[]) => {
    if (isUndoActionRef.current) return;
    historyStackRef.current.push({
      cards: structuredClone(cards.map(({ isParsing: _isParsing, ...card }) => card)),
      groups: structuredClone(groups),
    });
    if (historyStackRef.current.length > 30) {
      historyStackRef.current.shift();
    }
  }, []);

  const undo = useCallback((): HistoryState | null => {
    if (historyStackRef.current.length === 0) return null;
    const previous = historyStackRef.current.pop();
    if (!previous) return null;

    isUndoActionRef.current = true;
    setTimeout(() => {
      isUndoActionRef.current = false;
    }, 50);

    return {
      ...previous,
      cards: previous.cards.map(({ isParsing: _isParsing, ...card }) => card),
    };
  }, []);

  return { pushHistory, undo };
}
