"use client";
import React, { useRef, MouseEvent, useState, useCallback, memo, useMemo, useEffect } from "react";
import { Icon } from "@iconify/react";
import { useTranslations } from "next-intl";

interface Author {
  name: string;
  handle: string;
  avatarUrl: string;
  isVerified?: boolean;
  followers?: string;
}

interface PostContent {
  text?: string;
  link?: { display: string; url: string };
  mediaUrl?: string;
  videoUrl?: string;
}

interface PostMetadata {
  timestamp: string;
  views?: string;
}

interface PostStats {
  replies: string;
  reposts: string;
  likes: string;
  bookmarks: string;
  isLiked?: boolean;
}

interface SocialPost {
  id: string;
  platform: "x" | "instagram" | "facebook";
  postUrl: string;
  author: Author;
  content: PostContent;
  metadata?: PostMetadata;
  stats?: PostStats;
}

const getSocialData = (t: (key: string) => string): SocialPost[] => [
  {
    id: "post-1",
    platform: "x",
    postUrl: "https://x.com/GithubProjects/status/2059401736096477303",
    author: {
      name: "GitHub Projects Community",
      handle: "GithubProjects",
      avatarUrl:
        "https://raw.githubusercontent.com/CristianOlivera1/Resources-dev/refs/heads/main/openvid/social-reactions/github.avif",
      isVerified: true,
    },
    content: {
      text: t("posts.post1.text"),
      link: {
        display: "opensourceprojects.dev/post/7596eb42-...",
        url: "https://opensourceprojects.dev/post/7596eb42-...",
      },
      mediaUrl:
        "https://raw.githubusercontent.com/CristianOlivera1/Resources-dev/refs/heads/main/openvid/social-reactions/github-post.avif",
    },
    metadata: {
      timestamp: t("posts.post1.timestamp"),
      views: "27.3K",
    },
    stats: {
      replies: "8",
      reposts: "70",
      likes: "632",
      bookmarks: "605",
      isLiked: false,
    },
  },
  {
    id: "post-2",
    platform: "instagram",
    postUrl: "https://www.instagram.com/p/DX6d6qKjA7I/",
    author: {
      name: "niyi.tech",
      handle: "niyi.tech",
      avatarUrl:
        "https://raw.githubusercontent.com/CristianOlivera1/Resources-dev/refs/heads/main/openvid/social-reactions/niyi-tech.avif",
      followers: t("originalAudio"),
      isVerified: true,
    },
    content: {
      videoUrl:
        "https://raw.githubusercontent.com/CristianOlivera1/Resources-dev/refs/heads/main/openvid/social-reactions/niyi-tech.mp4",
      text: t("posts.post2.text"),
    },
    stats: {
      likes: "6.921",
      replies: "0",
      reposts: "0",
      bookmarks: "0",
    },
  },
  {
    id: "post-3",
    platform: "x",
    postUrl: "https://x.com/Sn0wbrave/status/2073695828858835418",
    author: {
      name: "App Hunter ",
      handle: "Sn0wbrave",
      avatarUrl:
        "https://raw.githubusercontent.com/CristianOlivera1/Resources-dev/refs/heads/main/openvid/social-reactions/hunter.avif",
      isVerified: true,
    },
    content: {
      text: t("posts.post3.text"),
      mediaUrl:
        "https://raw.githubusercontent.com/CristianOlivera1/Resources-dev/refs/heads/main/openvid/social-reactions/hunter-post.avif",
    },
    metadata: {
      timestamp: t("posts.post3.timestamp"),
      views: "9,045",
    },
    stats: {
      replies: "4",
      reposts: "42",
      likes: "213",
      bookmarks: "217",
      isLiked: true,
    },
  },
  {
    id: "post-4",
    platform: "instagram",
    postUrl: "https://www.instagram.com/marc.kaz/",
    author: {
      name: "marc.kaz",
      handle: "marc.kaz",
      avatarUrl:
        "https://raw.githubusercontent.com/CristianOlivera1/Resources-dev/refs/heads/main/openvid/social-reactions/marc-kaz.avif",
      followers: t("originalAudio"),
      isVerified: true,
    },
    content: {
      videoUrl:
        "https://raw.githubusercontent.com/CristianOlivera1/Resources-dev/main/openvid/social-reactions/marc-kaz.mp4",
      text: t("posts.post4.text"),
    },
    stats: {
      likes: "6.921",
      replies: "0",
      reposts: "0",
      bookmarks: "0",
    },
  },
  {
    id: "post-5",
    platform: "facebook",
    postUrl: "https://www.facebook.com/100054016280443/posts/1484927906651071",
    author: {
      name: "Elboussaidi abdelmonim",
      handle: "Elboussaidi",
      avatarUrl:
        "https://raw.githubusercontent.com/CristianOlivera1/Resources-dev/refs/heads/main/openvid/social-reactions/elboussaidi.avif",
      isVerified: false,
    },
    content: {
      text: t("posts.post5.text"),
      mediaUrl:
        "https://raw.githubusercontent.com/CristianOlivera1/Resources-dev/refs/heads/main/openvid/social-reactions/elboussaidi-post.avif",
    },
    stats: {
      replies: "31",
      reposts: "172",
      likes: "120",
      bookmarks: "0",
    },
  },
];

