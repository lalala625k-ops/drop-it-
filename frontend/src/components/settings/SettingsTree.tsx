import React from 'react';
import { AppSettings, ShortcutSettings } from '../../hooks/useSettings';
import { SettingsLayout, tree } from './settingsTreeLayout';
import { SettingsNode as Node } from './SettingsNode';
import { shortcutCategories, ShortcutCategoryId, shortcutLabel } from './shortcutCatalog';
import { generalCategories, GeneralCategoryId } from './generalCatalog';
import { GeneralControls } from './GeneralControls';
import { GeneralController } from './useGeneralSettings';

interface SettingsTreeProps {
  layout: SettingsLayout;
  activeCategory: ShortcutCategoryId | null;
  onCategory: (category: ShortcutCategoryId) => void;
  settings: AppSettings;
  recordingKey: keyof ShortcutSettings | null;
  onRecord: (key: keyof ShortcutSettings) => void;
  onResetShortcuts: () => void;
  onUpdateGeneral: (updates: Partial<AppSettings['general']>) => void;
  activeGeneral: GeneralCategoryId | null;
  onGeneralCategory: (category: GeneralCategoryId) => void;
  generalController: GeneralController;
  showToast: (message: string) => void;
}

export function SettingsTree(props: SettingsTreeProps) {
  const { settings, layout } = props;
  return <>
    <svg className="absolute overflow-visible pointer-events-none" width="1" height="1" aria-hidden="true">
      {layout.links.map(({ path }, i) => <path key={i} d={path} fill="none" stroke="#a8a7a2" strokeWidth="1" />)}
    </svg>
    <Node node={tree.root} title="Settings">设置</Node>
    <Node node={tree.shortcuts} title="Shortcuts">快捷键</Node>
    <Node node={tree.general} title="General Settings">通用设置</Node>
    {generalCategories.map((category, i) => <Node key={category.id} node={tree.generalCategories[i]}
      id={`general-${category.id}`} expanded={props.activeGeneral === category.id} active={props.activeGeneral === category.id}
      title={category.english} onClick={() => props.onGeneralCategory(category.id)}>{category.label}</Node>)}
    {shortcutCategories.map((category, i) => <Node key={category.id} node={tree.categories[i]}
      id={`category-${category.id}`} expanded={props.activeCategory === category.id}
      active={props.activeCategory === category.id} title={`${category.english} · ${category.items.length} 项`}
      onClick={() => props.onCategory(category.id)}>{category.label}</Node>)}
    {layout.rows.map(({ item, title, keys }) => <React.Fragment key={item.id}>
      <Node node={title} id={`action-${item.id}`} title={[item.english, item.note].filter(Boolean).join(' · ')}>{item.label}</Node>
      <Node node={keys} id={`shortcut-${item.id}`}
        onClick={item.key ? () => props.onRecord(item.key!) : undefined}
        active={!!item.key && props.recordingKey === item.key}
        locked={!item.key} hint={item.key ? '点击调整' : undefined}
        title={item.key ? undefined : `固定操作${item.note ? ` · ${item.note}` : ''}`}>
        <span className="font-mono whitespace-pre-line break-words">
          {item.key && props.recordingKey === item.key ? '按下快捷键' : shortcutLabel(item, settings.shortcuts)}
        </span>
      </Node>
    </React.Fragment>)}
    <Node node={tree.reset} title="Reset Defaults" onClick={props.onResetShortcuts}>恢复默认</Node>
    {layout.generalRows.map(({ item, title, control }) => <React.Fragment key={item.id}>
      <Node node={title} title={item.english} id={`setting-${item.id}`}>{item.label}</Node>
      <Node node={control} id={`control-${item.id}`}><GeneralControls id={item.id} controller={props.generalController}
        canvas={settings.general} onCanvas={props.onUpdateGeneral} toast={props.showToast} /></Node>
    </React.Fragment>)}
    {layout.generalReset && props.activeGeneral && <Node node={layout.generalReset} title="Reset Defaults"
      onClick={() => void props.generalController.reset(props.activeGeneral!)}>恢复默认</Node>}
  </>;
}
