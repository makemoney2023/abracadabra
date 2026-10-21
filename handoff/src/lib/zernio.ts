/** Zernio REST client (https://zernio.com/llms.txt). Plain fetch so it runs in a Worker and in tests. */

const CLOUDFLARE_CONTEXT = Symbol.for("__cloudflare-context__");

export const ZERNIO_BASE_URL = "https://zernio.com/api/v1";

/** Networks a client can connect from the Social tab. WordPress and Wix are blogs and cannot take a social post. */
export const SOCIAL_PLATFORMS = [
  "instagram",
  "facebook",
  "linkedin",
  "tiktok",
  "twitter",
  "youtube",
  "threads",
  "pinterest",
  "googlebusiness",
  "bluesky",
] as const;
export const BLOG_PLATFORMS = ["wordpress", "wix"] as const;
export const CONNECT_PLATFORMS = [...SOCIAL_PLATFORMS, ...BLOG_PLATFORMS] as const;
export type ConnectPlatform = (typeof CONNECT_PLATFORMS)[number];

export const PLATFORM_LABEL: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  linkedin: "LinkedIn",
  tiktok: "TikTok",
  twitter: "X",
  youtube: "YouTube",
  threads: "Threads",
  pinterest: "Pinterest",
  googlebusiness: "Google Business",
  bluesky: "Bluesky",
  wordpress: "WordPress",
  wix: "Wix",
};

const BLOG_SET = new Set<string>(BLOG_PLATFORMS);

export function isBlogPlatform(platform: string): boolean {
  return BLOG_SET.has(platform);
}

/** Blogs and Pinterest stay out of the new scheduling workflow. Historical connections can still be listed. */
export const OUT_OF_SCOPE_PLATFORMS = ["pinterest", "wordpress", "wix"] as const;
const OUT_OF_SCOPE = new Set<string>(OUT_OF_SCOPE_PLATFORMS);
export const ELIGIBLE_CONNECT_PLATFORMS = SOCIAL_PLATFORMS.filter((platform) => platform !== "pinterest");

export function isEligibleSocialPlatform(platform: string): boolean {
  return !OUT_OF_SCOPE.has(platform);
}

export class ZernioError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly details: unknown = null,
  ) {
    super(message);
    this.name = "ZernioError";
  }
}

export type ZernioProfile = { _id: string; name: string; externalId: string | null };
export type ZernioAccount = {
  _id: string;
  platform: string;
  profileId: string;
  username: string | null;
  displayName: string | null;
  isActive: boolean;
};
export type ZernioMediaItem = { type: "image" | "video" | "gif" | "document"; url: string; thumbnail?: string };
export type ZernioPostTarget = {
  platform: string;
  accountId: string;
  customContent?: string;
  platformSpecificData?: Record<string, unknown>;
};
export type ZernioPostInput = {
  content: string;
  title?: string;
  profileId: string;
  platforms: ZernioPostTarget[];
  mediaItems: ZernioMediaItem[];
  scheduledFor?: string;
  timezone?: string;
  publishNow?: boolean;
  isDraft?: boolean;
  tiktokSettings?: Record<string, unknown>;
  tags?: string[];
};
export type ZernioPost = {
  _id: string;
  status: string;
  scheduledFor?: string | null;
  platforms?: ZernioPostPlatform[];
};
export type ZernioPostPlatform = {
  platform: string;
  accountId?: string | { _id?: string };
  status?: string;
  error?: string;
  errorMessage?: string;
  publishedUrl?: string;
  platformPostUrl?: string;
};
export type ZernioWebhook = { _id: string; name: string; url: string; events: string[]; isActive?: boolean };
export type Presigned = { uploadUrl: string; publicUrl: string };
export type UploadStream = { body: ReadableStream<Uint8Array>; size: number };

type FixedLength = new (length: number) => TransformStream<Uint8Array, Uint8Array>;

