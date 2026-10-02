import { useEffect, useRef } from 'react';

interface UseShortcutsProps {
  onNewCard: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onGroup: () => void;
  onBundle: () => void;
  onUngroup: () => void;
  onResetSize: () => void;
  onAutoPack: () => void;
  onAlign: (direction: 'top' | 'bottom' | 'left' | 'right') => void;
  onExportBackup: () => void;
  onPaste: (e: ClipboardEvent) => void;
  onCopy?: () => void;
  onDuplicate?: () => void;
  onSearch?: () => void;
  onMinimapOpen?: () => void;
  onMinimapClose?: () => void;
}

export function useShortcuts({
  onNewCard,
  onDelete,
  onUndo,
  onGroup,
  onBundle,
  onUngroup,
  onResetSize,
  onAutoPack,
  onAlign,
  onExportBackup,
  onPaste,
  onCopy,
  onDuplicate,
  onSearch,
  onMinimapOpen,
  onMinimapClose,
}: UseShortcutsProps) {
  const isShiftPressedRef = useRef(false);
  const isSpacePressedRef = useRef(false);
  const isAltPressedRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputFocused = activeTag === 'input' || activeTag === 'textarea';

      if (e.key === 'Shift') isShiftPressedRef.current = true;
      if (e.key === ' ' || e.code === 'Space') isSpacePressedRef.current = true;
      if (e.key === 'Alt') isAltPressedRef.current = true;

      // Hold M to open Minimap Navigation at cursor
      if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (!isInputFocused && !e.repeat) {
          onMinimapOpen?.();
          return;
        }
      }

      if (isInputFocused) return;

      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        onResetSize();
        return;
      }

      // PRD 1.3: Ctrl + N (New blank text card)
      if (e.ctrlKey && (e.key === 'n' || e.key === 'N')) {
        e.preventDefault();
        onNewCard();
        return;
      }

      // Ctrl + F or Ctrl + K (Search cards)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F' || e.key === 'k' || e.key === 'K')) {
        if (!isInputFocused && onSearch) {
          e.preventDefault();
          onSearch();
          return;
        }
      }

      // Ctrl + C (Copy selected canvas objects and their relationships)
      if (e.ctrlKey && !e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        if (!isInputFocused && onCopy) {
          e.preventDefault();
          onCopy();
          return;
        }
      }

      // Ctrl + D (Duplicate selected cards directly)
      if (e.ctrlKey && !e.shiftKey && (e.key === 'd' || e.key === 'D')) {
        if (!isInputFocused && onDuplicate) {
          e.preventDefault();
          onDuplicate();
          return;
        }
      }

      // PRD 1.3: Ctrl + Z (Undo)
      if (e.ctrlKey && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) {
        if (!isInputFocused) {
          e.preventDefault();
          onUndo();
          return;
        }
      }

      // PRD 1.3: Delete or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isInputFocused) {
        e.preventDefault();
        onDelete();
        return;
      }

      // Ctrl + J: Create Parent Object (at mouse cursor)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'j' || e.key === 'J')) {
        if (isInputFocused) return;
        e.preventDefault();
        onGroup();
        return;
      }

      // Ctrl+G creates a card Group; Ctrl+J keeps the circular parent action.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
        if (isInputFocused) return;
        e.preventDefault();
        if (e.shiftKey) onUngroup();
        else onBundle();
        return;
      }

      // PRD 1.5: Ctrl + P (Auto pack cards)
      if (e.ctrlKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        onAutoPack();
        return;
      }

      // Align selected cards, including members of selected card Groups.
      if (!isInputFocused && (e.altKey || e.ctrlKey) && !e.metaKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowUp') onAlign('top');
        if (e.key === 'ArrowDown') onAlign('bottom');
        if (e.key === 'ArrowLeft') onAlign('left');
        if (e.key === 'ArrowRight') onAlign('right');
        return;
      }

      // PRD 2.3: Backup export (Ctrl + E)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'e' || e.key === 'E')) {
        e.preventDefault();
        onExportBackup();
        return;
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') isShiftPressedRef.current = false;
      if (e.key === ' ' || e.code === 'Space') isSpacePressedRef.current = false;
      if (e.key === 'Alt') isAltPressedRef.current = false;

      // Release M to close Minimap Navigation
      if (e.key === 'm' || e.key === 'M') {
        onMinimapClose?.();
      }
    };

    const handleWindowBlur = () => {
      isShiftPressedRef.current = false;
      isSpacePressedRef.current = false;
      isAltPressedRef.current = false;
      onMinimapClose?.();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('paste', onPaste);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('paste', onPaste);
    };
  }, [onNewCard, onDelete, onUndo, onGroup, onBundle, onUngroup, onResetSize, onAutoPack, onAlign, onExportBackup, onPaste, onCopy, onDuplicate, onSearch, onMinimapOpen, onMinimapClose]);

  return { isShiftPressedRef, isSpacePressedRef, isAltPressedRef };
}
