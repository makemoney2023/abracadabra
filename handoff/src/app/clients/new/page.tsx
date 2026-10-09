import Link from "next/link";
import { requireHqStaffPage } from "@/lib/current";
import { PageFrame } from "@/components/page-frame";
import { Button } from "@/components/ui/button";
import { StaffShell } from "../../staff-shell";
import { ClientForm } from "../client-form";

export default async function NewClientPage() {
  await requireHqStaffPage();
  return (
    <StaffShell>
      <PageFrame
        title="Add a client"
        width="narrow"
        description="Add the company. You can link a file space after that."
        actions={
          <Button variant="outline" asChild>
            <Link href="/clients">Clients</Link>
          </Button>
        }
      >
        <ClientForm />
      </PageFrame>
    </StaffShell>
  );
}
