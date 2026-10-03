import React from 'react';
import { Card, Group, Viewport } from '../types';
import { PieDateMenu, PieMenuTarget } from './PieDateMenu';
import { PieMenuFocusOverlay } from './PieMenuFocusOverlay';
import { SearchModal } from './SearchModal';
import { MinimapNav } from './MinimapNav';
import { ActivePieMenuState } from '../hooks/usePieMenuState';
import { getBundleParentIds } from '../utils/groupRelations';

interface CanvasModalsProps {
  cards: Card[];
  minimapCards: Card[];
  groups: Group[];
  viewport: Viewport;
  setViewport: (vp: Viewport | ((prev: Viewport) => Viewport)) => void;
  setSelectedCardIds: (ids: Set<string>) => void;
  // Pie Menu
  activePieMenu: ActivePieMenuState | null;
  onConfirmPieDate: (cardId: string, dateStr: string | null) => void;
  onConfirmPieTitle: (cardId: string, title: string | null) => void;
  onTogglePieTag: (cardId: string, tag: string) => void;
  onGroupColor: (groupId: string, color: string) => void;
  onReparseLink: (cardId: string) => void;
  onRecognizeImage: (cardId: string, mode: 'ocr' | 'link') => void;
  onUngroupBundle: (bundleId: string) => void;
  onResetObjectSize: (id: string) => void;
  onDissolveParent: (parentId: string) => void;
  onDetachCardFromBundle: (cardId: string) => void;
  onDisconnectCardParent: (cardId: string) => void;
  onDisconnectGroupParent: (bundleId: string, parentId: string) => void;
  onClosePieMenu: () => void;
  onUniformWidth?: () => void;
  // Search
  isSearchOpen: boolean;
  onCloseSearch: () => void;
  onSelectSearchCard: (card: Card) => void;
  // Minimap
  isMinimapExpanded: boolean;
}

export const CanvasModals: React.FC<CanvasModalsProps> = ({
  cards,
  minimapCards,
  groups,
  viewport,
  setViewport,
  activePieMenu,
  onConfirmPieDate,
  onConfirmPieTitle,
  onTogglePieTag,
  onGroupColor,
  onReparseLink,
  onRecognizeImage,
  onUngroupBundle,
  onResetObjectSize,
  onDissolveParent,
  onDetachCardFromBundle,
  onDisconnectCardParent,
  onDisconnectGroupParent,
  onClosePieMenu,
  onUniformWidth,
  isSearchOpen,
  onCloseSearch,
  onSelectSearchCard,
  isMinimapExpanded,
}) => {
  const menuSource = activePieMenu?.target;
  const menuTarget: PieMenuTarget | null = !menuSource ? null
    : menuSource.kind === 'card'
      ? { kind: 'card', card: cards.find((card) => card.id === menuSource.card.id)
        || menuSource.card }
      : { kind: menuSource.kind,
          group: groups.find((group) => group.id === menuSource.group.id)
            || menuSource.group };
  const menuId = menuTarget?.kind === 'card' ? menuTarget.card.id : menuTarget?.group.id;
  const bundleParentId = menuTarget?.kind === 'bundle'
    ? getBundleParentIds(cards, menuTarget.group)[0] : null;
  return (
    <>
      {activePieMenu && menuTarget && menuId && (
        <>
        <PieMenuFocusOverlay activePieMenu={activePieMenu} cards={cards} viewport={viewport} />
        <PieDateMenu
          target={menuTarget}
          parentId={bundleParentId}
          allCards={cards}
          selectedCardIds={activePieMenu.selectedCardIds}
          centerPosition={activePieMenu.center}
          currentPointerPosition={activePieMenu.pointer}
          isRightMouseDown={activePieMenu.isRightMouseDown}
          onConfirmDate={(dateStr) => onConfirmPieDate(menuId, dateStr)}
          onConfirmTitle={(title) => onConfirmPieTitle(menuId, title)}
          onToggleTag={(tag) => onTogglePieTag(menuId, tag)}
          onGroupColor={(color) => { if (menuTarget.kind === 'parent') onGroupColor(menuId, color); }}
          onReparseLink={() => onReparseLink(menuId)}
          onRecognizeImage={(mode) => onRecognizeImage(menuId, mode)}
          onUniformWidth={onUniformWidth}
          onUngroup={() => {
            if (menuTarget.kind === 'bundle') onUngroupBundle(menuId);
            else if (menuTarget.kind === 'parent') onDissolveParent(menuId);
            onClosePieMenu();
          }}
          onResetSize={() => { onResetObjectSize(menuId); onClosePieMenu(); }}
          onDetachFromBundle={() => { if (menuTarget.kind === 'card') onDetachCardFromBundle(menuId); onClosePieMenu(); }}
          onDisconnectParent={() => {
            if (menuTarget.kind === 'card') onDisconnectCardParent(menuId);
            else if (menuTarget.kind === 'bundle' && bundleParentId) onDisconnectGroupParent(menuId, bundleParentId);
            onClosePieMenu();
          }}
          onClose={onClosePieMenu}
        />
        </>
      )}

      <SearchModal
        isOpen={isSearchOpen}
        onClose={onCloseSearch}
        cards={cards}
        onSelectCard={onSelectSearchCard}
      />

      <MinimapNav
        expanded={false}
        cards={minimapCards}
        groups={groups}
        viewport={viewport}
        onNavigate={setViewport}
      />
      {isMinimapExpanded && <MinimapNav
        expanded
        cards={minimapCards}
        groups={groups}
        viewport={viewport}
        onNavigate={setViewport}
      />}

    </>
  );
};
