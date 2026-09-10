"use client";

import { useEffect } from "react";
import type { Tool } from "@/types";

interface UseEditorShortcutsParams {
    handleUndo: () => void;
    handleRedo: () => void;
    canUndo: boolean;
    canRedo: boolean;

    activeTool: Tool;
    isPhotoMode: boolean;

    textToolActive: boolean;
    setTextToolActive: (active: boolean) => void;

    selectedElementId: string | null;
    setSelectedElementId: (id: string | null) => void;
    multiSelectedElementIds: string[];
    deleteCanvasElement: (id: string | string[]) => void;
    copySelectedElement: () => void;
    copiedElements: unknown[];
    pasteElement: () => void;

    selectedVideoClipId: string | null;
    setSelectedVideoClipId: (id: string | null) => void;
    handleDeleteVideoClip: (id: string) => void;

    selectedAudioTrackId: string | null;
    setSelectedAudioTrackId: (id: string | null) => void;
    handleDeleteAudioTrack: (id: string) => void;
    copySelectedAudioTrack: () => void;
    copiedAudioTrack: unknown;
    pasteAudioTrack: () => void;

    selectedZoomFragmentId: string | null;
    setSelectedZoomFragmentId: (id: string | null) => void;
    handleDeleteZoomFragment: (id: string) => void;
    copySelectedZoomFragment: () => void;
    copiedZoomFragment: unknown;
    pasteZoomFragment: () => void;

    selectedZoomMovementId: string | null;
    setSelectedZoomMovementId: (id: string | null) => void;
    handleDeleteZoomMovement: (id: string) => void;

    selectedMockupMotionFragmentId: string | null;
    setSelectedMockupMotionFragmentId: (id: string | null) => void;
    handleDeleteMockupMotionFragment: (id: string) => void;
    copySelectedMockupMotionFragment: () => void;
    copiedMockupMotionFragment: unknown;
    pasteMockupMotionFragment: () => void;

    lastCopyActionRef: React.MutableRefObject<'element' | 'zoom' | 'motion' | 'audio' | null>;

    handleImageUploadToCanvas: (file: File) => void | Promise<void>;
    handleVideoUpload: (file: File, options?: { forceReplace?: boolean }) => Promise<void>;
}

