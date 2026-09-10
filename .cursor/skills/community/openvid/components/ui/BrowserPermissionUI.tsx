"use client";

import { Icon } from "@iconify/react";

function PermissionRow({ 
    icon, 
    title, 
    subtitle, 
    highlight 
}: { 
    icon: string; 
    title: string; 
    subtitle: string;
    highlight?: boolean;
}) {
    return (
        <div className={`flex items-center justify-between px-4 py-2 transition-colors ${highlight ? "bg-[#8AB4F8]/10" : "hover:bg-muted"}`}>
            <div className="flex gap-3">
                <Icon icon={icon} className={`size-5 shrink-0 mt-0.5 ${highlight ? "text-[#8AB4F8]" : "text-muted-foreground"}`} />
                <div className="flex flex-col">
                    <span className="text-[13px] text-foreground">{title}</span>
                    <span className="text-[11px] text-muted-foreground line-clamp-1">{subtitle}</span>
                </div>
            </div>
            
            <div className="relative shrink-0 flex items-center">
                {highlight && (
                    <div className="absolute inset-0 bg-[#8AB4F8] rounded-full animate-ping opacity-20" />
                )}
                <div className={`w-8 h-4 rounded-full relative transition-all ${highlight ? "bg-muted-foreground/40 shadow-[0_0_8px_rgba(138,180,248,0.4)] border border-[#8AB4F8]/50" : "bg-[#8AB4F8]"}`}>
                    <div className={`absolute top-1/2 -translate-y-1/2 size-5 bg-background border-2 rounded-full shadow transition-all ${highlight ? "left-0 border-border" : "right-0 border-[#8AB4F8]"}`} />
                </div>
            </div>
        </div>
    );
}

export function BrowserPermissionUI() {
    return (
        <div className="w-85 flex flex-col border border-border squircle-element-camera shadow-2xl overflow-hidden font-sans select-none">
            
            <div className="bg-muted px-3 py-2 flex items-center gap-2 border-b border-[#8AB4F8]/20">
                <Icon icon="solar:info-circle-bold" className="size-4 text-muted-foreground shrink-0" />
                <span className="text-[12px] font-medium text-muted-foreground leading-none mt-0.5">
                    Haz clic en el ícono de arriba y activa tu cámara.
                </span>
            </div>

            <div className="flex items-center gap-3 px-3 py-1.5 bg-muted border-b border-border text-[13px]">
                <div className="relative cursor-pointer group">
                    <div className="absolute inset-0 bg-[#8AB4F8] squircle-element-camera animate-ping opacity-20"></div>
                    <div className="relative flex items-center justify-center p-1.5 rounded-sm bg-[#8AB4F8]/20 border border-[#8AB4F8]/30">
                        <Icon icon="mdi:tune-variant" className="size-3.75 text-[#8AB4F8]" />
                    </div>
                </div>
                <span className="text-foreground font-medium tracking-wide">
                    openvid.dev
                </span>
            </div>

            <div className="flex flex-col bg-card text-foreground">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                    <span className="font-medium text-[15px]">openvid.dev</span>
                    <Icon icon="ic:round-close" className="size-5 text-muted-foreground cursor-pointer" />
                </div>

                <div className="flex items-center justify-between px-4 py-2 hover:bg-muted cursor-pointer">
                    <div className="flex items-center gap-3">
                        <Icon icon="ic:outline-lock" className="size-5 text-muted-foreground" />
                        <span className="text-[13px] font-medium">La conexión es segura</span>
                    </div>
                    <Icon icon="ic:round-chevron-right" className="size-5 text-muted-foreground" />
                </div>

                <div className="h-px bg-border my-2 mx-4" />

                <div className="space-y-1">
                    <PermissionRow
                        icon="ic:outline-videocam"
                        title="Cámara"
                        subtitle="El acceso está bloqueado"
                        highlight={true} 
                    />
                    <PermissionRow
                        icon="ic:outline-mic"
                        title="Micrófono"
                        subtitle="Está en uso"
                    />
                    <PermissionRow
                        icon="ic:outline-open-in-new"
                        title="Ventanas emergentes"
                        subtitle="Se permite (predeterminado)"
                    />
                </div>
                
                <div className="h-2" />
            </div>
        </div>
    );
}