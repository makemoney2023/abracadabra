"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { BookingPrefill } from "@/lib/assessment/present";
import { config } from "@/lib/assessment/config";

const Cal = dynamic(() => import("@calcom/embed-react"), { ssr: false });

export function BookingCard({ token, booking }: { token: string; booking: BookingPrefill }) {
  const [opened, setOpened] = useState(false);

  function markOpened() {
    if (opened) return;
    setOpened(true);
    void fetch(`/api/assessments/${token}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: "booking_opened" }),
    });
  }

  return (
    <section className="space-y-4 rounded-lg border border-border p-5">
      <h2 className="font-heading text-2xl tracking-tight">{config.copy.bookingTitle}</h2>
      {booking.calLink ? (
        <div onFocus={markOpened} onMouseDown={markOpened}>
          <Cal
            calLink={booking.calLink}
            style={{ width: "100%", height: "100%", overflow: "auto" }}
            config={{
              name: booking.prefill.name,
              email: booking.prefill.email,
              "metadata[assessment]": booking.prefill.assessment,
              "metadata[domain]": booking.prefill.domain,
              "metadata[band]": booking.prefill.band,
              "metadata[pressure]": booking.prefill.pressure,
            }}
          />
        </div>
      ) : (
        <a
          href={booking.mailto}
          onClick={markOpened}
          className="bg-primary text-primary-foreground inline-flex min-h-11 items-center rounded-md px-4 text-sm font-medium"
        >
          Open a brief
        </a>
      )}
      <p className="text-sm text-muted-foreground">
        Prefer email?{" "}
        <a className="underline" href={booking.mailto} onClick={markOpened}>
          Write dev@pirx.ca
        </a>
      </p>
    </section>
  );
}
