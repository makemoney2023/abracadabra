import { CanvasElement } from "./canvas-elements.types";

export const TYPE_ICON: Record<CanvasElement["type"] | "video", string> = {
    image: "solar:gallery-bold",
    text:  "solar:text-bold",
    svg:   "mdi:svg",
    video: "solar:videocamera-record-bold",
};

export interface LayersPanelProps {
    elements: CanvasElement[];
    selectedId: string | null;
    selectedMultiIds?: string[];
    onSelect: (id: string | null) => void;
    onMultiSelect?: (ids: string[]) => void;
    onDelete: (id: string | string[]) => void;
    onReorder: (frontIds: string[], backIds: string[]) => void;
    onToggleVisible: (id: string, visible: boolean) => void;
    onToggleLock: (id: string, locked: boolean) => void;
    onBringToFront: (id: string) => void;
    onSendToBack: (id: string) => void;
    onGroup?: (ids: string[]) => void;
    onUngroup?: (ids: string[]) => void;
    onSetGroupId?: (id: string, groupId: string | undefined) => void;
    toolbar?: React.ReactNode;
    // Video/image layer support
    videoLayerVisible?: boolean;
    onVideoLayerSelect?: () => void;
    isVideoLayerSelected?: boolean;
    mediaType?: "video" | "image";
    // Hover support for element highlighting in canvas
    hoveredElementId?: string | null;
    onHoverElement?: (id: string | null) => void;
}

export interface CtxMenuState { x: number; y: number; id: string }

export interface ContextMenuProps {
    x: number;
    y: number;
    id: string;
    selectedIds: string[];
    canGroup: boolean;
    canUngroup: boolean;
    onBringToFront: () => void;
    onSendToBack: () => void;
    onDelete: () => void;
    onDeleteSelected: () => void;
    onGroup?: () => void;
    onUngroup?: () => void;
    onClose: () => void;
}

export interface PointerDragState {
  id: string;
  isGroup: boolean;
  x: number;
  y: number;
  dropIndex: number;
  dropTargetGroupId: string | null;
  active: boolean;
  startY: number;
}