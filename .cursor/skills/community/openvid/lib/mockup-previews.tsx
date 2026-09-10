// ── Browser Previews 
export function NonePreview() {
    return (
        <div className="absolute top-4 left-4 w-[160%] h-[160%] bg-[#f9f9f9] rounded-tl-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] border-t border-l border-white/20 flex flex-col overflow-hidden">
            <div className="flex-1 bg-[#f9f9f9]"></div>
        </div>
    );
}

export function MacosPreview() {
    return (
        <div className="absolute top-4 left-4 sm:top-5 sm:left-5 w-[160%] h-[160%] bg-[#f9f9f9] rounded-tl-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] border-t border-l border-white/40 flex flex-col">
            <div className="h-6 sm:h-7 bg-[#f6f6f6] flex items-center px-3 justify-between border-b border-gray-300 rounded-tl-lg">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-2 h-2 rounded-full bg-[#FF5F56] border-[0.5px] border-[#E0443E]"></div>
                        <div className="w-2 h-2 rounded-full bg-[#FFBD2E] border-[0.5px] border-[#DEA123]"></div>
                        <div className="w-2 h-2 rounded-full bg-[#27C93F] border-[0.5px] border-[#1AAB29]"></div>
                    </div>
                    <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                        <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                        <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    </div>
                </div>
                <div className="flex-1 max-w-[50%] mx-2">
                    <div className="bg-white rounded h-3 w-full flex items-center px-1.5 gap-1 border border-gray-300/50 shadow-sm">
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full flex-shrink-0"></div>
                        <div className="w-full h-1 bg-gray-200 rounded"></div>
                    </div>
                </div>
                <div className="flex gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-[1px] bg-gray-300"></div>
                    <div className="w-1.5 h-1.5 rounded-[1px] bg-gray-300"></div>
                </div>
            </div>
            <div className="flex-1 bg-[#f9f9f9] relative"></div>
        </div>
    );
}

export function OutlinePreview() {
    return (
        <div className="absolute top-6 left-5 w-[160%] h-[155%] bg-[#f9f9f9] rounded-tl-xl shadow-[0_10px_40px_rgba(0,0,0,0.12)] flex flex-col overflow-hidden outline-1 outline-gray-300 outline-offset-7">

            <div className="flex-1 bg-[#f9f9f9] relative"></div>

        </div>
    );
}

export function MacosGlassPreview() {
    return (
        <div className="absolute top-3 left-3 w-[165%] h-[165%] rounded-tl-xl flex flex-col glass-border">
            <div className="w-full h-full rounded-tl-lg overflow-hidden flex flex-col bg-[#f9f9f9] shadow-[0_0_30px_rgba(0,0,0,0.4)]" style={{ borderTop: "1px solid rgba(255,255,255,0.6)", borderLeft: "1px solid rgba(255,255,255,0.6)" }}>
                <div className="h-6 bg-[#f6f6f6] flex items-center px-3 justify-between border-b border-gray-300 flex-shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="flex gap-1.5">
                            <div className="w-2 h-2 rounded-full bg-[#FF5F56] border-[0.5px] border-[#E0443E]"></div>
                            <div className="w-2 h-2 rounded-full bg-[#FFBD2E] border-[0.5px] border-[#DEA123]"></div>
                            <div className="w-2 h-2 rounded-full bg-[#27C93F] border-[0.5px] border-[#1AAB29]"></div>
                        </div>
                        <div className="flex gap-1">
                            <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                            <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                            <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                        </div>
                    </div>
                    <div className="flex-1 max-w-[50%] mx-2">
                        <div className="bg-white rounded h-3 w-full flex items-center px-1.5 gap-1 border border-gray-300/50 shadow-sm">
                            <div className="w-1.5 h-1.5 bg-gray-300 rounded-full flex-shrink-0"></div>
                            <div className="w-full h-1 bg-gray-200 rounded"></div>
                        </div>
                    </div>
                    <div className="flex gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-[1px] bg-gray-300"></div>
                        <div className="w-1.5 h-1.5 rounded-[1px] bg-gray-300"></div>
                    </div>
                </div>
                <div className="flex-1 bg-[#f9f9f9]"></div>
            </div>
        </div>
    );
}

export function GlassUIContainerPreview() {
    return (
        <div className="absolute top-4 left-4 w-[160%] h-[160%] rounded-tl-2xl border-t border-l border-white/30 shadow-[0_0_30px_rgba(0,0,0,0.5)] flex flex-col p-1.5" style={{ background: "rgba(255,255,255,0.2)" }}>
            <div className="flex-1 bg-[#f9f9f9] squircle-element-camera border border-white/10 shadow-inner"></div>
        </div>
    );
}

export function MacosGhostPreview() {
    return (
        <div className="absolute top-4 left-4 w-[160%] h-[160%] bg-[#f9f9f9] rounded-tl-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] border-t border-l border-white/40 flex flex-col">
            <div className="h-6 bg-[#f6f6f6] flex items-center px-3 justify-between border-b border-gray-300 rounded-tl-lg">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-2 h-2 rounded-full border border-gray-400"></div>
                        <div className="w-2 h-2 rounded-full border border-gray-400"></div>
                        <div className="w-2 h-2 rounded-full border border-gray-400"></div>
                    </div>
                    <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                        <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                        <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    </div>
                </div>
                <div className="flex-1 max-w-[50%] mx-2">
                    <div className="bg-white rounded h-3 w-full flex items-center px-1.5 gap-1 border border-gray-300/50 shadow-sm">
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full flex-shrink-0"></div>
                        <div className="w-full h-1 bg-gray-200 rounded"></div>
                    </div>
                </div>
                <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                </div>
            </div>
            <div className="flex-1 bg-[#f9f9f9]"></div>
        </div>
    );
}

export function MacosGhostGlassPreview() {
    return (
        <div className="absolute top-3 left-3 w-[165%] h-[165%] rounded-tl-xl flex flex-col glass-border">
            <div className="h-6 bg-[#f6f6f6] flex items-center px-3 justify-between border-b border-gray-300 rounded-tl-lg">
                <div className="flex items-center gap-2">
                    <div className="flex gap-1.5">
                        <div className="w-2 h-2 rounded-full border border-gray-400"></div>
                        <div className="w-2 h-2 rounded-full border border-gray-400"></div>
                        <div className="w-2 h-2 rounded-full border border-gray-400"></div>
                    </div>
                    <div className="flex gap-1">
                        <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                        <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                        <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    </div>
                </div>
                <div className="flex-1 max-w-[50%] mx-2">
                    <div className="bg-white rounded h-3 w-full flex items-center px-1.5 gap-1 border border-gray-300/50 shadow-sm">
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full flex-shrink-0"></div>
                        <div className="w-full h-1 bg-gray-200 rounded"></div>
                    </div>
                </div>
                <div className="flex gap-1">
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                </div>
            </div>
            <div className="flex-1 bg-[#f9f9f9]"></div>
        </div>
    );
}

export function MacosContainerGlassPreview() {
    return (
        <div className="absolute top-3 left-3 w-[165%] h-[165%] rounded-tl-xl flex flex-col glass-border">
            <div className="flex gap-1 mb-1 px-0.5">
                <div className="w-1.5 h-1.5 rounded-full bg-white shadow-2xs"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-white shadow-2xs"></div>
                <div className="w-1.5 h-1.5 rounded-full bg-white shadow-2xs"></div>
            </div>
            <div className="flex-1 bg-[#f9f9f9] rounded-lg border border-white/40 shadow-inner"></div>
        </div>
    );
}

export function BravePreview() {
    return (
        <div className="absolute top-4 left-4 w-[160%] h-[160%] bg-[#f9f9f9] rounded-tl-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] border-t border-l border-white/40 flex flex-col">
            <div className="h-6 bg-[#f3f3f3] flex items-center justify-between border-b border-gray-300 rounded-tl-lg">
                <div className="flex items-center gap-1.5 px-2 text-gray-400">
                    <div className="w-2 h-2 bg-gray-300 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-sm"></div>
                </div>
                <div className="flex-1 max-w-[50%] mx-1.5">
                    <div className="bg-white rounded h-3 w-full flex items-center px-1.5 gap-1 border border-gray-200 shadow-sm">
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full flex-shrink-0"></div>
                        <div className="w-full h-1 bg-gray-200 rounded"></div>
                        <div className="w-1.5 h-1.5 bg-yellow-400/70 rounded-full flex-shrink-0"></div>
                    </div>
                </div>
                <div className="flex items-center h-full">
                    <div className="flex gap-1 px-1.5">
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-sm"></div>
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-sm"></div>
                    </div>
                    <div className="flex h-full">
                        <div className="w-4 h-full flex items-center justify-center bg-gray-100/80">
                            <div className="w-2 h-0.5 bg-gray-400"></div>
                        </div>
                        <div className="w-4 h-full flex items-center justify-center bg-gray-100/80">
                            <div className="w-2 h-2 border border-gray-400"></div>
                        </div>
                        <div className="w-4 h-full flex items-center justify-center bg-gray-100/80">
                            <div className="text-gray-400 text-[6px] font-bold leading-none">✕</div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex-1 bg-[#f9f9f9]"></div>
        </div>
    );
}

export function BraveGlassPreview() {
    return (
        <div className="absolute top-3 left-3 w-[165%] h-[165%] rounded-tl-xl flex flex-col glass-border">
            <div className="h-6 bg-[#f3f3f3] flex items-center justify-between border-b border-gray-300 rounded-tl-lg">
                <div className="flex items-center gap-1.5 px-2 text-gray-400">
                    <div className="w-2 h-2 bg-gray-300 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-sm"></div>
                </div>
                <div className="flex-1 max-w-[50%] mx-1.5">
                    <div className="bg-white rounded h-3 w-full flex items-center px-1.5 gap-1 border border-gray-200 shadow-sm">
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-full flex-shrink-0"></div>
                        <div className="w-full h-1 bg-gray-200 rounded"></div>
                        <div className="w-1.5 h-1.5 bg-yellow-400/70 rounded-full flex-shrink-0"></div>
                    </div>
                </div>
                <div className="flex items-center h-full">
                    <div className="flex gap-1 px-1.5">
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-sm"></div>
                        <div className="w-1.5 h-1.5 bg-gray-300 rounded-sm"></div>
                    </div>
                    <div className="flex h-full">
                        <div className="w-4 h-full flex items-center justify-center bg-gray-100/80">
                            <div className="w-2 h-0.5 bg-gray-400"></div>
                        </div>
                        <div className="w-4 h-full flex items-center justify-center bg-gray-100/80">
                            <div className="w-2 h-2 border border-gray-400"></div>
                        </div>
                        <div className="w-4 h-full flex items-center justify-center bg-gray-100/80">
                            <div className="text-gray-400 text-[6px] font-bold leading-none">✕</div>
                        </div>
                    </div>
                </div>
            </div>
            <div className="flex-1 bg-[#f9f9f9]"></div>
        </div>
    );
}

export function BrowserTabGlassPreview() {
    return (
        <div className="absolute top-4 left-4 w-[160%] h-[160%] rounded-tl-2xl border-t border-l border-white/40 shadow-[0_0_30px_rgba(0,0,0,0.4)] flex flex-col overflow-hidden">
            <div className="h-6 flex items-end px-4 gap-1">
                <div className="bg-white/40 border-t border-x border-white/50 rounded-t-lg h-4 w-20 flex items-center justify-between px-2 shadow-sm">
                    <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-white shadow-[0_0_5px_rgba(96,165,250,0.5)]"></div>
                        <div className="w-10 h-0.5 bg-gray-200 rounded-full"></div>
                    </div>
                    <div className="w-1 h-1 rounded-full bg-gray-50 flex items-center justify-center"></div>
                </div>
                <div className="mb-0.5 w-3.5 h-3.5 rounded-full bg-white/20 border border-white/30 flex items-center justify-center shadow-sm">
                    <span className="text-[11px] text-white/80 flex items-center justify-center h-full w-full -mt-[1px]">+</span>
                </div>
            </div>
            <div className="flex-1 bg-[#f9f9f9] border-t border-white/30 shadow-inner"></div>
        </div>
    );
}

export function ChromePreview() {
    return (
        <div className="absolute top-4 left-4 w-[160%] h-[160%] bg-white rounded-tl-lg shadow-[0_0_30px_rgba(0,0,0,0.5)] border-t border-l border-white/40 flex flex-col overflow-hidden">
            <div className="h-4 bg-[#dee1e6] flex items-end flex-shrink-0">
                <div className="bg-white h-[14px] px-2 ml-1.5 rounded-t flex items-center gap-1 min-w-[50px] border-t border-x border-gray-300/50">
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                    <div className="w-8 h-1 bg-gray-300 rounded"></div>
                    <div className="w-1.5 h-1.5 bg-gray-300 rounded-full flex-shrink-0"></div>
                </div>
                <div className="ml-auto flex h-full">
                    <div className="w-4 h-full flex items-center justify-center"><div className="w-2 h-0.5 bg-gray-500"></div></div>
                    <div className="w-4 h-full flex items-center justify-center"><div className="w-2 h-2 border border-gray-500"></div></div>
                    <div className="w-4 h-full flex items-center justify-center"><div className="text-gray-500 text-[6px] font-bold leading-none">✕</div></div>
                </div>
            </div>
            <div className="h-5 bg-white flex items-center px-1.5 gap-1 border-b border-gray-200 flex-shrink-0">
                <div className="flex gap-0.5">
                    <div className="w-2 h-2 bg-gray-400 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-sm"></div>
                </div>
                <div className="flex-1 mx-1">
                    <div className="bg-[#f1f3f4] rounded-full h-3 w-full flex items-center px-1.5 gap-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0"></div>
                        <div className="w-full h-1 bg-gray-300 rounded"></div>
                    </div>
                </div>
                <div className="flex gap-0.5">
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                </div>
            </div>
            <div className="flex-1 bg-white"></div>
        </div>
    );
}

export function ChromeGlassPreview() {
    return (
        <div className="absolute top-3 left-3 w-[165%] h-[165%] rounded-tl-xl flex flex-col glass-border">
            <div className="h-4 bg-[#dee1e6] flex items-end flex-shrink-0 border-t border-l border-white rounded-tl-lg">
                <div className="bg-white h-[14px] px-2 ml-1.5 rounded-t flex items-center gap-1 min-w-[50px] border-t border-x border-gray-300/50">
                    <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0"></div>
                    <div className="w-8 h-1 bg-gray-300 rounded"></div>
                    <div className="w-1.5 h-1.5 bg-gray-300 rounded-full flex-shrink-0"></div>
                </div>
                <div className="ml-auto flex h-full">
                    <div className="w-4 h-full flex items-center justify-center"><div className="w-2 h-0.5 bg-gray-500"></div></div>
                    <div className="w-4 h-full flex items-center justify-center"><div className="w-2 h-2 border border-gray-500"></div></div>
                    <div className="w-4 h-full flex items-center justify-center"><div className="text-gray-500 text-[6px] font-bold leading-none">✕</div></div>
                </div>
            </div>
            <div className="h-5 bg-white flex items-center px-1.5 gap-1 border-b border-gray-200 flex-shrink-0">
                <div className="flex gap-0.5">
                    <div className="w-2 h-2 bg-gray-400 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-sm"></div>
                </div>
                <div className="flex-1 mx-1">
                    <div className="bg-[#f1f3f4] rounded-full h-3 w-full flex items-center px-1.5 gap-1">
                        <div className="w-1.5 h-1.5 bg-gray-400 rounded-full flex-shrink-0"></div>
                        <div className="w-full h-1 bg-gray-300 rounded"></div>
                    </div>
                </div>
                <div className="flex gap-0.5">
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                    <div className="w-2 h-2 bg-gray-200 rounded-sm"></div>
                </div>
            </div>
            <div className="flex-1 bg-white"></div>
        </div>
    );
}

// ── Mobile Previews ─


export function IphoneSlimPreview() {
    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[75px] h-[150px] bg-neutral-800 squircle-element-camera p-[2.5px] shadow-2xl border border-neutral-700 flex flex-col z-20">
            <div className="absolute -left-[1px] top-6 w-[1.5px] h-3 bg-neutral-700 rounded-l-sm border-y border-l border-neutral-800 shadow-sm"></div>
            <div className="absolute -left-[1px] top-10 w-[1.5px] h-6 bg-neutral-700 rounded-l-sm border-y border-l border-neutral-800 shadow-sm"></div>
            <div className="absolute -right-[1px] top-12 w-[1.5px] h-8 bg-neutral-700 rounded-r-sm border-y border-r border-neutral-800 shadow-sm"></div>
            <div className="relative w-full h-full bg-white rounded-lg overflow-hidden flex flex-col border border-black shadow-inner">
                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-6 h-1 bg-black rounded-full z-20 flex items-center justify-between px-0.5">
                    <div className="w-0.5 h-0.5 bg-neutral-500 rounded-full"></div>
                    <div className="w-0.5 h-0.5 bg-indigo-500 rounded-full blur-[0.2px]"></div>
                </div>
                <div className="absolute top-0 w-full h-3 flex items-center justify-between px-2 z-20">
                    <span className="text-[4px] font-bold text-black tracking-tight scale-75 origin-left">9:41</span>
                    <div className="flex items-center gap-0.5 scale-[0.4] origin-right">
                        <div className="flex items-end gap-[0.5px] h-2">
                            <div className="w-[1.5px] h-full bg-black rounded-full"></div>
                        </div>
                        <div className="w-4 h-2 border border-black rounded-[1px] relative">
                            <div className="h-full w-[80%] bg-black rounded-[0.5px]"></div>
                        </div>
                    </div>
                </div>
                <div className="w-full h-full bg-neutral-50 relative"></div>
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-black/10 rounded-full z-10"></div>
            </div>
        </div>
    );
}

export function GlassCurvePreview() {
    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[75px] h-[150px] bg-white/40 backdrop-blur-xl rounded-t-xl p-[3px] shadow-2xl border border-white/70 overflow-hidden z-20">
            <div className="absolute inset-y-0 left-0 w-2 bg-gradient-to-r from-white/20 to-transparent z-10"></div>
            <div className="absolute inset-y-0 right-0 w-2 bg-gradient-to-l from-white/20 to-transparent z-10"></div>
            <div className="relative w-full h-full bg-white rounded-t-lg overflow-hidden shadow-inner flex flex-col">
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 w-4 h-0.5 bg-black/10 rounded-full z-20"></div>
                <div className="w-full h-full bg-white"></div>
            </div>
        </div>
    );
}
export function GlassFullPreview() {
    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[75px] h-[150px] bg-white/40 backdrop-blur-xl squircle-element-camera p-[2.5px] shadow-2xl border border-white/70 flex flex-col z-20">

            {/* Botones de Volumen (Izquierda) */}
            <div className="absolute -left-[2px] top-7 w-[2px] h-3 bg-white/60 rounded-l-sm border-y border-l border-white/40 shadow-sm z-10"></div>
            <div className="absolute -left-[2px] top-11 w-[2px] h-6 bg-white/60 rounded-l-sm border-y border-l border-white/40 shadow-sm z-10"></div>

            {/* Botón de Encendido (Derecha) */}
            <div className="absolute -right-[2px] top-14 w-[2px] h-9 bg-white/60 rounded-r-sm border-y border-r border-white/40 shadow-sm z-10"></div>

            {/* Cuerpo Interno */}
            <div className="relative w-full h-full bg-[#f9f9f9] rounded-[9px] overflow-hidden shadow-inner border border-black/5 flex flex-col">

                {/* Notch / Sensores */}
                <div className="absolute top-1 left-1/2 -translate-x-1/2 w-6 h-1.5 bg-black/5 rounded-full z-20 flex items-center justify-between px-0.5">
                    <div className="w-0.5 h-0.5 bg-neutral-400 rounded-full"></div>
                    <div className="w-0.5 h-0.5 bg-indigo-400/50 rounded-full blur-[0.2px]"></div>
                </div>

                {/* Status Bar */}
                <div className="absolute top-0 w-full h-3 flex items-center justify-between px-2 z-20">
                    <span className="text-[4px] font-bold text-black/40 scale-75 origin-left">9:41</span>
                    <div className="flex items-center gap-0.5 scale-[0.4] origin-right opacity-40">
                        <div className="w-4 h-2 border border-black rounded-[1px] relative">
                            <div className="h-full w-[80%] bg-black rounded-[0.5px]"></div>
                        </div>
                    </div>
                </div>

                {/* Pantalla */}
                <div className="w-full h-full bg-neutral-50"></div>

                {/* Home Indicator */}
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-black/5 rounded-full z-10"></div>
            </div>
        </div>
    );
}

