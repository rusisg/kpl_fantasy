"use client";

import { useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      await signIn("google", { callbackUrl: "/squad" });
    } catch {
      setErrorMessage("Failed to initiate Google Sign-In. Please check OAuth configuration.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4 text-slate-100 font-sans">
      <div className="bg-slate-900 p-8 rounded-3xl border border-slate-800 max-w-md w-full shadow-2xl space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <div className="w-14 h-14 bg-gradient-to-br from-emerald-400 to-green-600 rounded-2xl shadow-lg flex items-center justify-center border-2 border-emerald-300">
            <span className="text-xl font-black text-white tracking-tighter">
              KPL
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white">
            KPL Fantasy Login
          </h1>
          <p className="text-sm text-slate-400 font-medium">
            Sign in with your Google account to save and sync your 15-man KPL squad across all devices.
          </p>
        </div>

        {errorMessage && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-red-500/20 border border-red-500/40 text-red-300 text-xs font-bold text-center"
          >
            {errorMessage}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full flex items-center justify-center gap-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-white font-black py-3.5 px-6 rounded-2xl shadow-lg shadow-emerald-500/25 border border-emerald-300/40 transition-all disabled:opacity-50"
        >
          <span>{loading ? "Redirecting to Google..." : "Sign in with Google"}</span>
        </button>

        <div className="pt-2 border-t border-slate-800 text-center space-y-2">
          <Link
            href="/squad"
            className="block text-xs font-bold text-slate-400 hover:text-emerald-400 transition-colors"
          >
            Continue to Squad Builder →
          </Link>
          <p className="text-[11px] text-slate-500">
            Данные клубов и матчей:{" "}
            <a
              href="https://kffleague.kz"
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:underline"
            >
              kffleague.kz
            </a>{" "}
            (При использовании материалов обязательна ссылка на официальный сайт.)
          </p>
        </div>
      </div>
    </div>
  );
}