/** A presigned PUT needs a Content-Length. Workers send a stream with one through FixedLengthStream. */
function uploadBody(source: Uint8Array | UploadStream): BodyInit {
  if (source instanceof Uint8Array) return source as unknown as BodyInit;
  const Fixed = (globalThis as { FixedLengthStream?: FixedLength }).FixedLengthStream;
  if (!Fixed) return source.body as unknown as BodyInit;
  const fixed = new Fixed(source.size);
  void source.body.pipeTo(fixed.writable);
  return fixed.readable as unknown as BodyInit;
}

export type ZernioClient = {
  findProfile(externalId: string): Promise<ZernioProfile | null>;
  createProfile(input: { name: string; externalId: string }): Promise<ZernioProfile>;
  listAccounts(profileId: string): Promise<ZernioAccount[]>;
  connectUrl(platform: ConnectPlatform, profileId: string, redirectUrl: string): Promise<string>;
  disconnectAccount(accountId: string): Promise<void>;
  presign(filename: string, contentType: string): Promise<Presigned>;
  upload(uploadUrl: string, bytes: Uint8Array | UploadStream, contentType: string): Promise<void>;
  createPost(input: ZernioPostInput): Promise<ZernioPost>;
  getPost(postId: string): Promise<ZernioPost>;
  reschedulePost(postId: string, scheduledFor: string, timezone: string): Promise<ZernioPost>;
  deletePost(postId: string): Promise<void>;
  listWebhooks(): Promise<ZernioWebhook[]>;
  saveWebhook(input: { id?: string; name: string; url: string; events: string[]; secret: string }): Promise<ZernioWebhook>;
};

/** The agency API key from process.env or the Worker binding. Empty means Zernio is not set up. */
export function zernioApiKey(): string {
  const fromProcess = process.env.ZERNIO_API_KEY?.trim() ?? "";
  if (fromProcess) return fromProcess;
  const holder = globalThis as typeof globalThis & {
    [CLOUDFLARE_CONTEXT]?: { env?: { ZERNIO_API_KEY?: unknown } };
  };
  const value = holder[CLOUDFLARE_CONTEXT]?.env?.ZERNIO_API_KEY;
  return typeof value === "string" ? value.trim() : "";
}

function idOf(row: Record<string, unknown>): string {
  const value = row._id ?? row.id;
  return typeof value === "string" ? value : "";
}

function account(row: Record<string, unknown>): ZernioAccount {
  return {
    _id: idOf(row),
    platform: String(row.platform ?? ""),
    profileId: typeof row.profileId === "string" ? row.profileId : String((row.profileId as { _id?: string })?._id ?? ""),
    username: typeof row.username === "string" ? row.username : null,
    displayName: typeof row.displayName === "string" ? row.displayName : null,
    isActive: row.isActive !== false,
  };
}

function profile(row: Record<string, unknown>): ZernioProfile {
  return {
    _id: idOf(row),
    name: String(row.name ?? ""),
    externalId: typeof row.externalId === "string" ? row.externalId : null,
  };
}

