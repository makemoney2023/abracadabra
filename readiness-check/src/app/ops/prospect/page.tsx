import Link from "next/link";
import { ProspectForm } from "@/components/ops/ProspectForm";
import { Button } from "@/components/ui/button";

export default function OpsProspectPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl tracking-tight">Prospect</h1>
          <p className="text-sm text-muted-foreground">
            Discover companies with Parallel FindAll, enrich contacts, and enqueue
            readiness scans.
          </p>
        </div>
        <Button asChild variant="outline" className="cursor-pointer">
          <Link href="/ops">Back to inbox</Link>
        </Button>
      </div>
      <ProspectForm />
    </div>
  );
}
