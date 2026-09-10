"use client";
import { useState, useCallback, useMemo, useRef, useEffect } from "react";
import type { Tool, ZoomFragment, ZoomMovement } from "@/types";
import {
    createZoomFragment, getFragmentHoldBounds,
    findValidFragmentPosition, canAddFragmentAt,
} from "@/types";
import { findNextMovementSlot } from "@/lib/zoom-movement.utils";
import { MIN_MOVEMENT_TRACK_DURATION } from "@/app/components/ui/editor/ZoomMovementTrackItem";

const DEFAULT_ZOOM_FRAGMENT_DURATION = 2;

interface UseZoomFragmentsParams {
    currentTime: number;
    videoDuration: number;
    setActiveTool: (tool: Tool) => void;
    lastCopyActionRef: React.MutableRefObject<'element' | 'zoom' | 'motion' | 'audio' | null>;
    selectedZoomFragmentId: string | null;
    setSelectedZoomFragmentId: React.Dispatch<React.SetStateAction<string | null>>;
    selectedZoomMovementId: string | null;
    setSelectedZoomMovementId: React.Dispatch<React.SetStateAction<string | null>>;
    tZoom: (key: string, values?: Record<string, string | number | Date>) => string;
}

export function useZoomFragments({
    currentTime, videoDuration, setActiveTool, lastCopyActionRef,
    selectedZoomFragmentId, setSelectedZoomFragmentId,
    selectedZoomMovementId, setSelectedZoomMovementId,
    tZoom,
}: UseZoomFragmentsParams) {
    const [zoomFragments, setZoomFragments] = useState<ZoomFragment[]>([]);
    const zoomFragmentsRef = useRef<ZoomFragment[]>([]);
    useEffect(() => { zoomFragmentsRef.current = zoomFragments; }, [zoomFragments]);

    const [zoomMovements, setZoomMovements] = useState<ZoomMovement[]>([]);
    const [copiedZoomFragment, setCopiedZoomFragment] = useState<Omit<ZoomFragment, 'id' | 'startTime' | 'endTime'> | null>(null);
    const [copiedZoomMovements, setCopiedZoomMovements] = useState<Array<{
        name: string; startFrac: number; endFrac: number; focusX: number; focusY: number;
    }>>([]);

    const handleActivateZoomTool = useCallback(() => setActiveTool("zoom"), [setActiveTool]);

    const handleAddZoomFragment = useCallback((hintTime: number) => {
        const validPosition = findValidFragmentPosition(hintTime, DEFAULT_ZOOM_FRAGMENT_DURATION, zoomFragmentsRef.current, videoDuration);
        if (!validPosition) return;
        const newFragment = createZoomFragment(validPosition.startTime, validPosition.endTime);
        setZoomFragments(prev => [...prev, newFragment].sort((a, b) => a.startTime - b.startTime));
        setSelectedZoomFragmentId(newFragment.id);
        setActiveTool("zoom");
    }, [videoDuration, setActiveTool, setSelectedZoomFragmentId]);

    const handleAddZoomFragmentAtRange = useCallback((startTime: number, endTime: number) => {
        if (!canAddFragmentAt(startTime, endTime, zoomFragmentsRef.current)) return;
        const newFragment = createZoomFragment(startTime, endTime);
        setZoomFragments(prev => [...prev, newFragment].sort((a, b) => a.startTime - b.startTime));
        setSelectedZoomFragmentId(newFragment.id);
        setActiveTool("zoom");
    }, [setActiveTool, setSelectedZoomFragmentId]);

    const handleUpdateZoomFragment = useCallback((fragmentId: string, updates: Partial<ZoomFragment>) => {
        const oldFragment = zoomFragmentsRef.current.find(f => f.id === fragmentId);
        const affectsHoldBounds = 'startTime' in updates || 'endTime' in updates || 'speed' in updates;
        const oldBounds = oldFragment && affectsHoldBounds ? getFragmentHoldBounds(oldFragment) : null;

        setZoomFragments(prev => prev.map(f => (f.id === fragmentId ? { ...f, ...updates } : f)).sort((a, b) => a.startTime - b.startTime));

        if (!oldFragment || !oldBounds) return;
        const newFragment = { ...oldFragment, ...updates };
        const newBounds = getFragmentHoldBounds(newFragment);
        if (Math.abs(oldBounds.start - newBounds.start) < 1e-4 && Math.abs(oldBounds.end - newBounds.end) < 1e-4) return;
        const newSpan = newBounds.end - newBounds.start;
        setZoomMovements(prev => prev.map(m => {
            if (m.zoomFragmentId !== fragmentId) return m;
            const duration = m.endTime - m.startTime;
            const delta = newBounds.start - oldBounds.start;
            let newStart = m.startTime + delta;
            let newEnd = newStart + duration;
            if (newStart < newBounds.start) { newStart = newBounds.start; newEnd = newStart + duration; }
            if (newEnd > newBounds.end) { newEnd = newBounds.end; newStart = Math.max(newBounds.start, newEnd - duration); }
            if (newEnd - newStart > newSpan) { newStart = newBounds.start; newEnd = newBounds.end; }
            return { ...m, startTime: newStart, endTime: newEnd };
        }));
    }, []);

    const handleToggleZoomMovement = useCallback((fragmentId: string, enabled: boolean) => {
        if (enabled) {
            const fragment = zoomFragments.find(f => f.id === fragmentId);
            if (!fragment) return;
            const { start, end } = getFragmentHoldBounds(fragment);
            if (end - start < MIN_MOVEMENT_TRACK_DURATION) return;
            const slot = findNextMovementSlot([], start, end, MIN_MOVEMENT_TRACK_DURATION);
            handleUpdateZoomFragment(fragmentId, { movementEnabled: true });
            if (slot) {
                const newMovement: ZoomMovement = {
                    id: crypto.randomUUID(), zoomFragmentId: fragmentId,
                    name: tZoom("movement.defaultName", { number: 1 }),
                    startTime: slot.startTime, endTime: slot.endTime,
                    focusX: Math.min(85, Math.max(15, fragment.focusX + 25)),
                    focusY: Math.min(85, Math.max(15, fragment.focusY + 25)),
                };
                setZoomMovements(prev => [...prev, newMovement]);
                setSelectedZoomMovementId(newMovement.id);
            }
        } else {
            handleUpdateZoomFragment(fragmentId, { movementEnabled: false });
            setZoomMovements(prev => prev.filter(m => m.zoomFragmentId !== fragmentId));
            setSelectedZoomMovementId(null);
        }
    }, [zoomFragments, handleUpdateZoomFragment, tZoom, setSelectedZoomMovementId]);

    const handleAddZoomMovement = useCallback((fragmentId: string) => {
        const fragment = zoomFragments.find(f => f.id === fragmentId);
        if (!fragment) return;
        const siblings = zoomMovements.filter(m => m.zoomFragmentId === fragmentId).sort((a, b) => a.startTime - b.startTime);
        const { start, end } = getFragmentHoldBounds(fragment);
        const slot = findNextMovementSlot(siblings, start, end, MIN_MOVEMENT_TRACK_DURATION);
        if (!slot) return;
        const last = siblings[siblings.length - 1];
        const from = last ? { x: last.focusX, y: last.focusY } : { x: fragment.focusX, y: fragment.focusY };
        const newMovement: ZoomMovement = {
            id: crypto.randomUUID(), zoomFragmentId: fragmentId,
            name: tZoom("movement.defaultName", { number: siblings.length + 1 }),
            startTime: slot.startTime, endTime: slot.endTime,
            focusX: Math.min(85, Math.max(15, from.x + 25)),
            focusY: Math.min(85, Math.max(15, from.y + 25)),
        };
        setZoomMovements(prev => [...prev, newMovement]);
        setSelectedZoomMovementId(newMovement.id);
    }, [zoomFragments, zoomMovements, tZoom, setSelectedZoomMovementId]);

    const handleAddZoomMovementAtRange = useCallback((fragmentId: string, startTime: number, endTime: number) => {
        const fragment = zoomFragmentsRef.current.find(f => f.id === fragmentId);
        if (!fragment) return;
        const siblings = zoomMovements.filter(m => m.zoomFragmentId === fragmentId);
        const last = [...siblings].sort((a, b) => a.startTime - b.startTime).slice(-1)[0];
        const from = last ? { x: last.focusX, y: last.focusY } : { x: fragment.focusX, y: fragment.focusY };
        const newMovement: ZoomMovement = {
            id: crypto.randomUUID(), zoomFragmentId: fragmentId,
            name: tZoom("movement.defaultName", { number: siblings.length + 1 }),
            startTime, endTime,
            focusX: Math.min(85, Math.max(15, from.x + 25)),
            focusY: Math.min(85, Math.max(15, from.y + 25)),
        };
        setZoomMovements(prev => [...prev, newMovement]);
        setSelectedZoomMovementId(newMovement.id);
    }, [zoomMovements, tZoom, setSelectedZoomMovementId]);

    const handleUpdateZoomMovement = useCallback((id: string, updates: Partial<ZoomMovement>) => {
        setZoomMovements(prev => prev.map(m => m.id === id ? { ...m, ...updates } : m));
    }, []);

    const handleDeleteZoomMovement = useCallback((id: string) => {
        setZoomMovements(prev => {
            const target = prev.find(m => m.id === id);
            const next = prev.filter(m => m.id !== id);
            if (target) {
                const stillHasSiblings = next.some(m => m.zoomFragmentId === target.zoomFragmentId);
                if (!stillHasSiblings) {
                    setZoomFragments(fPrev => fPrev.map(f => (f.id === target.zoomFragmentId ? { ...f, movementEnabled: false } : f)));
                }
            }
            return next;
        });
        setSelectedZoomMovementId((prevId) => (prevId === id ? null : prevId));
    }, [setSelectedZoomMovementId]);

    const handleDeleteZoomFragment = useCallback((fragmentId: string) => {
        setZoomFragments(prev => prev.filter(f => f.id !== fragmentId));
        setZoomMovements(prev => prev.filter(m => m.zoomFragmentId !== fragmentId));
        if (selectedZoomFragmentId === fragmentId) setSelectedZoomFragmentId(null);
        setSelectedZoomMovementId(null);
    }, [selectedZoomFragmentId, setSelectedZoomFragmentId, setSelectedZoomMovementId]);

    const selectedZoomFragment = useMemo(
        () => zoomFragments.find(f => f.id === selectedZoomFragmentId) || null,
        [zoomFragments, selectedZoomFragmentId]
    );

    const copySelectedZoomFragment = useCallback(() => {
        if (!selectedZoomFragment) return;
        const { ...config } = selectedZoomFragment;
        setCopiedZoomFragment(config);
        const { start: hs, end: he } = getFragmentHoldBounds(selectedZoomFragment);
        const span = he - hs;
        const related = zoomMovements.filter(m => m.zoomFragmentId === selectedZoomFragment.id).map(m => ({
            name: m.name,
            startFrac: span > 0 ? (m.startTime - hs) / span : 0,
            endFrac: span > 0 ? (m.endTime - hs) / span : 1,
            focusX: m.focusX, focusY: m.focusY,
        }));
        setCopiedZoomMovements(related);
        lastCopyActionRef.current = 'zoom';
    }, [selectedZoomFragment, zoomMovements, lastCopyActionRef]);

    const pasteZoomFragment = useCallback(() => {
        if (!copiedZoomFragment) return;
        const original = selectedZoomFragmentId ? zoomFragmentsRef.current.find(f => f.id === selectedZoomFragmentId) : null;
        const duration = original ? original.endTime - original.startTime : DEFAULT_ZOOM_FRAGMENT_DURATION;
        const hintTime = original ? original.endTime : currentTime;
        const position = findValidFragmentPosition(hintTime, duration, zoomFragmentsRef.current, videoDuration);
        if (!position) return;
        const newFragment: ZoomFragment = { ...copiedZoomFragment, id: `zoom_${crypto.randomUUID()}`, startTime: position.startTime, endTime: position.endTime };
        if (copiedZoomFragment.movementEnabled && copiedZoomMovements.length > 0) {
            const { start: hs, end: he } = getFragmentHoldBounds(newFragment);
            const span = he - hs;
            const newMovements: ZoomMovement[] = copiedZoomMovements.map(cm => ({
                id: crypto.randomUUID(), zoomFragmentId: newFragment.id, name: cm.name,
                startTime: hs + cm.startFrac * span, endTime: hs + cm.endFrac * span,
                focusX: cm.focusX, focusY: cm.focusY,
            }));
            setZoomMovements(prev => [...prev, ...newMovements]);
        }
        setZoomFragments(prev => [...prev, newFragment].sort((a, b) => a.startTime - b.startTime));
        setSelectedZoomFragmentId(newFragment.id);
        setActiveTool("zoom");
    }, [copiedZoomFragment, selectedZoomFragmentId, currentTime, videoDuration, copiedZoomMovements, setSelectedZoomFragmentId, setActiveTool]);

    return {
        zoomFragments, setZoomFragments, zoomFragmentsRef,
        zoomMovements, setZoomMovements,
        selectedZoomFragment,
        handleActivateZoomTool, handleAddZoomFragment, handleAddZoomFragmentAtRange,
        handleUpdateZoomFragment, handleToggleZoomMovement, handleAddZoomMovement,
        handleAddZoomMovementAtRange, handleUpdateZoomMovement, handleDeleteZoomMovement,
        handleDeleteZoomFragment, copySelectedZoomFragment, pasteZoomFragment, copiedZoomFragment
    };
}