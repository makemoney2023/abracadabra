"use client";

import { useFormStatus } from "react-dom";
import { enterPreview } from "./enter-action";
import { Button } from "@/components/ui/button";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Opening" : "Open Handoff"}
    </Button>
  );
}

export function EnterForm() {
  return (
    <form action={enterPreview} className="flex flex-col gap-3">
      <SubmitButton />
    </form>
  );
}
