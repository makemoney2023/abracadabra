import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";

interface CanvasElement {
  id: string;
  zIndex: number;
  groupId?: string;
}

interface CanvasContextMenuProps {
  canvasCtxMenu: { x: number; y: number } | null;
  canvasSelectedIds: string[];
  selectedElementId: string | null;
  canvasElements: CanvasElement[];
  VIDEO_Z_INDEX: number;
  onElementUpdate?: (id: string, updates: Partial<CanvasElement>) => void;
  onElementDelete?: (ids: string | string[]) => void;
  setCanvasCtxMenu: (menu: { x: number; y: number } | null) => void;
  setCanvasSelectedIds: (ids: string[]) => void;
  isVideoTarget?: boolean;
  onVideoBringToFront?: () => void;
  onVideoSendToBack?: () => void;
}

export function CanvasContextMenu({
  canvasCtxMenu,
  canvasSelectedIds,
  selectedElementId,
  canvasElements,
  VIDEO_Z_INDEX,
  onElementUpdate,
  onElementDelete,
  setCanvasCtxMenu,
  setCanvasSelectedIds,
  isVideoTarget = false,
  onVideoBringToFront,
  onVideoSendToBack,
}: CanvasContextMenuProps) {
  const t = useTranslations("elementsMenu");
  const t2 = useTranslations("editor");

  if (!canvasCtxMenu) return null;

  if (isVideoTarget) {
    return (
      <div
        data-canvas-ctx-menu
        className="fixed z-[9999] bg-popover dark:bg-black border border-border squircle-element-camera shadow-2xl py-1 min-w-45 overflow-hidden"
        style={{
          left: Math.min(canvasCtxMenu.x, window.innerWidth - 196),
          top: Math.min(canvasCtxMenu.y, window.innerHeight - 96),
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <button
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11.5px] text-popover-foreground/80 hover:bg-muted transition-colors text-left"
          onClick={() => {
            onVideoBringToFront?.();
            setCanvasCtxMenu(null);
          }}
        >
          <Icon icon="qlementine-icons:bring-to-front-16" className="size-3.5 shrink-0 opacity-70" />
          {t("actions.bringToFront")}
        </button>
        <button
          className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11.5px] text-popover-foreground/80 hover:bg-muted transition-colors text-left"
          onClick={() => {
            onVideoSendToBack?.();
            setCanvasCtxMenu(null);
          }}
        >
          <Icon icon="qlementine-icons:bring-to-back-16" className="size-3.5 shrink-0 opacity-70" />
          {t("actions.sendToBack")}
        </button>
      </div>
    );
  }

  const ids = canvasSelectedIds.length > 0 ? canvasSelectedIds : selectedElementId ? [selectedElementId] : [];
  const isMulti = ids.length > 1;
  const singleId = ids[0] ?? null;

  return (
    <div
      data-canvas-ctx-menu
      className="fixed z-[9999] bg-popover dark:bg-black border border-border squircle-element-camera shadow-2xl py-1 min-w-45 overflow-hidden"
      style={{
        left: Math.min(canvasCtxMenu.x, window.innerWidth - 196),
        top: Math.min(canvasCtxMenu.y, window.innerHeight - 160),
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      {!isMulti && singleId && (
        <>
          <button
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11.5px] text-popover-foreground/80 hover:bg-muted transition-colors text-left"
            onClick={() => {
              const maxZ = Math.max(...canvasElements.map((e) => e.zIndex), VIDEO_Z_INDEX);
              if (onElementUpdate) onElementUpdate(singleId, { zIndex: maxZ + 1 });
              setCanvasCtxMenu(null);
            }}
          >
            <Icon icon="qlementine-icons:bring-to-front-16" className="size-3.5 shrink-0 opacity-70" />
            {t("actions.bringToFront")}
          </button>

          <button
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11.5px] text-popover-foreground/80 hover:bg-muted transition-colors text-left"
            onClick={() => {
              const el = canvasElements.find((e) => e.id === singleId);
              if (!el || !onElementUpdate) return;
              if (el.zIndex >= VIDEO_Z_INDEX) {
                onElementUpdate(singleId, { zIndex: VIDEO_Z_INDEX - 1 });
              } else {
                const minZ = Math.min(...canvasElements.map((e) => e.zIndex));
                onElementUpdate(singleId, { zIndex: Math.max(1, minZ - 1) });
              }
              setCanvasCtxMenu(null);
            }}
          >
            <Icon icon="qlementine-icons:bring-to-back-16" className="size-3.5 shrink-0 opacity-70" />
            {t("actions.sendToBack")}
          </button>

          <div className="my-1 h-px bg-border" />
        </>
      )}

      {isMulti && (
        <>
          <button
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11.5px] text-popover-foreground/80 hover:bg-muted transition-colors text-left"
            onClick={() => {
              const newGroupId = crypto.randomUUID();
              ids.forEach((id) => {
                if (onElementUpdate) onElementUpdate(id, { groupId: newGroupId });
              });
              setCanvasCtxMenu(null);
            }}
          >
            <Icon icon="solar:layers-minimalistic-bold" className="size-3.5 shrink-0 opacity-70" />
            {t2("layerPanel.groupAction", { count: ids.length })}
          </button>

          <button
            className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11.5px] text-popover-foreground/80 hover:bg-muted transition-colors text-left"
            onClick={() => {
              const groupIds = new Set(
                ids.map((id) => canvasElements.find((e) => e.id === id)?.groupId).filter(Boolean)
              );
              canvasElements
                .filter((e) => e.groupId && groupIds.has(e.groupId))
                .forEach((e) => {
                  if (onElementUpdate) onElementUpdate(e.id, { groupId: undefined });
                });
              setCanvasCtxMenu(null);
            }}
          >
            <Icon icon="solar:layers-bold" className="size-3.5 shrink-0 opacity-70" />
            {t2("layerPanel.ungroupAction")}
          </button>

          <div className="my-1 h-px bg-border" />
        </>
      )}

      <button
        className="w-full flex items-center gap-2.5 px-3 py-1.5 text-[11.5px] text-destructive hover:bg-destructive/10 transition-colors text-left"
        onClick={() => {
          if (onElementDelete) onElementDelete(ids.length === 1 ? ids[0] : [...ids]);
          setCanvasSelectedIds([]);
          setCanvasCtxMenu(null);
        }}
      >
        <Icon icon="solar:trash-bin-trash-bold" className="size-3.5 shrink-0 opacity-70" />
        {isMulti ? t("actions.deleteMultiple", { count: ids.length }) : t("actions.delete")}
      </button>
    </div>
  );
}