const CARD_HEIGHT = "h-[500px] sm:h-[700px]";

const DraggableCarousel = memo(({ children }: { children: React.ReactNode }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const scrollLeft = useRef(0);

  const handleMouseDown = useCallback((e: MouseEvent) => {
    if (!scrollRef.current) return;
    setIsDragging(true);
    scrollRef.current.classList.add("cursor-grabbing");
    scrollRef.current.classList.remove("cursor-grab");
    startX.current = e.pageX - scrollRef.current.offsetLeft;
    scrollLeft.current = scrollRef.current.scrollLeft;
  }, []);

  const handleMouseUpOrLeave = useCallback(() => {
    setIsDragging(false);
    if (scrollRef.current) {
      scrollRef.current.classList.add("cursor-grab");
      scrollRef.current.classList.remove("cursor-grabbing");
    }
  }, []);

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isDragging || !scrollRef.current) return;
      e.preventDefault();
      const x = e.pageX - scrollRef.current.offsetLeft;
      const walk = (x - startX.current) * 1.5;
      scrollRef.current.scrollLeft = scrollLeft.current - walk;
    },
    [isDragging]
  );

  return (
    <div className="w-full">
      <div
        ref={scrollRef}
        onMouseDown={handleMouseDown}
        onMouseLeave={handleMouseUpOrLeave}
        onMouseUp={handleMouseUpOrLeave}
        onMouseMove={handleMouseMove}
        className="flex gap-4 sm:gap-5 overflow-x-auto hide-scroll cursor-grab select-none -ml-5 w-[calc(100%+1.25rem)] pr-4 items-stretch sm:ml-0 sm:w-full sm:px-0"
      >
        <div
          className="flex-shrink-0 pointer-events-none"
          style={{ width: "max(1.5rem, calc((100vw - 1280px) / 2))" }}
        />
        {children}
        <div
          className="flex-shrink-0 pointer-events-none"
          style={{ width: "max(1.5rem, calc((100vw - 1290px) / 2))" }}
        />
      </div>
    </div>
  );
});

DraggableCarousel.displayName = "DraggableCarousel";

