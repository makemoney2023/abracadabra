import type { Tool } from "./editor.types";

export interface ToolsSidebarProps {
    activeTool: Tool;
    onToolChange: (tool: Tool) => void;
}