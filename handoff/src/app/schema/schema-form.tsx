"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { startSchemaCheck, type SchemaFormState } from "./actions";

const initial: SchemaFormState = { message: "" };

export function SchemaForm() {
  const [state, action, pending] = useActionState(startSchemaCheck, initial);
  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm" htmlFor="schema-sites">
        Sites
        <textarea
          id="schema-sites"
          name="objective"
          required
          minLength={8}
          rows={5}
          placeholder="Check https://acme.example and northwind.example."
          className="min-h-32 rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
        />
      </label>
      <Button type="submit" disabled={pending}>
        {pending ? "Reading sites" : "Check these sites"}
      </Button>
      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
