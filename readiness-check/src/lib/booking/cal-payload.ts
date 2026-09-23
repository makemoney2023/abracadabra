import { z } from "zod";

const payloadSchema = z.object({
  triggerEvent: z.string(),
  payload: z
    .object({
      uid: z.string().optional(),
      startTime: z.string().optional(),
      endTime: z.string().optional(),
      attendees: z.array(z.object({ email: z.string().optional(), name: z.string().optional() })).optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    })
    .passthrough()
    .optional(),
});

export type CalBookingEvent = {
  kind: "created" | "rescheduled" | "cancelled" | "ignored";
  externalId: string | null;
  startsAt: string | null;
  endsAt: string | null;
  email: string | null;
  name: string | null;
  assessmentToken: string | null;
};

export function parseCalPayload(body: unknown): CalBookingEvent {
  const parsed = payloadSchema.safeParse(body);
  if (!parsed.success) {
    return { kind: "ignored", externalId: null, startsAt: null, endsAt: null, email: null, name: null, assessmentToken: null };
  }
  const kind =
    parsed.data.triggerEvent === "BOOKING_CREATED"
      ? "created"
      : parsed.data.triggerEvent === "BOOKING_RESCHEDULED"
        ? "rescheduled"
        : parsed.data.triggerEvent === "BOOKING_CANCELLED"
          ? "cancelled"
          : "ignored";
  const payload = parsed.data.payload;
  const attendee = payload?.attendees?.[0];
  const meta = payload?.metadata ?? {};
  const token = typeof meta.assessment === "string" ? meta.assessment : null;
  return {
    kind,
    externalId: payload?.uid ?? null,
    startsAt: payload?.startTime ?? null,
    endsAt: payload?.endTime ?? null,
    email: attendee?.email ?? null,
    name: attendee?.name ?? null,
    assessmentToken: token,
  };
}
