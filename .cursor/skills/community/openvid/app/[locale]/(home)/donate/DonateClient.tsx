"use client";

import { Icon } from "@iconify/react";
import Link from "next/link";
import { useState } from "react";
import { useTranslations } from "next-intl";
import type { DonationMethod } from "./page";

interface DonateClientProps {
  methods: DonationMethod[];
  defaultMethod: string;
}

export default function DonateClient({ methods, defaultMethod }: DonateClientProps) {
  const t = useTranslations("donation.page");
  const [selected, setSelected] = useState<string | null>(defaultMethod);
  const [copied, setCopied] = useState<string | null>(null);
  const [qrModalSrc, setQrModalSrc] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    const cleanText = text.replace(/\s/g, '');
    navigator.clipboard.writeText(cleanText);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen bg-black text-white overflow-hidden pt-24 pb-16 relative">
      <div className="max-w-2xl mx-auto px-4">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-white/70 hover:text-white mb-12 transition-colors group font-medium" aria-label={t("backHome")}>
          <Icon icon="lucide:arrow-left" width="16" className="group-hover:-translate-x-1 transition-transform" aria-hidden="true" />
          {t("backHome")}
        </Link>

        <div className="mb-10">
          <h1 className="text-2xl font-semibold text-white mb-2 tracking-tight">{t("title")}</h1>
          <p className="text-white/60 text-sm leading-relaxed max-w-lg">{t("description")}</p>
        </div>

        <div className="flex flex-col bg-[#0A0A0A] border border-white/10 squircle-element-camera overflow-hidden shadow-2xl" role="region" aria-label={t("methods")}>
          <div className="px-5 py-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/60">
              {t("methods")}
            </span>
            <Icon icon="lucide:shield-check" width="14" className="text-white/30" />
          </div>

          <div className="flex flex-col">
            {methods.map((method) => (
              <div key={method.id} className="border-b border-white/5 last:border-0">
                <button 
                  onClick={() => setSelected(selected === method.id ? null : method.id)} 
                  className="w-full flex items-center justify-between p-5 text-left transition-colors hover:bg-white/5 group"
                  aria-expanded={selected === method.id}
                  aria-controls={`method-${method.id}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-9 h-9 rounded bg-[#1C1C1F] border border-white/10 flex items-center justify-center shrink-0 overflow-hidden group-hover:border-white/20 transition-colors" aria-hidden="true">
                      {method.image ? (
                        <img src={method.image} alt={method.name} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                      ) : (
                        <Icon icon={method.icon || ""} width="18" style={{ color: method.color }} className="opacity-80 group-hover:opacity-100 transition-opacity" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium text-white/90 group-hover:text-white transition-colors">{method.name}</span>
                        <span className="text-[9px] uppercase tracking-wider text-white/70 border border-white/10 px-1.5 py-0.5 rounded font-medium">
                          {method.tagline}
                        </span>
                      </div>
                      <p className="text-[11px] text-white/70">{method.detail}</p>
                    </div>
                  </div>
                  <Icon icon="lucide:chevron-down" width="16" className={`text-white/30 shrink-0 transition-transform duration-300 ${selected === method.id ? "rotate-180 text-white/70" : ""}`} aria-hidden="true" />
                </button>

                {selected === method.id && (
                  <div className="bg-[#131315] border-t border-white/5 px-5 py-6 animate-in fade-in slide-in-from-top-2 duration-200" id={`method-${method.id}`} role="region">
                    {method.id === "yape" && (
                      <div className="space-y-4 max-w-md">
                        <div className="flex flex-col items-center p-5 bg-black border border-white/10 rounded-lg">
                          <button onClick={() => setQrModalSrc(method.qrImage || null)} className="relative w-32 h-32 bg-white rounded flex items-center justify-center overflow-hidden cursor-pointer group hover:ring-2 hover:ring-white/20 transition-all" aria-label={`${t("scanQR")} - QR code for Yape payment`}>
                            <img src={method.qrImage} alt="" className="w-full h-full object-contain" />
                            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
                              <Icon icon="lucide:zoom-in" width="24" className="text-black opacity-0 group-hover:opacity-60" aria-hidden="true" />
                            </div>
                          </button>
                        </div>
                        <CopyRow label={t("yape.phone")} value={method.phone || ""} copyKey="y-p" copied={copied} onCopy={handleCopy} copyText={t("copy")} copiedText={t("copied")} />
                      </div>
                    )}
                    {method.id === "visa" && (
                      <div className="space-y-3 max-w-md">
                        <CopyRow label={t("visa.account")} value={method.account || ""} copyKey="v-a" copied={copied} onCopy={handleCopy} copyText={t("copy")} copiedText={t("copied")} />
                        <CopyRow label={t("visa.cci")} value={method.cci || ""} copyKey="v-c" copied={copied} onCopy={handleCopy} copyText={t("copy")} copiedText={t("copied")} />
                      </div>
                    )}
                    {method.id === "paypal" && (
                      <div className="space-y-4 max-w-md">
                        <CopyRow label={t("paypal.email")} value={method.email || ""} copyKey="p-e" copied={copied} onCopy={handleCopy} copyText={t("copy")} copiedText={t("copied")} />
                        <div className="flex items-center gap-3">
                          <div className="h-px bg-white/10 flex-1"></div>
                          <span className="text-[11px] uppercase tracking-widest text-white/30 font-medium">{t("alternative")}</span>
                          <div className="h-px bg-white/10 flex-1"></div>
                        </div>
                        <a href={method.link} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-medium text-white transition-colors" aria-label={`${t("paypal.link")} (opens in new window)`}>
                          <Icon icon="lucide:external-link" width="16" className="text-white/60" aria-hidden="true" />
                          {t("openLink")}
                        </a>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {qrModalSrc && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200" 
          onClick={() => setQrModalSrc(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="qr-modal-title"
        >
          <div className="relative w-full max-w-sm bg-[#131315] border border-white/10 rounded-2xl p-6 shadow-2xl flex flex-col items-center animate-in zoom-in-95 duration-200" onClick={(e) => e.stopPropagation()}>
            <div className="w-full flex justify-between items-center mb-6">
              <span className="text-sm font-semibold text-white/90 tracking-wide" id="qr-modal-title">{t("scanQR")}</span>
              <button onClick={() => setQrModalSrc(null)} className="text-white/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-full p-1.5 transition-colors" aria-label="Close modal">
                <Icon icon="lucide:x" width="18" aria-hidden="true" />
              </button>
            </div>
            <div className="w-full aspect-square bg-white squircle-e overflow-hidden flex items-center justify-center p-2">
              <img src={qrModalSrc} alt="QR code enlarged for scanning" className="w-full h-full object-contain" />
            </div>
            <button onClick={() => setQrModalSrc(null)} className="mt-6 w-full py-2.5 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 text-sm font-medium text-white transition-colors">
              {t("close")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

interface CopyRowProps {
  label: string;
  value: string;
  copyKey: string;
  copied: string | null;
  onCopy: (val: string, key: string) => void;
  copyText: string;
  copiedText: string;
}

function CopyRow({ label, value, copyKey, copied, onCopy, copyText, copiedText }: CopyRowProps) {
  return (
    <div className="flex items-center justify-between bg-black border border-white/10 rounded-lg p-3 group">
      <div>
        <p className="text-[11px] uppercase tracking-wider text-white/70 mb-1 font-medium" id={`label-${copyKey}`}>{label}</p>
        <p className="font-mono text-sm text-white/90 tracking-wide" aria-labelledby={`label-${copyKey}`}>{value}</p>
      </div>
      <button 
        onClick={() => onCopy(value, copyKey)} 
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded border transition-all text-xs font-medium ${
          copied === copyKey 
            ? "border-green-500/30 bg-green-500/10 text-green-400" 
            : "border-white/10 bg-white/5 text-white/70 hover:text-white hover:bg-white/10"
        }`}
        aria-label={`${copied === copyKey ? copiedText : copyText} ${label}`}
        aria-live="polite"
      >
        <Icon icon={copied === copyKey ? "lucide:check" : "lucide:copy"} width="14" aria-hidden="true" />
        {copied === copyKey ? copiedText : copyText}
      </button>
    </div>
  );
}