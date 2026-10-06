import { useState, useCallback, useEffect } from 'react';

export interface ShortcutSettings {
  newCard: string;      // 默认 Ctrl+N
  search: string;       // 默认 Ctrl+K
  autoPack: string;     // 默认 Ctrl+P
  bundle: string;       // 默认 Ctrl+G
  newParent: string;    // 默认 Ctrl+J
  resetSize: string;    // 默认 Ctrl+R
  openSettings: string; // 默认 Ctrl+,
}

export interface GeneralSettings {
  invertWheelZoom: boolean; // 是否反转滚轮缩放方向 (默认 false: 上滚放大)
  minimapMode: 'always' | 'press_m'; // 小地图模式: 'always' 常驻左下角, 'press_m' 仅按M呼出
  showFps: boolean; // 是否在左上角显示实时帧率 (默认 false)
}

export interface AppSettings {
  shortcuts: ShortcutSettings;
  general: GeneralSettings;
}

export const DEFAULT_SHORTCUTS: ShortcutSettings = {
  newCard: 'Ctrl+N',
  search: 'Ctrl+K',
  autoPack: 'Ctrl+P',
  bundle: 'Ctrl+G',
  newParent: 'Ctrl+J',
  resetSize: 'Ctrl+R',
  openSettings: 'Ctrl+,',
};

export const DEFAULT_GENERAL: GeneralSettings = {
  invertWheelZoom: false,
  minimapMode: 'always',
  showFps: false,
};

export const DEFAULT_SETTINGS: AppSettings = {
  shortcuts: DEFAULT_SHORTCUTS,
  general: DEFAULT_GENERAL,
};

const STORAGE_KEY = 'pinboard_settings_v1';

export function matchShortcut(e: KeyboardEvent, shortcutStr: string): boolean {
  if (!shortcutStr) return false;
  const parts = shortcutStr.split('+').map((p) => p.trim().toLowerCase());
  const needCtrl = parts.includes('ctrl') || parts.includes('cmd') || parts.includes('meta');
  const needShift = parts.includes('shift');
  const needAlt = parts.includes('alt');
  const keyPart = parts.find((p) => !['ctrl', 'cmd', 'meta', 'shift', 'alt'].includes(p));
  if (!keyPart) return false;

  const isCtrlOrMeta = e.ctrlKey || e.metaKey;
  if (needCtrl !== isCtrlOrMeta) return false;
  if (needShift !== e.shiftKey) return false;
  if (needAlt !== e.altKey) return false;

  const currentKey = e.key.toLowerCase();
  if (currentKey === keyPart.toLowerCase()) return true;
  // Handle comma / other symbols
  if (keyPart === ',' && (e.key === ',' || e.code === 'Comma')) return true;
  return false;
}

function loadSavedSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        shortcuts: { ...DEFAULT_SHORTCUTS, ...(parsed.shortcuts || {}) },
        general: { ...DEFAULT_GENERAL, ...(parsed.general || {}) },
      };
    }
  } catch { /* ignore */ }
  return DEFAULT_SETTINGS;
}

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(loadSavedSettings);

  const saveSettings = useCallback((newSettings: AppSettings) => {
    setSettings(newSettings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    } catch { /* ignore */ }
  }, []);

  const updateShortcuts = useCallback((updates: Partial<ShortcutSettings>) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        shortcuts: { ...prev.shortcuts, ...updates },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const updateGeneral = useCallback((updates: Partial<GeneralSettings>) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        general: { ...prev.general, ...updates },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch { /* ignore */ }
      return next;
    });
  }, []);

  const resetShortcuts = useCallback(() => {
    updateShortcuts(DEFAULT_SHORTCUTS);
  }, [updateShortcuts]);

  const resetAllSettings = useCallback(() => {
    saveSettings(DEFAULT_SETTINGS);
  }, [saveSettings]);

  return {
    settings,
    updateShortcuts,
    updateGeneral,
    resetShortcuts,
    resetAllSettings,
  };
}
