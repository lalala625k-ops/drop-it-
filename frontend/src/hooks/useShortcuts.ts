import { useEffect, useRef } from 'react';
import { ShortcutSettings, matchShortcut } from './useSettings';

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
  onSaveDrop: (saveAs?: boolean) => void;
  onPaste: (e: ClipboardEvent) => void;
  onCopy?: () => void;
  onCut?: () => void;
  hasCanvasMultiSelection?: boolean;
  onDuplicate?: () => void;
  onSearch?: () => void;
  onMinimapOpen?: () => void;
  onMinimapClose?: () => void;
  onEditTitle?: () => void;
  onClearTitle?: () => void;
  onSetTime?: () => void;
  onSetNow?: () => void;
  onManageTags?: () => void;
  onDisconnectParent?: () => void;
  onDetachFromBundle?: () => void;
  onUniformWidth?: () => void;
  onReparseLink?: () => void;
  onRecognizeImageOCR?: () => void;
  onRecognizeImageLink?: () => void;
  onFitCanvas?: () => void;
  onJumpToPin?: (index: number) => boolean;
  shortcutsConfig?: ShortcutSettings;
  onOpenSettings?: () => void;
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
  onSaveDrop,
  onPaste,
  onCopy,
  onCut,
  hasCanvasMultiSelection,
  onDuplicate,
  onSearch,
  onMinimapOpen,
  onMinimapClose,
  onEditTitle,
  onClearTitle,
  onSetTime,
  onSetNow,
  onManageTags,
  onDisconnectParent,
  onDetachFromBundle,
  onUniformWidth,
  onReparseLink,
  onRecognizeImageOCR,
  onRecognizeImageLink,
  onFitCanvas,
  onJumpToPin,
  shortcutsConfig,
  onOpenSettings,
}: UseShortcutsProps) {
  const isShiftPressedRef = useRef(false);
  const isSpacePressedRef = useRef(false);
  const isAltPressedRef = useRef(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Settings and other modal surfaces own their keyboard interactions.
      // Never let a canvas shortcut fire while a settings modal is open.
      if (document.querySelector('[data-modal="settings"]')) return;
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isInputFocused = activeTag === 'input' || activeTag === 'textarea' || (document.activeElement as HTMLElement)?.isContentEditable;

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

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      // Saving also works while editing text; never invoke the browser's
      // Save Page command. Settings retain ownership of their shortcuts.
      if (isCtrlOrMeta && !e.altKey && (e.code === 'KeyS' || e.key.toLowerCase() === 's')) {
        e.preventDefault();
        if (!e.repeat) onSaveDrop(e.shiftKey);
        return;
      }
      const canvasEditorFocused = !!(document.activeElement as HTMLElement | null)?.closest?.('[data-card-id]');
      const clipboardSelectedObjects = hasCanvasMultiSelection && canvasEditorFocused && isCtrlOrMeta &&
        !e.shiftKey && !e.altKey && ['c', 'x'].includes(e.key.toLowerCase());
      if (isInputFocused && !clipboardSelectedObjects) return;

      // F5: Hot reload current window. Ctrl+R is reserved for restoring the
      // selected card or Group to its default size.
      if (e.key === 'F5') {
        e.preventDefault();
        window.location.reload();
        return;
      }

      // Shift + 1: Fit Canvas
      if (e.shiftKey && !isCtrlOrMeta && !e.altKey && e.key === '!') {
        e.preventDefault();
        onFitCanvas?.();
        return;
      }

      // Ctrl + 1 ~ 8: Jump only to an existing pin. Missing pins are a no-op.
      if (isCtrlOrMeta && !e.shiftKey && !e.altKey && ['1', '2', '3', '4', '5', '6', '7', '8'].includes(e.key)) {
        e.preventDefault();
        onJumpToPin?.(parseInt(e.key, 10));
        return;
      }

      // H Family: Title & Heading
      if (isCtrlOrMeta && !e.altKey && (e.key === 'h' || e.key === 'H')) {
        e.preventDefault();
        if (e.shiftKey) onClearTitle?.();
        else onEditTitle?.();
        return;
      }

      // L Family: Label / Tags
      if (isCtrlOrMeta && !e.shiftKey && !e.altKey && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault();
        onManageTags?.();
        return;
      }

      // Open Settings: Ctrl+, or customized
      if (shortcutsConfig?.openSettings ? matchShortcut(e, shortcutsConfig.openSettings) : (isCtrlOrMeta && (e.key === ',' || e.code === 'Comma'))) {
        e.preventDefault();
        onOpenSettings?.();
        return;
      }

      // New Card: Ctrl+N or customized
      if (shortcutsConfig?.newCard ? matchShortcut(e, shortcutsConfig.newCard) : (isCtrlOrMeta && !e.shiftKey && !e.altKey && (e.key === 'n' || e.key === 'N'))) {
        e.preventDefault();
        onNewCard();
        return;
      }

      // Search: Ctrl+K / Ctrl+F or customized
      if (shortcutsConfig?.search ? matchShortcut(e, shortcutsConfig.search) : (isCtrlOrMeta && !e.shiftKey && !e.altKey && (e.key === 'f' || e.key === 'F' || e.key === 'k' || e.key === 'K'))) {
        e.preventDefault();
        onSearch?.();
        return;
      }

      // Auto Pack: Ctrl+P / Ctrl+B or customized
      if (shortcutsConfig?.autoPack ? matchShortcut(e, shortcutsConfig.autoPack) : (isCtrlOrMeta && !e.shiftKey && !e.altKey && (e.key === 'b' || e.key === 'B'))) {
        e.preventDefault();
        onAutoPack();
        return;
      }

      // New Origin: Ctrl+J or customized
      if (shortcutsConfig?.newParent ? matchShortcut(e, shortcutsConfig.newParent) : (isCtrlOrMeta && !e.shiftKey && !e.altKey && (e.key === 'j' || e.key === 'J'))) {
        e.preventDefault();
        onGroup();
        return;
      }

      // Reset Size: Ctrl+O or customized
      if (shortcutsConfig?.resetSize ? matchShortcut(e, shortcutsConfig.resetSize) : (isCtrlOrMeta && !e.shiftKey && !e.altKey && (e.key === 'o' || e.key === 'O'))) {
        e.preventDefault();
        onResetSize();
        return;
      }

      // R Family: Reset size (Ctrl+R) & Resize uniform width (Ctrl+Shift+R)
      if (isCtrlOrMeta && !e.altKey && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault();
        if (e.shiftKey) onUniformWidth?.();
        else onResetSize();
        return;
      }

      // Ctrl+P compatibility: New origin / associate; Ctrl+Shift+P disconnects the upstream node.
      if (isCtrlOrMeta && !e.altKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (e.shiftKey) onDisconnectParent?.();
        else onGroup();
        return;
      }

      // G Family: Group (Ctrl+G), Ungroup (Ctrl+Shift+G), Detach card from group (Ctrl+Alt+G)
      if (shortcutsConfig?.bundle && matchShortcut(e, shortcutsConfig.bundle)) {
        e.preventDefault();
        onBundle();
        return;
      }
      if (isCtrlOrMeta && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (e.altKey) {
          onDetachFromBundle?.();
        } else if (e.shiftKey) {
          onUngroup();
        } else {
          if (!shortcutsConfig?.bundle) onBundle();
        }
        return;
      }

      // U Family: URL Reparse (Ctrl+U)
      if (isCtrlOrMeta && !e.shiftKey && !e.altKey && (e.key === 'u' || e.key === 'U')) {
        e.preventDefault();
        onReparseLink?.();
        return;
      }

      // I Family: Image OCR (Ctrl+I) & Image Source Resolution (Ctrl+Shift+I)
      if (isCtrlOrMeta && !e.altKey && (e.key === 'i' || e.key === 'I')) {
        e.preventDefault();
        if (e.shiftKey) onRecognizeImageLink?.();
        else onRecognizeImageOCR?.();
        return;
      }

      // Ctrl + C (Copy selected canvas objects and their relationships)
      if (isCtrlOrMeta && !e.shiftKey && !e.altKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        if (!e.repeat) onCopy?.();
        return;
      }

      // Ctrl + X (Cut selected canvas objects, preserving native text editing)
      if (isCtrlOrMeta && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'x') {
        e.preventDefault();
        if (!e.repeat) onCut?.();
        return;
      }

      // Ctrl + D (Duplicate selected cards directly)
      if (isCtrlOrMeta && !e.shiftKey && !e.altKey && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        onDuplicate?.();
        return;
      }

      // Ctrl + Z (Undo)
      if (isCtrlOrMeta && !e.shiftKey && !e.altKey && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        onUndo();
        return;
      }

      // Delete or Backspace
      if ((e.key === 'Delete' || e.key === 'Backspace') && !isCtrlOrMeta && !e.altKey) {
        e.preventDefault();
        onDelete();
        return;
      }

      // Align selected cards, including members of selected card Groups.
      if ((e.altKey || isCtrlOrMeta) && !e.shiftKey && ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault();
        if (e.key === 'ArrowUp') onAlign('top');
        if (e.key === 'ArrowDown') onAlign('bottom');
        if (e.key === 'ArrowLeft') onAlign('left');
        if (e.key === 'ArrowRight') onAlign('right');
        return;
      }

    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (document.querySelector('[data-modal="settings"]')) return;
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
  }, [
    onNewCard, onDelete, onUndo, onGroup, onBundle, onUngroup, onResetSize,
    onAutoPack, onAlign, onSaveDrop, onPaste, onCopy, onCut, hasCanvasMultiSelection, onDuplicate, onSearch,
    onMinimapOpen, onMinimapClose, onEditTitle, onClearTitle, onSetTime, onSetNow,
    onManageTags, onDisconnectParent, onDetachFromBundle, onUniformWidth,
    onReparseLink, onRecognizeImageOCR, onRecognizeImageLink, onFitCanvas,
    onJumpToPin, shortcutsConfig, onOpenSettings,
  ]);

  return { isShiftPressedRef, isSpacePressedRef, isAltPressedRef };
}