export function createZernioClient(apiKey: string, fetcher: typeof fetch = fetch, base = ZERNIO_BASE_URL): ZernioClient {
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetcher(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = null;
      }
    }
    if (!response.ok) {
      const record = (parsed ?? {}) as { error?: unknown; message?: unknown; details?: unknown };
      const message =
        typeof record.error === "string" ? record.error : typeof record.message === "string" ? record.message : `Zernio answered ${response.status}`;
      throw new ZernioError(message, response.status, record.details ?? null);
    }
    return parsed as T;
  }

  return {
    async findProfile(externalId) {
      const data = await call<{ profiles?: Record<string, unknown>[] }>(
        "GET",
        `/profiles?externalId=${encodeURIComponent(externalId)}`,
      );
      const match = (data.profiles ?? []).map(profile).find((row) => row.externalId === externalId);
      return match ?? null;
    },
    async createProfile(input) {
      try {
        const data = await call<{ profile?: Record<string, unknown> } & Record<string, unknown>>("POST", "/profiles", {
          name: input.name.slice(0, 100),
          externalId: input.externalId,
        });
        return profile((data.profile ?? data) as Record<string, unknown>);
      } catch (error) {
        const existing = (error instanceof ZernioError && error.status === 409
          ? (error.details as { existingProfileId?: unknown } | null)?.existingProfileId
          : null);
        if (typeof existing === "string") return { _id: existing, name: input.name, externalId: input.externalId };
        throw error;
      }
    },
    async listAccounts(profileId) {
      const data = await call<{ accounts?: Record<string, unknown>[] }>(
        "GET",
        `/accounts?profileId=${encodeURIComponent(profileId)}`,
      );
      return (data.accounts ?? []).map(account).filter((row) => row._id && row.platform);
    },
    async connectUrl(platform, profileId, redirectUrl) {
      const query = new URLSearchParams({ profileId, redirect_url: redirectUrl });
      const data = await call<{ authUrl?: unknown }>("GET", `/connect/${platform}?${query.toString()}`);
      if (typeof data.authUrl !== "string" || !data.authUrl.startsWith("https://")) {
        throw new ZernioError("Zernio did not return a sign-in link.", 502);
      }
      return data.authUrl;
    },
    async disconnectAccount(accountId) {
      await call("DELETE", `/accounts/${encodeURIComponent(accountId)}`);
    },
    async presign(filename, contentType) {
      const data = await call<{ uploadUrl?: unknown; publicUrl?: unknown }>("POST", "/media/presign", {
        filename,
        contentType,
      });
      if (typeof data.uploadUrl !== "string" || typeof data.publicUrl !== "string") {
        throw new ZernioError("Zernio did not return an upload link.", 502);
      }
      return { uploadUrl: data.uploadUrl, publicUrl: data.publicUrl };
    },
    async upload(uploadUrl, bytes, contentType) {
      const response = await fetcher(uploadUrl, {
        method: "PUT",
        headers: { "content-type": contentType },
        body: uploadBody(bytes),
        ...(bytes instanceof Uint8Array ? {} : { duplex: "half" }),
      } as RequestInit);
      if (!response.ok) throw new ZernioError(`Media upload answered ${response.status}`, response.status);
    },
    async createPost(input) {
      const data = await call<{ post?: ZernioPost }>("POST", "/posts", input);
      if (!data.post?._id) throw new ZernioError("Zernio did not return the post.", 502);
      return data.post;
    },
    async getPost(postId) {
      const data = await call<{ post?: ZernioPost } & Partial<ZernioPost>>("GET", `/posts/${encodeURIComponent(postId)}`);
      const post = data.post ?? (data._id ? (data as ZernioPost) : null);
      if (!post) throw new ZernioError("Zernio did not return the post.", 502);
      return post;
    },
    async reschedulePost(postId, scheduledFor, timezone) {
      const data = await call<{ post?: ZernioPost } & Partial<ZernioPost>>("PUT", `/posts/${encodeURIComponent(postId)}`, {
        scheduledFor,
        timezone,
      });
      return data.post ?? ({ _id: postId, status: String(data.status ?? "scheduled") } as ZernioPost);
    },
    async deletePost(postId) {
      await call("DELETE", `/posts/${encodeURIComponent(postId)}`);
    },
    async listWebhooks() {
      const data = await call<{ webhooks?: ZernioWebhook[] }>("GET", "/webhooks/settings");
      return data.webhooks ?? [];
    },
    async saveWebhook(input) {
      const body = { name: input.name, url: input.url, events: input.events, secret: input.secret, isActive: true };
      const data = input.id
        ? await call<{ webhook?: ZernioWebhook }>("PUT", "/webhooks/settings", { webhookId: input.id, ...body })
        : await call<{ webhook?: ZernioWebhook }>("POST", "/webhooks/settings", body);
      return data.webhook ?? { _id: input.id ?? "", name: input.name, url: input.url, events: input.events };
    },
  };
}

/** The live client, or null when ZERNIO_API_KEY is not set. */
export function openZernio(): ZernioClient | null {
  const key = zernioApiKey();
  return key ? createZernioClient(key) : null;
}
