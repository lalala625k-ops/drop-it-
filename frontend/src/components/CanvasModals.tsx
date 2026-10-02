import React from 'react';
import { Card, Group, Viewport } from '../types';
import { PieDateMenu } from './PieDateMenu';
import { SearchModal } from './SearchModal';
import { MinimapNav } from './MinimapNav';
import { ActivePieMenuState } from '../hooks/usePieMenuState';

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
  onDissolveParent: (parentId: string) => void;
  onDetachCardFromBundle: (cardId: string) => void;
  onDisconnectCardParent: (cardId: string) => void;
  onDisconnectGroupParent: (bundleId: string, parentId: string) => void;
  onClosePieMenu: () => void;
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
  onDissolveParent,
  onDetachCardFromBundle,
  onDisconnectCardParent,
  onDisconnectGroupParent,
  onClosePieMenu,
  isSearchOpen,
  onCloseSearch,
  onSelectSearchCard,
  isMinimapExpanded,
}) => {
  return (
    <>
      {activePieMenu && (
        <PieDateMenu
          card={activePieMenu.groupId
            ? { ...activePieMenu.card, title: groups.find((g) => g.id === activePieMenu.groupId)?.title || activePieMenu.card.title,
                headerTitle: groups.find((g) => g.id === activePieMenu.groupId)?.title || activePieMenu.card.headerTitle,
                reminder: groups.find((g) => g.id === activePieMenu.groupId)?.reminder,
                tags: groups.find((g) => g.id === activePieMenu.groupId)?.tags || [] }
            : cards.find((c) => c.id === activePieMenu.card.id) || activePieMenu.card}
          groupKind={activePieMenu.groupId
            ? groups.find((group) => group.id === activePieMenu.groupId)?.kind === 'bundle' ? 'bundle' : 'parent'
            : undefined}
          allCards={cards}
          centerPosition={activePieMenu.center}
          currentPointerPosition={activePieMenu.pointer}
          isRightMouseDown={activePieMenu.isRightMouseDown}
          onConfirmDate={(dateStr) => onConfirmPieDate(activePieMenu.card.id, dateStr)}
          onConfirmTitle={(title) => onConfirmPieTitle(activePieMenu.card.id, title)}
          onToggleTag={(tag) => onTogglePieTag(activePieMenu.card.id, tag)}
          groupColor={activePieMenu.groupId ? groups.find((g) => g.id === activePieMenu.groupId)?.color : undefined}
          onGroupColor={(color) => { if (activePieMenu.groupId) onGroupColor(activePieMenu.groupId, color); }}
          onReparseLink={() => onReparseLink(activePieMenu.card.id)}
          onRecognizeImage={(mode) => onRecognizeImage(activePieMenu.card.id, mode)}
          onUngroup={() => {
            if (activePieMenu.groupId) {
              const group = groups.find((item) => item.id === activePieMenu.groupId);
              if (group?.kind === 'bundle') onUngroupBundle(group.id);
              else if (group) onDissolveParent(group.id);
            }
            onClosePieMenu();
          }}
          onDetachFromBundle={() => { onDetachCardFromBundle(activePieMenu.card.id); onClosePieMenu(); }}
          onDisconnectCardParent={() => { onDisconnectCardParent(activePieMenu.card.id); onClosePieMenu(); }}
          groupConnections={activePieMenu.groupId ? [...new Set(cards.filter((card) => card.bundleId === activePieMenu.groupId && card.groupId).map((card) => card.groupId!))]
            .map((id) => ({ id, title: groups.find((group) => group.id === id)?.title || '' })) : undefined}
          onDisconnectGroupParent={(parentId) => { if (activePieMenu.groupId) onDisconnectGroupParent(activePieMenu.groupId, parentId); onClosePieMenu(); }}
          onClose={onClosePieMenu}
        />
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
