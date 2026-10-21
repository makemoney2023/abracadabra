import { redirect } from "next/navigation";

/** Old Finished work links stay valid and open the Library. */
export default async function FinishedWorkPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = await searchParams;
  const paramsText = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (typeof value === "string") paramsText.set(key, value);
  }
  const search = paramsText.toString();
  redirect(`/w/${slug}/library${search ? `?${search}` : ""}`);
}
