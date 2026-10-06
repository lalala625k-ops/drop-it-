import { useEffect, useState } from 'react';
import { matchShortcut, ShortcutSettings } from '../../hooks/useSettings';
import { shortcutItems } from './shortcutCatalog';

const modifierKeys = ['Control', 'Shift', 'Alt', 'Meta'];
function eventShortcut(e: KeyboardEvent) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  const key = e.code === 'Space' ? 'Space' : e.code === 'Comma' ? ',' : e.code === 'Period' ? '.'
    : /^(Key|Digit)/.test(e.code) ? e.code.replace(/^(Key|Digit)/, '') : e.key;
  return [...parts, key].join('+');
}

export function useShortcutRecording(isOpen: boolean, shortcuts: ShortcutSettings,
  onUpdate: (updates: Partial<ShortcutSettings>) => void, showToast: (message: string) => void) {
  const [recordingKey, setRecordingKey] = useState<keyof ShortcutSettings | null>(null);
  useEffect(() => { if (!isOpen) setRecordingKey(null); }, [isOpen]);
  useEffect(() => {
    if (!isOpen || !recordingKey) return;
    const record = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.key === 'Escape') { setRecordingKey(null); return; }
      if (e.repeat || e.isComposing || modifierKeys.includes(e.key)) return;
      const value = eventShortcut(e);
      const other = shortcutItems.find((item) => item.key !== recordingKey &&
        [item.key ? shortcuts[item.key] : '', ...(item.bindings || [])].some((binding) => matchShortcut(e, binding)));
      if (other) { showToast(`已用于“${other.label}”，请换一个快捷键`); return; }
      if (e.code === 'Space' || e.key === 'Tab' || e.key === '+' || !matchShortcut(e, value)) {
        showToast('该按键用于输入或画布手势，请换一个快捷键');
        return;
      }
      onUpdate({ [recordingKey]: value });
      setRecordingKey(null);
      showToast(`快捷键已更新：${value}`);
    };
    window.addEventListener('keydown', record, true);
    return () => window.removeEventListener('keydown', record, true);
  }, [isOpen, recordingKey, shortcuts, onUpdate, showToast]);
  return { recordingKey, setRecordingKey };
}
