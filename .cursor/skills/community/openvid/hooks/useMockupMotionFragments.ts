"use client";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import {
    DEFAULT_MOCKUP_MOTION_CONFIG,
    findValidMotionPlacement,
    MOTION_PRESET_3D_IDS,
    type MockupMotionFragment,
    type MockupMotionPresetId,
    type MockupMotionMode,
} from "@/lib/mockup-motion";
import { Tool } from "@/types";

interface UseMockupMotionFragmentsParams {
    currentTime: number;
    videoDuration: number;
    setActiveTool: (tool: Tool) => void;
    lastCopyActionRef: React.MutableRefObject<'element' | 'zoom' | 'motion' | 'audio' | null>;
    selectedMockupMotionFragmentId: string | null;
    setSelectedMockupMotionFragmentId: React.Dispatch<React.SetStateAction<string | null>>;
    /** Current active motion mode — when this changes, orphan fragments from
     * the previous mode are pruned so the timeline stays clean. */
    motionMode?: MockupMotionMode | null;
}

export function useMockupMotionFragments({
    currentTime, videoDuration, setActiveTool, lastCopyActionRef,
    selectedMockupMotionFragmentId, setSelectedMockupMotionFragmentId,
    motionMode,
}: UseMockupMotionFragmentsParams) {
    const [mockupMotionFragments, setMockupMotionFragments] = useState<MockupMotionFragment[]>([]);
    const mockupMotionFragmentsRef = useRef<MockupMotionFragment[]>([]);
    useEffect(() => { mockupMotionFragmentsRef.current = mockupMotionFragments; }, [mockupMotionFragments]);

    // Prune orphan fragments when the motion mode changes (e.g. switching from
    // a 3D mockup to a 2D mockup). Fragments whose preset belongs to the other
    // mode are removed, and the selection is cleared if it pointed to one of them.
    const prevMotionModeRef = useRef<MockupMotionMode | null | undefined>(motionMode);
    useEffect(() => {
        if (prevMotionModeRef.current === motionMode) return;
        const prevMode = prevMotionModeRef.current;
        prevMotionModeRef.current = motionMode;
        if (!prevMode || !motionMode || prevMode === motionMode) return;

        setMockupMotionFragments((prev) => {
            const kept = prev.filter((f) => {
                const is3D = MOTION_PRESET_3D_IDS.has(f.presetId);
                return motionMode === "3d" ? is3D : !is3D;
            });
            if (kept.length !== prev.length) {
                const removed = prev.filter((f) => !kept.includes(f));
                const removedIds = new Set(removed.map((f) => f.id));
                if (removedIds.has(selectedMockupMotionFragmentId ?? "")) {
                    setSelectedMockupMotionFragmentId(null);
                }
            }
            return kept;
        });
    }, [motionMode, selectedMockupMotionFragmentId, setSelectedMockupMotionFragmentId]);

    const [copiedMockupMotionFragment, setCopiedMockupMotionFragment] = useState<Omit<MockupMotionFragment, 'id' | 'startTime' | 'endTime'> | null>(null);

    const selectedMockupMotionFragment = useMemo(
        () => mockupMotionFragments.find((f) => f.id === selectedMockupMotionFragmentId) ?? null,
        [mockupMotionFragments, selectedMockupMotionFragmentId]
    );

    const handleUpdateMockupMotionFragment = useCallback(
        (id: string, updates: Partial<MockupMotionFragment>) => {
            setMockupMotionFragments((prev) => prev.map((f) => (f.id === id ? { ...f, ...updates } : f)));
        }, []
    );

    const handleDeleteMockupMotionFragment = useCallback((id: string) => {
        setMockupMotionFragments((prev) => prev.filter((f) => f.id !== id));
        setSelectedMockupMotionFragmentId((prev) => (prev === id ? null : prev));
    }, [setSelectedMockupMotionFragmentId]);

    const handleAddOrReplaceMotionPreset = useCallback(
        (presetId: MockupMotionPresetId) => {
            const speed = DEFAULT_MOCKUP_MOTION_CONFIG.speed;
            const intensity = DEFAULT_MOCKUP_MOTION_CONFIG.intensity;
            const placement = findValidMotionPlacement(
                presetId, speed, currentTime, mockupMotionFragmentsRef.current, videoDuration
            );
            if (!placement) return;
            const newFragment: MockupMotionFragment = {
                id: `motion_${crypto.randomUUID()}`, presetId, intensity, speed, ...placement,
            };
            setMockupMotionFragments((prev) => [...prev, newFragment]);
            setSelectedMockupMotionFragmentId(newFragment.id);
            setActiveTool("motion");
        }, [currentTime, videoDuration, setActiveTool, setSelectedMockupMotionFragmentId]
    );

    const handleActivateMotionTool = useCallback(() => setActiveTool("motion"), [setActiveTool]);

    const copySelectedMockupMotionFragment = useCallback(() => {
        if (!selectedMockupMotionFragment) return;
        const { id, startTime, endTime, ...config } = selectedMockupMotionFragment;
        setCopiedMockupMotionFragment(config);
        lastCopyActionRef.current = 'motion';
    }, [selectedMockupMotionFragment, lastCopyActionRef]);

    const pasteMockupMotionFragment = useCallback(() => {
        if (!copiedMockupMotionFragment) return;
        const original = selectedMockupMotionFragmentId
            ? mockupMotionFragmentsRef.current.find(f => f.id === selectedMockupMotionFragmentId)
            : null;
        const hintTime = original ? original.endTime : currentTime;
        const placement = findValidMotionPlacement(
            copiedMockupMotionFragment.presetId, copiedMockupMotionFragment.speed,
            hintTime, mockupMotionFragmentsRef.current, videoDuration
        );
        if (!placement) return;
        const newFragment: MockupMotionFragment = {
            ...copiedMockupMotionFragment, id: `motion_${crypto.randomUUID()}`, ...placement,
        };
        setMockupMotionFragments(prev => [...prev, newFragment]);
        setSelectedMockupMotionFragmentId(newFragment.id);
        setActiveTool("motion");
    }, [copiedMockupMotionFragment, selectedMockupMotionFragmentId, currentTime, videoDuration, setSelectedMockupMotionFragmentId, setActiveTool]);

    return {
        mockupMotionFragments, setMockupMotionFragments, mockupMotionFragmentsRef,
        selectedMockupMotionFragment,
        handleUpdateMockupMotionFragment, handleDeleteMockupMotionFragment,
        handleAddOrReplaceMotionPreset, handleActivateMotionTool,
        copySelectedMockupMotionFragment, pasteMockupMotionFragment,copiedMockupMotionFragment
    };
}