"use client";

import { useRecording } from "@/app/contexts/RecordingContext";
import FloatingCameraPreview from "./FloatingCameraPreview";
import { useTranslations } from "next-intl";

export default function RecordingOverlay() {
    const t = useTranslations('recording.overlay');
    const {
        state,
        countdown,
        recordingTime,
        stopRecording,
        isCountdown,
        isRecording,
        isProcessing,
        cameraStream,
        cameraConfig,
        updateCameraConfig,
    } = useRecording();

    if (state === "idle") return null;

    const showFloatingCamera = isCountdown && cameraStream && cameraConfig?.enabled;

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="fixed inset-0 z-9999 pointer-events-none">
            {showFloatingCamera && cameraStream && cameraConfig && (
                <FloatingCameraPreview
                    stream={cameraStream}
                    config={cameraConfig}
                    onConfigChange={updateCameraConfig}
                />
            )}
            {isCountdown && (
                <div className="absolute inset-0 bg-[#000B13]/95 backdrop-blur-md flex items-center justify-center z-50 pointer-events-auto">
                    <div className="flex flex-col items-center scale-110">
                        <div className="relative w-44 h-44 flex items-center justify-center">
                            <div className="absolute inset-0 rounded-full bg-[#00A3FF]/30 animate-ping" />
                            <div className="absolute inset-2 rounded-full bg-[#00A3FF]/20 animate-[ping_2s_linear_infinite]" />
                            <div className="relative w-40 h-40 rounded-full bg-gradient-primary p-1 shadow-[0_0_50px_rgba(0,163,255,0.3)]">
                                <div className="w-full h-full rounded-full bg-[#0E0E12] flex items-center justify-center">
                                    <span className="text-8xl font-bold text-white tabular-nums tracking-tighter">
                                        {countdown}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="text-center mt-12 space-y-3">
                            <h2 className="text-3xl font-bold text-white animate-pulse tracking-tight">
                                {t('countdown.title')}
                            </h2>
                            <p className="text-lg text-neutral-400 max-w-sm mx-auto px-4">
                                {t('countdown.subtitle')}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {isRecording && (
                <div className="absolute top-20 left-1/2 -translate-x-1/2 pointer-events-auto">
                    <div className="relative flex items-center gap-5 p-3.5 pl-6 border border-transparent squircle-element-camera transition-all duration-300 min-w-[340px] overflow-hidden focus:outline-none"
                        style={{
                            background: "radial-gradient(ellipse at 50% 0%, rgb(48, 48, 52) 0%, rgb(18, 18, 20) 85%)",
                            boxShadow: `
                            rgba(255, 255, 255, 0.22) 0px 1px 0px 0px inset, 
                            rgba(255, 255, 255, 0.04) 0px 0px 0px 1px, 
                            rgba(0, 0, 0, 0.8) 0px 24px 48px -12px
                        `
                        }}>

                        <div className="absolute top-0 left-1/4 right-1/4 h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none z-20" />

                        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-3/4 h-6 bg-white/5 rounded-full blur-md pointer-events-none z-15" />

                        <div className="absolute -top-4 -left-4 size-20 bg-white/10 rounded-full blur-[15px] pointer-events-none" />

                        <div className="absolute top-0 right-2 bottom-0 hidden h-full w-px bg-gradient-to-b from-transparent via-white/10 to-transparent lg:flex pointer-events-none" />

                        <div className="relative z-10 flex items-center justify-between w-full gap-6">

                            <div className="relative flex items-center gap-5 pr-2">

                                <div className="flex items-center gap-3">
                                    <div className="relative flex size-2.5 items-center justify-center">
                                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
                                        <span className="relative inline-flex rounded-full size-2.5 bg-red-500"></span>
                                    </div>
                                    <span className="text-[11px] text-zinc-300 font-medium tracking-wider uppercase">{t('recording.status')}</span>
                                </div>

                                <div className="h-4 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />

                                <span className="text-base text-white font-mono font-bold tracking-tight">
                                    {formatTime(recordingTime)}
                                </span>
                            </div>

                            <button
                                onClick={stopRecording}
                                className="group flex items-center gap-3.5 px-4 py-2 bg-red-600 hover:bg-red-500 text-white font-medium rounded-lg transition-all duration-200 active:scale-[0.97] cursor-pointer shadow-[0_4px_12px_rgba(220,38,38,0.25)] hover:shadow-[0_4px_16px_rgba(239,68,68,0.4)] border border-transparent"
                                style={{
                                    boxShadow: "rgba(255, 255, 255, 0.3) 0px 1px 0px 0px inset"
                                }}
                                aria-label={t('recording.stop')}
                            >
                                <div className="flex items-center gap-2.5 text-sm font-semibold tracking-wide">
                                    <div className="size-2.5 bg-white rounded-[2px] group-hover:scale-90 transition-transform duration-200" />
                                    {t('recording.stop')}
                                </div>

                                <div className="flex items-center gap-0.5 text-[10px] bg-black/20 text-red-100/90 px-2 py-0.5 rounded border border-black/10 font-medium">
                                    <kbd className="font-sans">Alt</kbd>
                                    <span className="opacity-60">+</span>
                                    <kbd className="font-sans">D</kbd>
                                </div>
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {isProcessing && (
                <div className="absolute inset-0 bg-[#000B13]/95 backdrop-blur-md flex items-center justify-center pointer-events-auto z-50">
                    <div className="text-center">
                        <div className="relative w-20 h-20 mb-8 mx-auto">
                            <div className="absolute inset-0 rounded-full border-4 border-white/5" />
                            <div className="absolute inset-0 rounded-full border-4 border-transparent border-t-[#00A3FF] border-r-[#00A3FF]/30 animate-spin shadow-[0_0_20px_rgba(0,163,255,0.2)]" />
                            <div className="absolute inset-0 rounded-full bg-[#00A3FF]/5 blur-xl" />
                        </div>

                        <div className="space-y-2">
                            <p className="text-2xl font-semibold text-white tracking-tight">
                                {t('processing.title')}
                            </p>
                            <p className="text-neutral-400 font-medium">
                                {t('processing.subtitle')}
                            </p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}