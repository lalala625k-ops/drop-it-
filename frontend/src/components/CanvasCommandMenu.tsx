import React from 'react';
import { RadialCommandMenu } from './RadialCommandMenu';
import { commonRadialItems, radialAction, radialBranch, RadialAction } from '../utils/radialMenuModel';
export type CanvasCommand = Exclude<RadialAction, 'title' | 'tag' | 'color'>;
interface Props {
  position: { x: number; y: number }; canCopy: boolean; canGroup: boolean; canUngroup: boolean;
  canDetach: boolean; canDisconnect: boolean; canUniformWidth: boolean; canResetSize: boolean;
  onCommand: (command: CanvasCommand) => void; onClose: () => void;
}
export const CanvasCommandMenu: React.FC<Props> = ({ position, canCopy, canGroup, canUngroup,
  canDetach, canDisconnect, canUniformWidth, canResetSize, onCommand, onClose }) => {
  const items = [radialAction('note'), radialAction('pin'), radialAction('parent'),
    radialAction('cut', { disabled: !canCopy }), radialAction('copy', { disabled: !canCopy }), radialAction('paste'),
    ...(canCopy ? [radialBranch('group-menu', { group: canGroup, ungroup: canUngroup,
      detach: canDetach, disconnect: canDisconnect })] : []),
    radialBranch('layout-menu', { 'reset-size': canResetSize, 'uniform-width': canUniformWidth }), ...commonRadialItems()];
  return <RadialCommandMenu position={position} items={items} onAction={(id) => onCommand(id as CanvasCommand)}
    onClose={onClose} backdrop attribute="canvas" />;
};
