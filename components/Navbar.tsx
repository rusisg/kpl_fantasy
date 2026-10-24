"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSquadStore } from "../store/useSquadStore";

function formatDeadlineStatus(deadlineIso?: string, isLocked?: boolean): string {
  if (!deadlineIso) return "Schedule Pending";
  const deadline = new Date(deadlineIso);
  if (isLocked || deadline.getTime() <= Date.now()) {
    return "Deadline Passed • Locked";
  }

  const diffMs = deadline.getTime() - Date.now();
  const totalMinutes = Math.max(0, Math.floor(diffMs / (1000 * 60)));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;

  if (days > 0) return `Locks in ${days}d ${hours}h`;
  if (hours > 0) return `Locks in ${hours}h ${mins}m`;
  return `Locks in ${mins}m`;
}

export default function Navbar() {
  const pathname = usePathname();
  const { squadName, userProfile, activeGameweek, squadTotalPoints } =
    useSquadStore();

  const navItems = [
    { href: "/squad", label: "Squad & Transfers" },
    { href: "/leagues", label: "Mini-Leagues" },
  ];

  return (
    <nav className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
        {/* Brand & Links */}
        <div className="flex items-center gap-6">
          <Link href="/squad" className="flex items-center gap-3 group">
            <div className="w-9 h-9 bg-gradient-to-br from-emerald-400 to-green-600 rounded-xl shadow-md flex items-center justify-center border border-emerald-300/80 group-hover:scale-105 transition-transform">
              <span className="text-sm font-black text-white tracking-tighter">
                KPL
              </span>
            </div>
            <div className="hidden sm:block">
              <span className="text-base font-black tracking-tight text-white">
                KPL Fantasy
              </span>
              <span className="block text-[10px] font-bold uppercase tracking-widest text-slate-400">
                Unofficial Simulator
              </span>
            </div>
          </Link>

          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            {navItems.map((item) => {
              const isActive =
                pathname === item.href || pathname?.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-4 py-1.5 rounded-lg text-xs font-black tracking-wide transition-all ${
                    isActive
                      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-500/30"
                      : "text-slate-400 hover:text-white hover:bg-slate-800/60"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>

        {/* Live Gameweek & Manager Pill */}
        <div className="flex items-center gap-3">
          {activeGameweek && (
            <div
              className={`hidden md:flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl border text-xs font-bold ${
                activeGameweek.isLocked
                  ? "bg-amber-500/10 border-amber-500/30 text-amber-300"
                  : "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  activeGameweek.isLocked
                    ? "bg-amber-400"
                    : "bg-emerald-400 animate-pulse"
                }`}
              />
              <span className="font-black uppercase tracking-wider">
                GW {activeGameweek.id}
              </span>
              <span className="text-slate-400">•</span>
              <span>
                {formatDeadlineStatus(
                  activeGameweek.deadline,
                  activeGameweek.isLocked
                )}
              </span>
            </div>
          )}

          {userProfile && (
            <div className="flex items-center gap-2.5 bg-slate-900 border border-slate-800 px-3.5 py-1.5 rounded-xl">
              {userProfile.favoriteClub && (
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-[10px] font-black uppercase">
                  {userProfile.favoriteClub.shortName}
                </span>
              )}
              <div className="text-right">
                <div className="text-xs font-black text-white truncate max-w-[140px]">
                  {squadName || userProfile.name || "New Manager"}
                </div>
                <div className="text-[10px] font-bold text-slate-400">
                  {userProfile.name || "Manager"} • {squadTotalPoints} pts
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </nav>
  );
}
