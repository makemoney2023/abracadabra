"use client";

import { useCallback, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import type { Tool } from "@/types/editor.types";

const VALID_TOOLS: ReadonlySet<Tool> = new Set<Tool>([
    "screenshot",
    "elements",
    "audio",
    "zoom",
    "mockup",
    "cursor",
    "video",
    "camera",
    "history",
    "motion",
]);

function parseTool(value: string | null): Tool {
    if (value && VALID_TOOLS.has(value as Tool)) {
        return value as Tool;
    }
    return "screenshot";
}

export function useActiveTool(): [Tool, (next: Tool) => void] {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const urlTool = parseTool(searchParams.get("menu"));
    const [override, setOverride] = useState<Tool | null>(null);
    const [overrideFor, setOverrideFor] = useState<Tool>(urlTool);
    const effectiveOverride = overrideFor === urlTool ? override : null;
    const tool = effectiveOverride ?? urlTool;

    const setTool = useCallback((next: Tool) => {
        setOverrideFor(urlTool);
        setOverride(next);
        const params = new URLSearchParams(window.location.search);
        params.set("menu", next);
        window.history.replaceState(null, "", `${pathname}?${params.toString()}`);
    }, [pathname, urlTool]);

    return [tool, setTool];
}
