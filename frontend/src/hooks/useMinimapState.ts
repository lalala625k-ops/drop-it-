import { useState, useCallback } from 'react';

export function useMinimapState() {
  const [isMinimapExpanded, setIsMinimapExpanded] = useState(false);

  const handleMinimapOpen = useCallback(() => {
    setIsMinimapExpanded(true);
  }, []);

  const handleMinimapClose = useCallback(() => {
    setIsMinimapExpanded(false);
  }, []);

  return {
    isMinimapExpanded,
    handleMinimapOpen,
    handleMinimapClose,
  };
}
