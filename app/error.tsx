"use client";

import { useEffect } from "react";
import { useTranslation } from "../lib/i18n";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const { t } = useTranslation();

  useEffect(() => {
    console.error("App Error:", error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 text-center">
      <div className="card p-8 rounded-3xl max-w-md w-full shadow-2xl space-y-4">
        <div className="text-4xl">⚠️</div>
        <h1 className="font-display font-black text-2xl text-ink uppercase tracking-tight">
          {t("error.title")}
        </h1>
        <p className="text-xs text-muted">
          {t("error.desc")}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="h-11 px-6 rounded-xl bg-accent text-on-accent font-display font-black text-xs uppercase tracking-wider transition-all shadow-md shadow-accent/20"
        >
          {t("common.retry")}
        </button>
      </div>
    </div>
  );
}

