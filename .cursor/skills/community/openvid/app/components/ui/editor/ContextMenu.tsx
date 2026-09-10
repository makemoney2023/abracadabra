import CtxMenuItem from "@/components/ui/CtxMenuItem";
import { ContextMenuProps } from "@/types/layers.types";
import { useRef, useState, useEffect } from "react";

export default function ContextMenu({
  x,
  y,
  selectedIds,
  canGroup,
  canUngroup,
  onBringToFront,
  onSendToBack,
  onDelete,
  onDeleteSelected,
  onGroup,
  onUngroup,
  onClose,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x, y });
  const isMulti = selectedIds.length > 1;

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const { width, height } = menu.getBoundingClientRect();
    setPos({
      x: Math.min(x, window.innerWidth - width - 8),
      y: Math.min(y, window.innerHeight - height - 8),
    });
  }, [x, y]);

  return (
    <div
      ref={menuRef}
      data-ctx-menu
      className="fixed z-9999 bg-popover dark:bg-black border border-border squircle-element-camera shadow-2xl py-1 min-w-43 overflow-hidden"
      style={{ left: pos.x, top: pos.y }}
    >
      {!isMulti && (
        <>
          <CtxMenuItem
            icon="qlementine-icons:bring-to-front-16"
            label="Traer al frente"
            onClick={() => {
              onBringToFront();
              onClose();
            }}
          />
          <CtxMenuItem
            icon="qlementine-icons:bring-to-back-16"
            label="Enviar atrás"
            onClick={() => {
              onSendToBack();
              onClose();
            }}
          />
<div className="my-1 h-px bg-border" />
          <CtxMenuItem
            icon="solar:trash-bin-trash-bold"
            label="Eliminar capa"
            onClick={() => {
              onDelete();
              onClose();
            }}
            danger
          />
        </>
      )}

      {isMulti && (
        <>
          {canGroup && onGroup && (
            <CtxMenuItem
              icon="solar:layers-minimalistic-bold"
              label={`Agrupar (${selectedIds.length})`}
              onClick={() => {
                onGroup();
                onClose();
              }}
            />
          )}
          {canUngroup && onUngroup && (
            <CtxMenuItem
              icon="solar:layers-bold"
              label="Desagrupar"
              onClick={() => {
                onUngroup();
                onClose();
              }}
            />
          )}
          {(canGroup || canUngroup) && <div className="my-1 h-px bg-border" />}
          <CtxMenuItem
            icon="solar:trash-bin-trash-bold"
            label={`Eliminar ${selectedIds.length} capas`}
            onClick={() => {
              onDeleteSelected();
              onClose();
            }}
            danger
          />
        </>
      )}
    </div>
  );
}