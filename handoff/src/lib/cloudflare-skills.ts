import { readSkillFromBucket, type SkillBucket } from "@/lib/skill-library";

/** The reader bound to this Worker's SKILLS bucket. Outside a Worker it reads nothing. */
export async function cloudflareSkillReader(): Promise<(skillPath: string) => Promise<string | null>> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const env = (await getCloudflareContext({ async: true })).env as { SKILLS?: SkillBucket };
    const bucket = env.SKILLS;
    return (skillPath) => readSkillFromBucket(bucket, skillPath);
  } catch {
    return async () => null;
  }
}
