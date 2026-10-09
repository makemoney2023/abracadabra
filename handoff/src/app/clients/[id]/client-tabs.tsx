import Link from "next/link";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CLIENT_TABS, tabHref, type ClientTabId } from "./tabs";

export function ClientTabs({ clientId, tab }: { clientId: string; tab: ClientTabId }) {
  return (
    <Tabs value={tab}>
      <TabsList className="w-full justify-start">
        {CLIENT_TABS.map((item) => (
          <TabsTrigger key={item.id} value={item.id} asChild>
            <Link href={tabHref(clientId, item.id)}>{item.label}</Link>
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
