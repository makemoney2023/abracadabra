"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { useAuth } from "@/app/contexts/useAuth";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { useTranslations } from "next-intl";
import { createClient } from "@/utils/supabase/client";
import { usePathname, useRouter } from "@/navigation";

type Theme = "light" | "dark" | "system";

const THEMES: Theme[] = ["light", "dark", "system"];
const DARK_MQ = "(prefers-color-scheme: dark)";
const EDITOR_ROOT_ID = "editor-root";
const THEME_COOKIE = "openvid_theme";
const THEME_PREF_COOKIE = "openvid_theme_pref";
const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

const THEME_ICONS: Record<Theme, string> = {
  light: "lucide:sun",
  dark: "lucide:moon",
  system: "lucide:monitor",
};

const itemClasses =
  "flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground/85 hover:text-popover-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer outline-none";

function isDarkResolved(theme: Theme): boolean {
  return (
    theme === "dark" ||
    (theme === "system" &&
      typeof window !== "undefined" &&
      window.matchMedia(DARK_MQ).matches)
  );
}

function applyThemeClass(theme: Theme, isEditorPage: boolean) {
  const dark = isDarkResolved(theme);
  document.documentElement.classList.toggle("dark", !isEditorPage || dark);
  document.getElementById(EDITOR_ROOT_ID)?.classList.toggle("dark", dark);
}

