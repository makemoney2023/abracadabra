import Link from "next/link";
import { requireHqStaffPage } from "@/lib/current";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StaffShell } from "../../staff-shell";
import { ClientForm } from "../client-form";

export default async function NewClientPage() {
  await requireHqStaffPage();
  return (
    <StaffShell>
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-8 px-6 py-16">
      <div className="flex flex-col gap-3">
        <h1 className="font-heading text-4xl leading-tight">Add a client</h1>
        <Link href="/clients" className="text-sm">
          Clients
        </Link>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Company name</CardTitle>
          <CardDescription>Add the company. You can link a file space after that.</CardDescription>
        </CardHeader>
        <CardContent>
          <ClientForm />
        </CardContent>
      </Card>
    </main>
    </StaffShell>
  );
}
