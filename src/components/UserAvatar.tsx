'use client';

import React, { useState } from 'react';

interface UserAvatarProps {
  name: string;
  avatarUrl?: string;
  sizeClass?: string;
  roundedClass?: string;
  textClass?: string;
  fallbackBgClass?: string;
}

/**
 * Displays a user's Google profile image with automatic fallback to initials
 * when no URL is available or if loading the external image fails.
 */
export default function UserAvatar({
  name,
  avatarUrl,
  sizeClass = 'h-9 w-9',
  roundedClass = 'rounded-full',
  textClass = 'text-xs',
  fallbackBgClass = 'bg-gradient-to-tr from-[#0A2540] to-[#0066FF] text-white',
}: UserAvatarProps) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const cleanUrl = (avatarUrl || '').trim();
  const shouldShowImg = Boolean(cleanUrl && failedUrl !== cleanUrl);
  const initials = (name || '?').trim().slice(0, 2);

  if (shouldShowImg) {
    return (
      <img
        src={cleanUrl}
        alt={name}
        className={`${sizeClass} ${roundedClass} object-cover shrink-0 ring-1 ring-slate-900/10`}
        referrerPolicy="no-referrer"
        onError={() => setFailedUrl(cleanUrl)}
      />
    );
  }

  return (
    <div
      className={`flex ${sizeClass} items-center justify-center ${roundedClass} ${fallbackBgClass} font-semibold ${textClass} shrink-0 ring-1 ring-slate-900/5`}
    >
      {initials}
    </div>
  );
}
