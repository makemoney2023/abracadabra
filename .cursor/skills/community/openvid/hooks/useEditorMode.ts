"use client";

import { useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import type { EditorMode, EditorModeConfig } from "@/types/editor-mode.types";
import { getEditorModeConfig } from "@/types/editor-mode.types";

interface UseEditorModeReturn {
    mode: EditorMode;
    config: EditorModeConfig;
    isVideoMode: boolean;
    isPhotoMode: boolean;
    setMode: (mode: EditorMode) => void;
}

export function useEditorMode(): UseEditorModeReturn {
    const searchParams = useSearchParams();
    const modeParam = searchParams.get("mode");
    
    const mode: EditorMode = modeParam === "photo" ? "photo" : "video";

    const config = useMemo(() => getEditorModeConfig(mode), [mode]);
    
    const isVideoMode = mode === "video";
    const isPhotoMode = mode === "photo";

    const setMode = useCallback((newMode: EditorMode) => {
        const url = new URL(window.location.href);
        url.searchParams.set("mode", newMode);
        window.history.replaceState({}, "", url.toString());
    }, []);

    return {
        mode,
        config,
        isVideoMode,
        isPhotoMode,
        setMode,
    };
}

