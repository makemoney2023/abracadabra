import { execFileSync } from "node:child_process";
import { createHash, createHmac } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { libraryManifest, skillIndexFromFiles, skillObjectKey } from "../src/lib/skill-library";
import { packOf } from "../src/lib/skill-packs";
import { readSkillTree } from "../src/lib/skill-tree";

const bucket = "handoff-skills";
const handoff = path.resolve(import.meta.dirname, "..");
const skillsRoot = path.resolve(handoff, "../.cursor/skills");

function envValue(name: string, file: string): string {
  if (process.env[name]?.trim()) return process.env[name].trim();
  const line = file.split("\n").find((row) => row.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() ?? "";
}

function sign(key: Buffer | string, value: string): Buffer {
  return createHmac("sha256", key).update(value).digest();
}

async function putObject(input: {
  endpoint: string;
  accessKey: string;
  secret: string;
  key: string;
  body: string;
  contentType: string;
}): Promise<void> {
  const endpoint = new URL(input.endpoint);
  const canonicalUri = `/${bucket}/${input.key.split("/").map(encodeURIComponent).join("/")}`;
  const url = new URL(canonicalUri, endpoint);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = createHash("sha256").update(input.body).digest("hex");
  const headers: Record<string, string> = {
    host: url.host,
    "content-type": input.contentType,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((name) => `${name}:${headers[name]}\n`)
    .join("");
  const canonicalRequest = ["PUT", canonicalUri, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join(
    "\n",
  );
  const signingKey = sign(sign(sign(sign(`AWS4${input.secret}`, dateStamp), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      ...headers,
      authorization: `AWS4-HMAC-SHA256 Credential=${input.accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
    },
    body: input.body,
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 180);
    throw new Error(`${input.key} ${response.status} ${detail}`);
  }
}

async function each<T>(items: T[], size: number, runItem: (item: T) => Promise<void>): Promise<void> {
  let cursor = 0;
  async function worker(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      await runItem(item);
    }
  }
  await Promise.all(Array.from({ length: size }, () => worker()));
}

function gitSha(): string | null {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: handoff, encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const envFile = await readFile(path.join(handoff, ".env.local"), "utf8").catch(() => "");
  const files = await readSkillTree(skillsRoot);
  const index = skillIndexFromFiles(files);
  if (index.length === 0) throw new Error("No skills were found.");
  const packCount = new Set(index.map((skill) => packOf(skill.path))).size;
  const manifest = libraryManifest({ files, index, packCount, gitSha: gitSha(), now: new Date() });

  if (process.argv.includes("--dry-run")) {
    console.log(JSON.stringify(manifest, null, 2));
    console.log("Dry run: nothing was uploaded.");
    return;
  }

  const accessKey = envValue("R2_ACCESS_KEY_ID", envFile);
  const secret = envValue("R2_SECRET_ACCESS_KEY", envFile);
  const endpoint = envValue("R2_ENDPOINT", envFile);
  if (!accessKey || !secret || !endpoint) {
    throw new Error("Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_ENDPOINT in handoff/.env.local.");
  }

  // Bodies first, then the index, then the manifest: a reader never sees a path whose body is not there yet,
  // and the manifest only changes once the whole library is up.
  const uploads: { key: string; body: string; contentType: string }[] = [];
  for (const file of files) {
    const key = skillObjectKey(file.path);
    if (!key) continue;
    uploads.push({ key, body: file.raw, contentType: "text/markdown; charset=utf-8" });
  }
  const tail = [
    { key: "skills/index.json", body: JSON.stringify({ skills: index }), contentType: "application/json" },
    { key: "skills/manifest.json", body: JSON.stringify(manifest), contentType: "application/json" },
  ];

  let done = 0;
  const total = uploads.length + tail.length;
  const putOne = async (upload: { key: string; body: string; contentType: string }) => {
    let last = "upload failed";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        await putObject({ endpoint, accessKey, secret, ...upload });
        last = "";
        break;
      } catch (error) {
        last = error instanceof Error ? error.message : "upload failed";
        await new Promise((resolve) => setTimeout(resolve, 400 * (attempt + 1)));
      }
    }
    if (last) throw new Error(`${upload.key} ${last}`);
    done += 1;
    if (done % 50 === 0 || done === total) console.log(`${done}/${total}`);
  };
  await each(uploads, 12, putOne);
  for (const upload of tail) await putOne(upload);

  console.log(
    `Published ${manifest.skill_count} skills in ${manifest.pack_count} packs to ${bucket}` +
      ` (${manifest.fallback_count} indexed without front matter, commit ${manifest.git_sha?.slice(0, 8) ?? "unknown"}).`,
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "publish failed";
  console.error(message);
  process.exit(1);
});
