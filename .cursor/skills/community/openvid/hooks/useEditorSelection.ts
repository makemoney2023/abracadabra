"use client";
import { Tool } from "@/types";
import { useState, useCallback } from "react";

interface UseEditorSelectionParams {
  setActiveTool: (tool: Tool) => void;
}

export function useEditorSelection({ setActiveTool }: UseEditorSelectionParams) {
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [multiSelectedElementIds, setMultiSelectedElementIds] = useState<string[]>([]);
  const [selectedZoomFragmentId, setSelectedZoomFragmentId] = useState<string | null>(null);
  const [selectedZoomMovementId, setSelectedZoomMovementId] = useState<string | null>(null);
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<string | null>(null);
  const [selectedVideoClipId, setSelectedVideoClipId] = useState<string | null>(null);
  const [selectedMockupMotionFragmentId, setSelectedMockupMotionFragmentId] = useState<string | null>(null);

  const selectCanvasElement = useCallback((id: string | null) => {
    setSelectedElementId(id);
    setMultiSelectedElementIds([]);
    setSelectedZoomFragmentId(null);
    setSelectedZoomMovementId(null);
    setSelectedVideoClipId(null);
    setSelectedAudioTrackId(null);
    setSelectedMockupMotionFragmentId(null);
    if (id) setActiveTool("elements");
  }, [setActiveTool]);

  const selectZoomFragment = useCallback((fragmentId: string | null) => {
    setSelectedZoomFragmentId(fragmentId);
    setSelectedZoomMovementId(null);
    setSelectedAudioTrackId(null);
    setSelectedVideoClipId(null);
    setSelectedElementId(null);
    setSelectedMockupMotionFragmentId(null);
    setMultiSelectedElementIds([]);
  }, []);

  const selectZoomMovement = useCallback((id: string | null) => {
    setSelectedZoomMovementId(id);
    if (id) {
      setSelectedAudioTrackId(null);
      setSelectedVideoClipId(null);
      setSelectedElementId(null);
      setSelectedMockupMotionFragmentId(null);
      setMultiSelectedElementIds([]);
      setActiveTool("zoom");
    }
  }, [setActiveTool]);

  const selectAudioTrack = useCallback((trackId: string | null) => {
    setSelectedAudioTrackId(trackId);
    setSelectedZoomFragmentId(null);
    setSelectedZoomMovementId(null);
    setSelectedVideoClipId(null);
    setSelectedElementId(null);
    setSelectedMockupMotionFragmentId(null);
    setMultiSelectedElementIds([]);
    if (trackId) setActiveTool("audio");
  }, [setActiveTool]);

  const selectVideoClip = useCallback((clipId: string | null) => {
    setSelectedVideoClipId(clipId);
    setSelectedZoomFragmentId(null);
    setSelectedZoomMovementId(null);
    setSelectedAudioTrackId(null);
    setSelectedElementId(null);
    setSelectedMockupMotionFragmentId(null);
    setMultiSelectedElementIds([]);
    if (clipId) setActiveTool("video");
  }, [setActiveTool]);

  const selectMockupMotionFragment = useCallback((id: string | null) => {
    setSelectedMockupMotionFragmentId(id);
    setSelectedZoomFragmentId(null);
    setSelectedZoomMovementId(null);
    setSelectedAudioTrackId(null);
    setSelectedVideoClipId(null);
    setSelectedElementId(null);
    setMultiSelectedElementIds([]);
  }, []);

  return {
    selectedElementId, setSelectedElementId,
    multiSelectedElementIds, setMultiSelectedElementIds,
    selectedZoomFragmentId, setSelectedZoomFragmentId,
    selectedZoomMovementId, setSelectedZoomMovementId,
    selectedAudioTrackId, setSelectedAudioTrackId,
    selectedVideoClipId, setSelectedVideoClipId,
    selectedMockupMotionFragmentId, setSelectedMockupMotionFragmentId,
    selectCanvasElement,
    selectZoomFragment,
    selectZoomMovement,
    selectAudioTrack,
    selectVideoClip,
    selectMockupMotionFragment,
  };
}