"use client";
import { useState, useCallback, useMemo } from "react";
import type { CanvasElement } from "@/types/canvas-elements.types";
import { VIDEO_Z_INDEX } from "@/lib/constants";
import { Tool } from "@/types";

interface UseCanvasElementsParams {
  selectedElementId: string | null;
  multiSelectedElementIds: string[];
  setSelectedElementId: (id: string | null) => void;
  setMultiSelectedElementIds: (ids: string[]) => void;
  setActiveTool: (tool: Tool) => void;
  lastCopyActionRef: React.MutableRefObject<'element' | 'zoom' | 'motion' | 'audio' | null>;
}

export function useCanvasElements({
  selectedElementId, multiSelectedElementIds,
  setSelectedElementId, setMultiSelectedElementIds,
  setActiveTool, lastCopyActionRef,
}: UseCanvasElementsParams) {
  const [canvasElements, setCanvasElements] = useState<CanvasElement[]>([]);
  const [copiedElements, setCopiedElements] = useState<CanvasElement[]>([]);

  const addCanvasElement = useCallback((element: CanvasElement) => {
    setCanvasElements(prev => [...prev, element]);
    setSelectedElementId(element.id);
  }, [setSelectedElementId]);

  const updateCanvasElement = useCallback((id: string, updates: Partial<CanvasElement>) => {
    setCanvasElements(prev => prev.map(el => el.id === id ? { ...el, ...updates } as CanvasElement : el));
  }, []);

  const deleteCanvasElement = useCallback((idOrIds: string | string[]) => {
    const idsToDelete = Array.isArray(idOrIds) ? idOrIds : [idOrIds];
    const idsSet = new Set(idsToDelete);
    setCanvasElements(prev => prev.filter(el => !idsSet.has(el.id)));
    setSelectedElementId(selectedElementId && idsSet.has(selectedElementId) ? null : selectedElementId);
  }, [selectedElementId, setSelectedElementId]);

  const bringToFront = useCallback((id: string) => {
    const aboveVideoElements = canvasElements.filter(el => el.zIndex >= VIDEO_Z_INDEX);
    const maxAboveVideo = aboveVideoElements.length > 0 ? Math.max(...aboveVideoElements.map(el => el.zIndex)) : VIDEO_Z_INDEX - 1;
    updateCanvasElement(id, { zIndex: Math.max(maxAboveVideo + 1, VIDEO_Z_INDEX) });
  }, [canvasElements, updateCanvasElement]);

  const sendToBack = useCallback((id: string) => {
    const element = canvasElements.find(el => el.id === id);
    if (!element) return;
    if (element.zIndex >= VIDEO_Z_INDEX) {
      const behindVideoElements = canvasElements.filter(el => el.zIndex < VIDEO_Z_INDEX);
      const minBehindVideo = behindVideoElements.length > 0 ? Math.min(...behindVideoElements.map(el => el.zIndex)) : VIDEO_Z_INDEX - 100;
      updateCanvasElement(id, { zIndex: Math.min(minBehindVideo - 1, VIDEO_Z_INDEX - 1) });
    } else {
      const behindVideoElements = canvasElements.filter(el => el.zIndex < VIDEO_Z_INDEX && el.id !== id);
      const minBehindVideo = behindVideoElements.length > 0 ? Math.min(...behindVideoElements.map(el => el.zIndex)) : element.zIndex;
      updateCanvasElement(id, { zIndex: minBehindVideo - 1 });
    }
  }, [canvasElements, updateCanvasElement]);

  const copySelectedElement = useCallback(() => {
    const multiSelectionIsValid = multiSelectedElementIds.length > 1 &&
      (!selectedElementId || multiSelectedElementIds.includes(selectedElementId));
    const idsToCopy = multiSelectionIsValid ? multiSelectedElementIds : (selectedElementId ? [selectedElementId] : []);
    if (idsToCopy.length === 0) return;
    const elements = canvasElements.filter(el => idsToCopy.includes(el.id));
    if (elements.length > 0) {
      setCopiedElements(elements);
      lastCopyActionRef.current = 'element';
    }
  }, [selectedElementId, multiSelectedElementIds, canvasElements, lastCopyActionRef]);

  const pasteElement = useCallback(() => {
    if (copiedElements.length === 0) return;
    let nextBehindZ = Math.max(VIDEO_Z_INDEX - 100, ...canvasElements.filter(e => e.zIndex < VIDEO_Z_INDEX).map(e => e.zIndex));
    let nextAboveZ = Math.max(VIDEO_Z_INDEX - 1, ...canvasElements.filter(e => e.zIndex >= VIDEO_Z_INDEX).map(e => e.zIndex));
    const idMap = new Map<string, string>();
    copiedElements.forEach(el => idMap.set(el.id, `${el.type}-${crypto.randomUUID()}`));
    const groupIdMap = new Map<string, string>();
    const newElements = copiedElements.map(el => {
      const isBehindVideo = el.zIndex < VIDEO_Z_INDEX;
      const zIndex = isBehindVideo ? ++nextBehindZ : ++nextAboveZ;
      let newGroupId: string | undefined;
      if (el.groupId) {
        if (!groupIdMap.has(el.groupId)) groupIdMap.set(el.groupId, crypto.randomUUID());
        newGroupId = groupIdMap.get(el.groupId);
      }
      return { ...el, id: idMap.get(el.id)!, x: el.x + 5, y: el.y + 5, zIndex, groupId: newGroupId } as CanvasElement;
    });
    setCanvasElements(prev => [...prev, ...newElements]);
    const newIds = newElements.map(el => el.id);
    setSelectedElementId(newIds[0] ?? null);
    setMultiSelectedElementIds(newIds);
    setActiveTool("elements");
  }, [copiedElements, canvasElements, setSelectedElementId, setMultiSelectedElementIds, setActiveTool]);

  const selectedCanvasElement = useMemo(
    () => canvasElements.find(el => el.id === selectedElementId) ?? null,
    [canvasElements, selectedElementId]
  );

  return {
    canvasElements, setCanvasElements,
    copiedElements,
    selectedCanvasElement,
    addCanvasElement, updateCanvasElement, deleteCanvasElement,
    bringToFront, sendToBack,
    copySelectedElement, pasteElement,
  };
}