"use client";

interface TabButtonProps {
    label: string;
    isActive?: boolean;
    onClick?: () => void;
}

export function TabButton({ label, isActive, onClick }: TabButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`flex-1 py-1.5 rounded-md transition ${
                isActive
                    ? "bg-background text-foreground shadow-xs"
                    : "hover:text-foreground text-muted-foreground"
            }`}
        >
            {label}
        </button>
    );
}
