"use server";

import { revalidatePath } from "next/cache";
import { openSession } from "@/lib/current";
import {
  addTemplateItem,
  createTemplate,
  reorderTemplateItems,
  retireTemplate,
  retireTemplateItem,
  templateCatalog,
} from "@/lib/store/requests";

export type TemplateState = { message: string };

const PATH = "/admin/templates";

export async function createTemplateAction(
  _previous: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const { sql, caller } = await openSession();
  const created = await createTemplate({
    sql,
    caller,
    now: Date.now(),
    name: String(formData.get("name") ?? ""),
  });
  if (!created.ok) return { message: created.message };
  revalidatePath(PATH);
  return { message: "Template added." };
}

export async function addTemplateItemAction(
  _previous: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const { sql, caller } = await openSession();
  const created = await addTemplateItem({
    sql,
    caller,
    templateId: String(formData.get("templateId") ?? ""),
    title: String(formData.get("title") ?? ""),
    guidance: String(formData.get("guidance") ?? ""),
    suggestedTag: String(formData.get("suggestedTag") ?? ""),
  });
  if (!created.ok) return { message: created.message };
  revalidatePath(PATH);
  return { message: "Item added." };
}

export async function moveTemplateItemAction(
  _previous: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const { sql, caller } = await openSession();
  const templateId = String(formData.get("templateId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  const catalog = await templateCatalog(sql);
  const template = catalog.find((row) => row.id === templateId);
  if (!template) return { message: "You can't do that." };
  const ids = template.items.map((item) => item.id);
  const index = ids.indexOf(itemId);
  const swap = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swap < 0 || swap >= ids.length) return { message: "You can't do that." };
  const orderedIds = [...ids];
  const [moved] = orderedIds.splice(index, 1);
  orderedIds.splice(swap, 0, moved);
  const result = await reorderTemplateItems({ sql, caller, templateId, orderedIds });
  if (!result.ok) return { message: result.message };
  revalidatePath(PATH);
  return { message: "Moved." };
}

export async function retireTemplateItemAction(
  _previous: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const { sql, caller } = await openSession();
  const result = await retireTemplateItem({
    sql,
    caller,
    templateId: String(formData.get("templateId") ?? ""),
    itemId: String(formData.get("itemId") ?? ""),
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(PATH);
  return { message: "Item put away." };
}

export async function retireTemplateAction(
  _previous: TemplateState,
  formData: FormData,
): Promise<TemplateState> {
  const { sql, caller } = await openSession();
  const result = await retireTemplate({
    sql,
    caller,
    templateId: String(formData.get("templateId") ?? ""),
    now: Date.now(),
  });
  if (!result.ok) return { message: result.message };
  revalidatePath(PATH);
  return { message: "Template put away." };
}