const CustomSocialCard = memo(({ data }: { data: SocialPost }) => {
  const t = useTranslations("socialReactions");

  const handleRedirect = useCallback(() => {
    window.open(data.postUrl, "_blank", "noopener,noreferrer");
  }, [data.postUrl]);

  return (
    <div
      className={`w-[calc(100vw-5rem)] sm:w-[calc(100vw-4rem)] max-w-132 shrink-0 bg-black text-white p-4 font-sans border border-neutral-800 squircle-element-xl select-none transition duration-200 hover:border-neutral-700 flex flex-col shadow-xl ${CARD_HEIGHT} overflow-y-auto hide-scroll`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full bg-neutral-800">
            <img
              src={data.author.avatarUrl}
              alt={data.author.name}
              className="h-full w-full object-cover"
              draggable={false}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-1 font-bold text-[15px]">
              {data.author.name}
              {data.author.isVerified && (
                <Icon icon="mdi:check-decagram" className="text-[#1d9bf0] h-[18px] w-[18px]" />
              )}
            </div>
            <div className="text-neutral-500 text-[15px]">@{data.author.handle}</div>
          </div>
        </div>
        <div
          onClick={handleRedirect}
          className="flex items-center justify-center p-2 rounded-full cursor-pointer text-white hover:bg-neutral-800 transition"
        >
          {data.platform === "x" && <Icon icon="mingcute:social-x-line" className="h-5 w-5" />}
          {data.platform === "facebook" && <Icon icon="ic:baseline-facebook" className="h-6 w-6" />}
        </div>
      </div>
      <div className="mb-3 text-[15px] leading-normal whitespace-pre-wrap line-clamp-5 sm:line-clamp-none">
        {data.content.text}
        {data.content.link && (
          <>
            <br />
            <a
              href={data.content.link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#1d9bf0] hover:underline break-all"
            >
              {data.content.link.display}
            </a>
          </>
        )}
      </div>

      {data.content.mediaUrl && (
        <div
          onClick={handleRedirect}
          className="mt-3 overflow-hidden squircle-element-camera border border-neutral-800 shrink-0 cursor-pointer transition hover:opacity-95"
        >
          <img
            src={data.content.mediaUrl}
            alt="Post media"
            className="w-full object-cover max-h-[240px]"
            draggable={false}
            loading="lazy"
            decoding="async"
          />
        </div>
      )}
      <div className="mt-auto">
        {data.metadata && (
          <div className="mt-4 flex items-center gap-1 text-neutral-500 text-[15px]">
            <span>{data.metadata.timestamp}</span>
            {data.metadata.views && (
              <>
                <span>·</span>
                <span className="font-bold text-white">{data.metadata.views}</span>
                <span>{t("views")}</span>
              </>
            )}
          </div>
        )}
        <div className="h-[1px] w-full bg-neutral-800 my-3" />
        {data.stats && (
          <div className="flex justify-between text-neutral-500 px-1">
            <button className="flex items-center gap-2 hover:text-[#1d9bf0] group transition">
              <div className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition">
                <Icon icon="mdi:message-outline" className="h-5 w-5" />
              </div>
              <span className="text-[13px]">{data.stats.replies}</span>
            </button>
            <button className="flex items-center gap-2 hover:text-[#00ba7c] group transition">
              <div className="p-2 rounded-full group-hover:bg-[#00ba7c]/10 transition">
                <Icon icon="mdi:repeat" className="h-5 w-5" />
              </div>
              <span className="text-[13px]">{data.stats.reposts}</span>
            </button>
            <button
              className={`flex items-center gap-2 group transition ${data.stats.isLiked ? "text-[#f91880]" : "hover:text-[#f91880]"
                }`}
            >
              <div className="p-2 rounded-full group-hover:bg-[#f91880]/10 transition">
                <Icon icon={data.stats.isLiked ? "mdi:heart" : "mdi:heart-outline"} className="h-5 w-5" />
              </div>
              <span className="text-[13px]">{data.stats.likes}</span>
            </button>
            <button className="flex items-center gap-2 hover:text-[#1d9bf0] group transition">
              <div className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition">
                <Icon icon="mdi:bookmark-outline" className="h-5 w-5" />
              </div>
              <span className="text-[13px]">{data.stats.bookmarks}</span>
            </button>
            <button className="flex items-center group transition hover:text-[#1d9bf0]">
              <div className="p-2 rounded-full group-hover:bg-[#1d9bf0]/10 transition">
                <Icon icon="mdi:tray-arrow-up" className="h-5 w-5" />
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  );
});
CustomSocialCard.displayName = "CustomSocialCard";

const InstagramReelCard = memo(({ data }: { data: SocialPost }) => {
  const t = useTranslations("socialReactions");

  const [isVisible, setIsVisible] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  const handleRedirect = useCallback(() => {
    window.open(data.postUrl, "_blank", "noopener,noreferrer");
  }, [data.postUrl]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" }
    );

    if (cardRef.current) {
      observer.observe(cardRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <article
      ref={cardRef}
      className={`w-[calc(100vw-4rem)] sm:w-[calc(100vw-4rem)] max-w-132 shrink-0 relative overflow-hidden squircle-element-xl border border-white/15 bg-black text-white shadow-2xl transition duration-200 hover:border-white/30 flex flex-col justify-between select-none shadow-xl ${CARD_HEIGHT}`}
    >
      <div className="absolute inset-0 h-full w-full pointer-events-none z-0 bg-neutral-900">
        <video
          className={`h-full w-full object-cover transition-opacity duration-500 ${isVisible ? 'opacity-100' : 'opacity-0'}`}
          src={isVisible ? data.content.videoUrl : undefined}
          playsInline
          preload="none"
          autoPlay
          muted
          loop
          disableRemotePlayback
          draggable={false}
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-transparent to-black/70" />
      </div>

      <div className="flex items-center justify-between gap-3 p-4 z-10 w-full">
        <div className="flex items-center gap-3">
          <div
            onClick={handleRedirect}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-tr from-[#feda75] via-[#d62976] to-[#4f5bd5] p-[2px] cursor-pointer transition hover:opacity-90"
          >
            <img
              alt={data.author.name}
              className="h-full w-full rounded-full object-cover border-2 border-black"
              src={data.author.avatarUrl}
              draggable={false}
              loading="lazy"
              decoding="async"
            />
          </div>
          <div className="flex flex-col leading-tight">
            <div className="text-[15px] font-semibold flex items-center gap-1">
              {data.author.name}
              {data.author.isVerified && (
                <Icon
                  icon="mdi:check-decagram"
                  className="text-[#0095f6] h-[14px] w-[14px]"
                />
              )}
            </div>
            <div className="text-xs text-white/75">{data.author.followers}</div>
          </div>
        </div>

        <div
          onClick={handleRedirect}
          className="flex items-center justify-center p-2 rounded-full cursor-pointer hover:bg-white/10 transition"
        >
          <Icon icon="mdi:instagram" className="h-6 w-6 text-white" />
        </div>
      </div>

      {data.content.text && (
        <div className="mt-auto px-4 text-[14px] text-white/95 leading-normal drop-shadow-md z-10 line-clamp-3 font-sans max-w-[90%]">
          {data.content.text}
        </div>
      )}

      <div className="p-4 z-10 mt-2">
        <div
          onClick={handleRedirect}
          className="inline-flex items-center gap-1.5 cursor-pointer rounded-full bg-black/45 px-2.5 py-1 text-xs backdrop-blur border border-white/10"
        >
          <Icon icon="mdi:movie-play-outline" className="h-4 w-4" />
          <span>{t("watchReel")}</span>
        </div>
      </div>
    </article>
  );
});
InstagramReelCard.displayName = "InstagramReelCard";

export default function SocialReactions() {
  const t = useTranslations("socialReactions");

  const socialData = useMemo(() => getSocialData(t), [t]);

  return (
    <section
      className="relative w-full overflow-hidden py-10 md:py-16 mask-b-from-70% mask-b-to-99%"
      style={{
        background:
          "linear-gradient(180deg, #FF7A38 0%, #FF5A1F 20%, #F0481A 34%, #B83A14 48%, #5C2911 62%, #1C1208 78%)",
        paddingBottom: "clamp(140px, 22vw, 320px)",
      }}
    >
      <div aria-hidden="true" className="absolute inset-0 pointer-events-none overflow-hidden select-none">
        <div
          style={{
            position: "absolute",
            left: "-5%",
            top: "-10%",
            width: "40%",
            height: "60%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(0, 138, 255, 0.22) 0%, transparent 75%)",
            mixBlendMode: "hard-light",
            filter: "blur(90px)",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: "20%",
            top: "-22%",
            width: "52%",
            height: "66%",
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(255, 255, 255, 0.2) 0%, transparent 80%)",
            mixBlendMode: "hard-light",
            filter: "blur(100px)",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: "68%",
            top: "12%",
            width: "42%",
            height: "65%",
            borderRadius: "9999px",
            background: "linear-gradient(135deg, rgba(247, 164, 66, 0.4) 0%, transparent 100%)",
            mixBlendMode: "hard-light",
            filter: "blur(95px)",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: "-12%",
            top: "38%",
            width: "55%",
            height: "70%",
            borderRadius: "50%",
            background: "linear-gradient(to bottom, rgba(233, 66, 247, 0.35) 0%, transparent 100%)",
            mixBlendMode: "soft-light",
            filter: "blur(110px)",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            left: "35%",
            top: "52%",
            width: "25%",
            height: "58%",
            borderRadius: "9999px",
            background:
              "linear-gradient(135deg, rgba(247, 164, 66, 0.18) 0%, rgba(233, 66, 247, 0.22) 100%)",
            mixBlendMode: "soft-light",
            filter: "blur(100px)",
          }}
        ></div>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "34%",
            background:
              "radial-gradient(82% 100% at 50% 0%, rgba(255,255,255,0.15) 0%, transparent 62%)",
            mixBlendMode: "overlay",
          }}
        ></div>
      </div>
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none select-none"
        style={{
          backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://w3.org' width='200' height='200'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.22 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>")`,
          backgroundSize: "200px 200px",
          mixBlendMode: "overlay",
          opacity: 0.04,
        }}
      ></div>

      <div className="relative z-10">
        <div className="max-w-7xl mb-16 px-6 lg:px-8 mx-auto">
          <h2 className="text-4xl sm:text-5xl font-semibold tracking-tight text-white mb-6">
            {t("titleLine1")} <br className="hidden sm:block" />
            <span className="relative inline-block text-transparent bg-clip-text bg-gradient-to-r from-neutral-200 to-orange-300 drop-shadow-sm">
              {t("titleLine2")}
              <img
                src="/images/carousel/decorators/sparkles.webp"
                alt={t("sparklesAlt")}
                className="absolute sm:-top-24 sm:-left-10 -top-18 -left-5 pointer-events-none select-none animate-pulse"
              />
            </span>
          </h2>
          <p className="text-xl text-orange-100/80 font-light leading-relaxed max-w-xl drop-shadow-sm">
            {t("description")}
          </p>
        </div>
        <DraggableCarousel>
          {socialData.map((post) => {
            if (post.platform === "x" || post.platform === "facebook") {
              return <CustomSocialCard key={post.id} data={post} />;
            }
            if (post.platform === "instagram") {
              return <InstagramReelCard key={post.id} data={post} />;
            }
            return null;
          })}
        </DraggableCarousel>
      </div>
    </section>
  );
}