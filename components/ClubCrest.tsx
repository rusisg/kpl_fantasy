"use client";

import { useState } from "react";
import Image from "next/image";

interface ClubCrestProps {
  name: string;
  shortName: string;
  logoUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  className?: string;
}

const SIZE_MAP = {
  xs: "w-4 h-4 text-[9px]",
  sm: "w-6 h-6 text-[10px]",
  md: "w-8 h-8 text-xs",
  lg: "w-10 h-10 text-sm",
  xl: "w-12 h-12 text-base",
};

const PIXEL_MAP = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 40,
  xl: 48,
};

export default function ClubCrest({
  name,
  shortName,
  logoUrl,
  size = "md",
  className = "",
}: ClubCrestProps) {
  const [hasError, setHasError] = useState(false);

  const dimensionClasses = SIZE_MAP[size];
  const px = PIXEL_MAP[size];

  if (!logoUrl || hasError) {
    return (
      <div
        className={`${dimensionClasses} rounded-full bg-surface-3 border border-line-strong flex items-center justify-center font-display font-black text-ink-2 uppercase tracking-tighter shrink-0 select-none ${className}`}
        title={name}
        aria-label={name}
      >
        {shortName.slice(0, 3)}
      </div>
    );
  }

  return (
    <div
      className={`${dimensionClasses} relative shrink-0 flex items-center justify-center ${className}`}
      title={name}
    >
      <Image
        src={logoUrl}
        alt={name}
        width={px}
        height={px}
        className="w-full h-full object-contain drop-shadow-sm"
        onError={() => setHasError(true)}
        unoptimized
      />
    </div>
  );
}