function writeThemeCookie(theme: Theme) {
  const dark = isDarkResolved(theme);
  document.cookie = `${THEME_COOKIE}=${dark ? "dark" : "light"}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
  document.cookie = `${THEME_PREF_COOKIE}=${theme}; path=/; max-age=${THEME_COOKIE_MAX_AGE}; samesite=lax`;
}

interface UserMenuDropdownProps {
  trigger: React.ReactNode;
  showTheme?: boolean;
  editorMode?: "video" | "photo";
}

export function UserMenuDropdown({
  trigger,
  showTheme = false,
  editorMode,
}: UserMenuDropdownProps) {
  const t = useTranslations('userMenu');
  const { user, profile } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isEditorPage = pathname.startsWith("/editor");
  const [theme, setTheme] = useState<Theme>("system");
  const [isSavingTheme, setIsSavingTheme] = useState(false);
  const themeSyncedRef = useRef(false);
  const supabase = useMemo(() => createClient(), []);

  const themeLabels: Record<Theme, string> = {
    light: t("themeLight"),
    dark: t("themeDark"),
    system: t("themeSystem"),
  };

  useEffect(() => {
    if (!profile || themeSyncedRef.current) return;
    themeSyncedRef.current = true;
    setTheme(profile.theme ?? "system");
  }, [profile]);

  useEffect(() => {
    applyThemeClass(theme, isEditorPage);
    writeThemeCookie(theme);
  }, [theme, isEditorPage]);

  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia(DARK_MQ);
    const onChange = () => {
      applyThemeClass("system", isEditorPage);
      writeThemeCookie("system");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme, isEditorPage]);

  const handleThemeChange = async (next: Theme) => {
    if (next === theme) return;
    setTheme(next);
    if (!user) return;
    setIsSavingTheme(true);
    try {
      const { error } = await supabase
        .from("user_profiles")
        .update({ theme: next })
        .eq("id", user.id);
      if (error) console.error("Error saving theme:", error);
    } finally {
      setIsSavingTheme(false);
    }
  };

  const meta = user?.user_metadata || {};
  const displayName =
    profile?.first_name ||
    profile?.full_name ||
    meta.full_name ||
    meta.name ||
    user?.email?.split("@")[0] ||
    t('defaultUser');
  const provider = profile?.provider || meta.provider || "email";
  const editorHref = editorMode === "video" ? "/editor?mode=photo" : "/editor?mode=video";
  const editorLabel = editorMode === "video" ? t("photoEditor") : editorMode === "photo" ? t("videoEditor") : t("editor");
  const editorIcon = editorMode === "video" ? "solar:gallery-wide-linear" : "solar:video-frame-cut-2-linear";

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="min-w-55 bg-popover dark:bg-black text-popover-foreground border border-border rounded-lg p-1 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200"
          sideOffset={8}
          align="end"
        >
          <div className="px-3 py-2 mb-1 border-b border-border">
            <p className="text-sm font-medium text-popover-foreground truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
            <p className="text-xs text-muted-foreground/80 mt-1 capitalize">
              {t('connectedWith', { provider })}
            </p>
          </div>

          <DropdownMenu.Item asChild>
            <Link href="/" className={itemClasses}>
              <Icon icon="hugeicons:home-11" className="size-4" aria-hidden="true" />
              {t('home')}
            </Link>
          </DropdownMenu.Item>

          <DropdownMenu.Item asChild>
            <Link href={editorHref} className={itemClasses}>
              <Icon icon={editorIcon} className="size-4" aria-hidden="true" />
              <span>{editorLabel}</span>
            </Link>
          </DropdownMenu.Item>

          {showTheme && (
            <>
              <DropdownMenu.Separator className="h-px bg-border my-1" />

              <DropdownMenu.Sub>
                <DropdownMenu.SubTrigger className="flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground/85 hover:text-popover-foreground hover:bg-muted data-[state=open]:bg-muted data-[state=open]:text-popover-foreground rounded-lg transition-colors cursor-pointer outline-none">
                  <Icon icon={THEME_ICONS[theme]} className="size-4" aria-hidden="true" />
                  <span className="flex-1">{t('theme')}</span>
                  <span className="text-xs text-muted-foreground/80">{themeLabels[theme]}</span>
                  <Icon icon="solar:alt-arrow-right-linear" className="size-3.5 text-muted-foreground" aria-hidden="true" />
                </DropdownMenu.SubTrigger>
                <DropdownMenu.SubContent
                  sideOffset={4}
                  alignOffset={-4}
                  className="min-w-44 bg-popover dark:bg-black border border-border rounded-lg p-1 shadow-2xl z-50 animate-in fade-in slide-in-from-top-2 duration-200"
                >
                  <DropdownMenu.RadioGroup
                    value={theme}
                    onValueChange={(value) => handleThemeChange(value as Theme)}
                  >
                    {THEMES.map((value) => (
                      <DropdownMenu.RadioItem
                        key={value}
                        value={value}
                        disabled={isSavingTheme}
                        className="flex items-center gap-3 px-3 py-2 text-sm text-popover-foreground/85 hover:text-popover-foreground hover:bg-muted rounded-lg transition-colors cursor-pointer outline-none data-[disabled]:opacity-50 data-[disabled]:cursor-not-allowed"
                      >
                        <Icon icon={THEME_ICONS[value]} className="size-4" aria-hidden="true" />
                        <span className="flex-1">{themeLabels[value]}</span>
                        <DropdownMenu.ItemIndicator>
                          <Icon icon="lucide:check" className="size-4 text-blue-600 dark:text-blue-400" aria-hidden="true" />
                        </DropdownMenu.ItemIndicator>
                      </DropdownMenu.RadioItem>
                    ))}
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.SubContent>
              </DropdownMenu.Sub>
            </>
          )}

          <DropdownMenu.Separator className="h-px bg-border my-1" />

          <SignOutItem router={router} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function SignOutItem({ router }: { router: ReturnType<typeof useRouter> }) {
  const t = useTranslations('userMenu');
  const { signOut } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  const handleSignOut = async () => {
    setIsLoggingOut(true);
    try {
      await signOut();
      router.push("/");
    } catch (error) {
      console.error("Error signing out:", error);
      setIsLoggingOut(false);
    }
  };

  return (
    <DropdownMenu.Item
      onSelect={handleSignOut}
      disabled={isLoggingOut}
      className="flex items-center gap-3 px-3 py-2 text-sm text-destructive hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors cursor-pointer outline-none disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoggingOut ? (
        <>
          <Icon icon="svg-spinners:ring-resize" className="size-4" aria-hidden="true" />
          <span>{t('loggingOut')}</span>
        </>
      ) : (
        <>
          <Icon icon="solar:logout-2-linear" className="size-4" aria-hidden="true" />
          <span>{t('logout')}</span>
        </>
      )}
    </DropdownMenu.Item>
  );
}