export function useEditorShortcuts({
    handleUndo,
    handleRedo,
    canUndo,
    canRedo,
    activeTool,
    isPhotoMode,
    textToolActive,
    setTextToolActive,
    selectedElementId,
    setSelectedElementId,
    multiSelectedElementIds,
    deleteCanvasElement,
    copySelectedElement,
    copiedElements,
    pasteElement,
    selectedVideoClipId,
    setSelectedVideoClipId,
    handleDeleteVideoClip,
    selectedAudioTrackId,
    setSelectedAudioTrackId,
    handleDeleteAudioTrack,
    copySelectedAudioTrack,
    copiedAudioTrack,
    pasteAudioTrack,
    selectedZoomFragmentId,
    setSelectedZoomFragmentId,
    handleDeleteZoomFragment,
    copySelectedZoomFragment,
    copiedZoomFragment,
    pasteZoomFragment,
    selectedZoomMovementId,
    setSelectedZoomMovementId,
    handleDeleteZoomMovement,
    selectedMockupMotionFragmentId,
    setSelectedMockupMotionFragmentId,
    handleDeleteMockupMotionFragment,
    copySelectedMockupMotionFragment,
    copiedMockupMotionFragment,
    pasteMockupMotionFragment,
    lastCopyActionRef,
    handleImageUploadToCanvas,
    handleVideoUpload,
}: UseEditorShortcutsParams) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
            if (isInputFocused) return;

            if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
                e.preventDefault();
                if (canUndo) { handleUndo(); }
            }
            if (((e.ctrlKey || e.metaKey) && e.key === 'y') || ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')) {
                e.preventDefault();
                if (canRedo) { handleRedo(); }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [handleUndo, handleRedo, canUndo, canRedo]);

    useEffect(() => {
        const handlePaste = async (e: ClipboardEvent) => {
            const target = e.target as HTMLElement;
            const isInputFocused = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
            if (isInputFocused) return;

            if (lastCopyActionRef.current === 'zoom' && activeTool === 'zoom' && copiedZoomFragment) {
                e.preventDefault();
                pasteZoomFragment();
                return;
            }
            if (lastCopyActionRef.current === 'motion' && activeTool === 'motion' && copiedMockupMotionFragment) {
                e.preventDefault();
                pasteMockupMotionFragment();
                return;
            }
            if (lastCopyActionRef.current === 'element' && copiedElements.length > 0) {
                e.preventDefault();
                pasteElement();
                return;
            }

            const items = e.clipboardData?.items;
            if (items) {
                const wantedPrefix = isPhotoMode ? 'image/' : 'video/';
                for (const item of Array.from(items)) {
                    if (item.type.startsWith(wantedPrefix)) {
                        e.preventDefault();
                        const file = item.getAsFile();
                        if (!file) break;
                        if (isPhotoMode) {
                            handleImageUploadToCanvas(file);
                        } else {
                            await handleVideoUpload(file, { forceReplace: true });
                        }
                        return;
                    }
                }
            }

            if (activeTool === 'zoom' && copiedZoomFragment) {
                e.preventDefault();
                pasteZoomFragment();
                return;
            }
            if (activeTool === 'motion' && copiedMockupMotionFragment) {
                e.preventDefault();
                pasteMockupMotionFragment();
                return;
            }
            if (copiedAudioTrack) {
                e.preventDefault();
                pasteAudioTrack();
                return;
            }
            if (copiedElements.length > 0) {
                e.preventDefault();
                pasteElement();
            }
        };
        window.addEventListener('paste', handlePaste);
        return () => window.removeEventListener('paste', handlePaste);
    }, [
        isPhotoMode, handleImageUploadToCanvas, handleVideoUpload, activeTool,
        copiedZoomFragment, pasteZoomFragment, copiedElements, pasteElement,
        copiedMockupMotionFragment, pasteMockupMotionFragment, lastCopyActionRef,
        copiedAudioTrack, pasteAudioTrack,
    ]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
                return;
            }
            if ((e.target as HTMLElement)?.isContentEditable) return;

            if (e.key === 't' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                e.preventDefault();
                setTextToolActive(true);
                return;
            }

            if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
                if (selectedElementId || multiSelectedElementIds.length > 0) {
                    e.preventDefault();
                    copySelectedElement();
                    return;
                }
                if (selectedZoomFragmentId) {
                    e.preventDefault();
                    copySelectedZoomFragment();
                    return;
                }
                if (selectedMockupMotionFragmentId) {
                    e.preventDefault();
                    copySelectedMockupMotionFragment();
                    return;
                }
                if (selectedAudioTrackId) {
                    e.preventDefault();
                    copySelectedAudioTrack();
                    return;
                }
            }

            if ((e.key === "Delete" || e.key === "Backspace") && (selectedElementId || multiSelectedElementIds.length > 0)) {
                e.preventDefault();
                const idsToDelete = multiSelectedElementIds.length > 1 ? multiSelectedElementIds : selectedElementId;
                if (idsToDelete) deleteCanvasElement(idsToDelete);
                return;
            }
            if ((e.key === "Delete" || e.key === "Backspace") && selectedVideoClipId) {
                e.preventDefault();
                handleDeleteVideoClip(selectedVideoClipId);
                return;
            }
            if ((e.key === "Delete" || e.key === "Backspace") && selectedAudioTrackId) {
                e.preventDefault();
                handleDeleteAudioTrack(selectedAudioTrackId);
                setSelectedAudioTrackId(null);
                return;
            }
            if ((e.key === "Delete" || e.key === "Backspace") && selectedZoomMovementId) {
                e.preventDefault();
                handleDeleteZoomMovement(selectedZoomMovementId);
                return;
            }
            if ((e.key === "Delete" || e.key === "Backspace") && selectedZoomFragmentId) {
                e.preventDefault();
                handleDeleteZoomFragment(selectedZoomFragmentId);
                return;
            }
            if ((e.key === "Delete" || e.key === "Backspace") && selectedMockupMotionFragmentId) {
                e.preventDefault();
                handleDeleteMockupMotionFragment(selectedMockupMotionFragmentId);
                return;
            }

            if (e.key === "Escape") {
                e.preventDefault();
                if (textToolActive) {
                    setTextToolActive(false);
                    return;
                }
                if (selectedElementId) {
                    setSelectedElementId(null);
                } else if (selectedVideoClipId) {
                    setSelectedVideoClipId(null);
                } else if (selectedAudioTrackId) {
                    setSelectedAudioTrackId(null);
                } else if (selectedZoomMovementId) {
                    setSelectedZoomMovementId(null);
                } else if (selectedZoomFragmentId) {
                    setSelectedZoomFragmentId(null);
                } else if (selectedMockupMotionFragmentId) {
                    setSelectedMockupMotionFragmentId(null);
                }
            }
        };
        document.addEventListener("keydown", handleKeyDown);
        return () => document.removeEventListener("keydown", handleKeyDown);
    }, [
        selectedElementId, multiSelectedElementIds, selectedZoomFragmentId, selectedZoomMovementId,
        selectedAudioTrackId, selectedVideoClipId, selectedMockupMotionFragmentId,
        deleteCanvasElement, handleDeleteZoomFragment, handleDeleteZoomMovement,
        handleDeleteAudioTrack, handleDeleteVideoClip, handleDeleteMockupMotionFragment,
        copySelectedElement, textToolActive, copySelectedZoomFragment, copySelectedMockupMotionFragment,
        copySelectedAudioTrack,
        setTextToolActive, setSelectedElementId, setSelectedVideoClipId, setSelectedAudioTrackId,
        setSelectedZoomMovementId, setSelectedZoomFragmentId, setSelectedMockupMotionFragmentId,
    ]);
}