export function HardShellPreview() {
    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[75px] h-[155px] text-black bg-zinc-200 rounded-md p-[2.5px] shadow-2xl border border-zinc-400 flex items-center justify-center z-20">
            <div className="absolute -right-[2px] top-6 w-[1.5px] h-3 bg-slate-50 rounded-r-sm border border-zinc-300"></div>
            <div className="absolute -right-[2px] top-11 w-[1.5px] h-2 bg-slate-50 rounded-r-sm border border-zinc-300"></div>
            <div className="relative w-full h-full bg-black rounded-[4px] p-[1.5px] overflow-hidden flex items-center justify-center">
                <div className="relative w-full h-full bg-slate-50 rounded-[2px] flex flex-col overflow-hidden">
                    <div className="absolute top-1 left-1/2 -translate-x-1/2 size-1 bg-black rounded-full z-20"></div>
                    <div className="w-full h-4 flex items-center justify-between z-10 scale-[0.7] origin-top">
                        <span className="text-[8px] font-medium">11:43</span>
                        <div className="flex items-center gap-0.5">
                            <div className="w-2.5 h-1.5 border border-black rounded-[1px]"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export function S24UltraPreview() {
    return (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-[75px] h-[150px] text-black bg-neutral-900 rounded-lg p-[2.5px] shadow-2xl border border-neutral-700 flex flex-col z-20">
            <div className="absolute -right-[1px] top-6 w-[1px] h-3 bg-neutral-500 rounded-r-sm border border-neutral-800"></div>
            <div className="absolute -right-[1px] top-11 w-[1px] h-5 bg-neutral-500 rounded-r-sm border border-neutral-800"></div>
            <div className="relative w-full h-full bg-white rounded-md overflow-hidden flex flex-col border border-black shadow-inner">
                <div className="absolute top-1 left-1/2 -translate-x-1/2 size-1 bg-black rounded-full z-20"></div>
                <div className="w-full h-4 flex items-center justify-between z-10 scale-[0.7] origin-top">
                    <span className="text-[8px] font-medium">11:43</span>
                    <div className="flex items-center gap-0.5">
                        <div className="w-2.5 h-1.5 border border-black rounded-[1px]"></div>
                    </div>
                </div>
                <div className="absolute bottom-1 w-full flex items-center justify-center gap-3 opacity-20 scale-50">
                    <div className="w-2 h-2 border border-black"></div>
                    <div className="w-2 h-2 border border-black rounded-full"></div>
                    <div className="w-2 h-2 border-l border-b border-black rotate-45"></div>
                </div>
            </div>
        </div>
    );
}

// ── IDE Previews ────

export function VSCodePreview() {
    return (
        <div className="absolute top-4 left-4 w-[160%] h-[160%] bg-[#1e1e1e] rounded-lg shadow-2xl border border-white/10 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-2 h-7 bg-[#181818] border-b border-white/5">
                <div className="flex items-center gap-1.5 scale-75 origin-left">
                    <div className="text-blue-500">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M23.15 2.587L18.21.21a1.494 1.494 0 0 0-1.705.29l-9.46 8.63-4.12-3.128a.999.999 0 0 0-1.276.057L.327 7.261A1 1 0 0 0 .326 8.74L3.899 12 .326 15.26a1 1 0 0 0 0 1.479l1.323 1.202a.999.999 0 0 0 1.277.058l4.12-3.128 9.46 8.63a1.492 1.492 0 0 0 1.704.29l4.942-2.377A1.5 1.5 0 0 0 24 20.06V3.939a1.5 1.5 0 0 0-.85-1.352zm-5.146 14.861L10.826 12l7.178-5.448v10.896z" />
                        </svg>
                    </div>
                    <div className="flex gap-2 text-[#cccccc] text-[9px]">
                        <span>File</span><span>Edit</span><span>Selection</span>
                    </div>
                </div>
                <div className="flex-1 flex justify-center px-4">
                    <div className="w-full max-w-[100px] h-[16px] bg-[#2b2b2b] border border-white/10 rounded flex items-center justify-center gap-1">
                        <div className="w-1.5 h-1.5 border border-neutral-500 rounded-full"></div>
                        <div className="w-8 h-0.5 bg-neutral-600 rounded-full"></div>
                    </div>
                </div>
                <div className="flex items-center gap-2 scale-75 origin-right pr-1">
                    <div className="w-2 h-[1px] bg-neutral-500"></div>
                    <div className="w-2 h-2 border border-neutral-500"></div>
                    <div className="w-2 h-2 flex items-center justify-center text-neutral-500">×</div>
                </div>
            </div>
            <div className="flex-1 bg-[#1e1e1e]"></div>
        </div>
    );
}

export function MacosDarkPreview() {
    return (
        <div className="absolute top-4 left-4 w-[160%] h-[160%] bg-[#1e1e1e] rounded-lg shadow-2xl border border-white/10 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-2 h-7 bg-[#181818] border-b border-white/5">
                <div className="flex items-center gap-2 scale-75 origin-left">
                    <div className="flex gap-1.5 px-1">
                        <div className="w-2 h-2 rounded-full bg-[#ff5f57] border border-[#e0443e]"></div>
                        <div className="w-2 h-2 rounded-full bg-[#febc2e] border border-[#d89f24]"></div>
                        <div className="w-2 h-2 rounded-full bg-[#28c840] border border-[#1aab29]"></div>
                    </div>
                    <div className="flex gap-2 text-[#999999] text-[9px] ml-1">
                        <span>File</span><span>Edit</span><span>Selection</span>
                    </div>
                </div>
                <div className="flex-1 flex justify-center px-4">
                    <div className="w-full max-w-[100px] h-[16px] bg-[#2b2b2b] border border-white/10 rounded flex items-center justify-center gap-1">
                        <div className="w-1.5 h-1.5 border border-neutral-500 rounded-full"></div>
                        <div className="w-8 h-0.5 bg-neutral-600 rounded-full"></div>
                    </div>
                </div>
                <div className="w-10"></div>
            </div>
            <div className="flex-1 bg-[#1e1e1e]"></div>
        </div>
    );
}

export function MacosGhostIdePreview() {
    return (
        <div className="absolute top-4 left-4 w-[160%] h-[160%] bg-[#1e1e1e] rounded-lg shadow-2xl border border-white/10 flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-2 h-7 bg-[#181818] border-b border-white/5">
                <div className="flex items-center gap-2 scale-75 origin-left">
                    <div className="flex gap-1.5 px-1">
                        <div className="w-2 h-2 rounded-full border border-white/40 bg-transparent"></div>
                        <div className="w-2 h-2 rounded-full border border-white/40 bg-transparent"></div>
                        <div className="w-2 h-2 rounded-full border border-white/40 bg-transparent"></div>
                    </div>
                    <div className="flex gap-2 text-[#999999] text-[9px] ml-1">
                        <span>File</span><span>Edit</span><span>Selection</span>
                    </div>
                </div>
                <div className="flex-1 flex justify-center px-4">
                    <div className="w-full max-w-[100px] h-[16px] bg-[#2b2b2b] border border-white/10 rounded flex items-center justify-center gap-1">
                        <div className="w-1.5 h-1.5 border border-neutral-500 rounded-full"></div>
                        <div className="w-8 h-0.5 bg-neutral-600 rounded-full"></div>
                    </div>
                </div>
                <div className="w-10"></div>
            </div>
            <div className="flex-1 bg-[#1e1e1e]"></div>
        </div>
    );
}

export function MacBookPreview() {
    return (
        <img
            src="/images/mockups/macbook-preview.webp"
            alt="MacBook"
            draggable={false}
            className="w-full h-full object-contain scale-90"
        />
    );
}