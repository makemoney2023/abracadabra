import { Icon } from "@iconify/react";

interface LoadingSpinnerProps {
    size?: "sm" | "md" | "lg";
    message?: string;
}

export function LoadingSpinner({ size = "md", message }: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: "w-4 h-4",
        md: "w-6 h-6",
        lg: "w-8 h-8",
    };

    return (
        <div className="flex flex-col items-center justify-center gap-3 py-8">
            <Icon 
                icon="svg-spinners:ring-resize" 
                className={`${sizeClasses[size]} text-blue-500`}
            />
            {message && (
                <p className="text-xs text-muted-foreground animate-pulse">{message}</p>
            )}
        </div>
    );
}
