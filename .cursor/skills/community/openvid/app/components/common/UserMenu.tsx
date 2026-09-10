"use client";
import Image from "next/image";
import Link from "next/link";
import { Icon } from "@iconify/react";
import { useAuth } from "@/app/contexts/useAuth";
import { Button } from "@/components/ui/button";
import { useTranslations } from "next-intl";
import { UserMenuDropdown } from "./UserMenuDropdown";

export function UserMenu() {
  const t = useTranslations('userMenu');
  const { user, profile, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center gap-2 sm:gap-3 p-1 sm:p-1.5 h-11">
        <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-full bg-white/10 animate-pulse border border-white/5 shrink-0"></div>
        <div className="hidden sm:block w-24 h-4 rounded-md bg-white/10 animate-pulse"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center gap-2 sm:gap-4 h-11">
        <Button variant="primary" asChild>
          <Link
            href="/login"
            className="text-md font-medium text-white hover:text-white/90 transition-colors"
          >
            {t('login')}
          </Link>
        </Button>
      </div>
    );
  }

  const meta = user.user_metadata || {};
  const displayName = profile?.first_name || profile?.full_name || meta.full_name || meta.name || user.email?.split("@")[0] || t('defaultUser');
  const avatarUrl = profile?.avatar_url || meta.avatar_url || meta.picture || `https://api.dicebear.com/7.x/initials/svg?seed=${displayName}`;

  return (
    <UserMenuDropdown
      trigger={
        <button
          className="flex items-center gap-2 sm:gap-3 p-1 sm:p-1.5 rounded-full hover:bg-white/5 transition-all focus:outline-none focus:ring-2 focus:ring-blue-500/50"
          aria-label={t('ariaLabel')}
        >
          <div className="relative w-8 h-8 sm:w-9 sm:h-9 rounded-full overflow-hidden border border-white/10 hover:border-white/30 transition-colors">
            <Image src={avatarUrl} alt={displayName} fill sizes="36px" className="object-cover" />
          </div>
          <span className="hidden sm:block text-sm font-medium text-neutral-300 max-w-20 truncate">
            {displayName}
          </span>
          <Icon icon="solar:alt-arrow-down-linear" className="hidden sm:block size-4 text-neutral-400" aria-hidden="true" />
        </button>
      }
    />
  );
}
