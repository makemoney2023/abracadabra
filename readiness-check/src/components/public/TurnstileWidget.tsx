"use client";

import { useEffect, useRef } from "react";

type TurnstileApi = {
  render: (
    element: HTMLElement,
    options: { sitekey: string; callback: (token: string) => void },
  ) => string;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

export function TurnstileWidget({ onToken }: { onToken: (token: string) => void }) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const host = useRef<HTMLDivElement>(null);
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    if (!siteKey || !host.current) return;
    const element = host.current;
    let widgetId = "";
    let cancelled = false;

    function render() {
      if (cancelled || !window.turnstile || !siteKey) return;
      widgetId = window.turnstile.render(element, {
        sitekey: siteKey,
        callback: (token) => onTokenRef.current(token),
      });
    }

    if (window.turnstile) {
      render();
    } else {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
      const script = existing ?? document.createElement("script");
      script.src = SCRIPT;
      script.async = true;
      script.addEventListener("load", render);
      if (!existing) document.head.appendChild(script);
    }

    return () => {
      cancelled = true;
      if (widgetId) element.replaceChildren();
    };
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={host} className="min-h-16" />;
}
