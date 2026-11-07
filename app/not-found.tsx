"use client";

import Link from "next/link";
import { useTranslation } from "../lib/i18n";

export default function NotFound() {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen flex items-center justify-center p-4 text-center">
      <div className="card p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-4">
        <div className="text-4xl">⚽</div>
        <h1 className="font-display font-black text-2xl text-ink uppercase tracking-tight">
          {t("notFound.title")}
        </h1>
        <p className="text-xs text-muted">
          404 — The page you are looking for does not exist.
        </p>
        <Link
          href="/squad"
          className="inline-flex h-11 px-6 rounded-xl bg-accent text-on-accent font-display font-black text-xs uppercase tracking-wider items-center justify-center transition-all shadow-md shadow-accent/20"
        >
          {t("notFound.back")}
        </Link>
      </div>
    </div>
  );
}

