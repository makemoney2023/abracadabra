"use client";

import { Suspense } from "react";
import { Icon } from "@iconify/react";
import * as Dialog from "@radix-ui/react-dialog";
import type { ControlPanelProps } from "@/types/control-panel.types";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";

interface MobileControlPanelProps extends ControlPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

import dynamic from "next/dynamic";

const ControlPanel = dynamic(
    () => import("./ControlPanel").then(mod => ({ default: mod.ControlPanel })),
    {
        loading: () => (
            <div className="w-full h-full flex items-center justify-center">
                <LoadingSpinner message="Cargando..." />
            </div>
        ),
        ssr: false
    }
);

export function MobileControlPanel({
    isOpen,
    onClose,
    ...controlPanelProps
}: MobileControlPanelProps) {
    return (
        <Dialog.Root open={isOpen} onOpenChange={onClose}>
            <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-100 animate-in fade-in duration-200 lg:hidden" />
                <Dialog.Content className="fixed inset-x-0 bottom-0 top-16 bg-background z-101 animate-in slide-in-from-bottom duration-300 overflow-y-auto lg:hidden">
                    
                    <div className="absolute top-4 right-4 z-10">
                        <Dialog.Close asChild>
                            <button
                                className="h-8 w-8 rounded-full bg-muted/60 hover:bg-muted flex items-center justify-center transition-colors backdrop-blur-sm"
                                aria-label="Cerrar"
                            >
                                <Icon icon="mdi:close" width="20" className="text-muted-foreground" aria-hidden="true" />
                            </button>
                        </Dialog.Close>
                    </div>

                    <div className="p-4">
                        <Suspense
                            fallback={
                                <div className="flex items-center justify-center py-20">
                                    <LoadingSpinner message="Cargando panel..." />
                                </div>
                            }
                        >
                            <ControlPanel
                                {...controlPanelProps}
                                onTogglePanel={onClose}
                                isOpen={true}
                            />
                        </Suspense>
                    </div>
                </Dialog.Content>
            </Dialog.Portal>
        </Dialog.Root>
    );
}
