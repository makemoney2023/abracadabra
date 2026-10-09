import { requireHqStaffPage } from "@/lib/current";

import { AppearancePanel } from "./panel";

export default async function AppearancePage() {
  await requireHqStaffPage();
  return <AppearancePanel />;
}
