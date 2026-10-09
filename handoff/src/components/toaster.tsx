"use client";

import { Toaster as Sonner } from "sonner";

/**
 * One toast host for HQ. Sonner already announces new toasts with
 * aria-live="polite" on its region.
 */
export function Toaster() {
  return (
    <Sonner
      theme="dark"
      position="bottom-right"
      closeButton
      duration={4000}
      containerAriaLabel="Notifications"
      toastOptions={{
        classNames: {
          toast: "border-border bg-card text-foreground shadow-lg",
          title: "font-medium text-foreground",
          description: "text-muted-foreground",
          closeButton: "border-border bg-card text-foreground",
        },
      }}
    />
  );
}
