"use client";

import { useEffect, useState } from "react";
import { Position } from "@prisma/client";
import { useSquadStore, PlayerMarketItem } from "../../store/useSquadStore";
import OnboardingModal from "../../components/OnboardingModal";

export default function SquadBuilderPage() {
  const {
    squadName,
    selectedPlayers,
    addPlayer,
    removePlayer,
    setCaptain,
    setViceCaptain,
    remainingBudget,
    captainId,
    viceCaptainId,
    activePositionFilter,
    activeClubFilter,
    searchQuery,
    setFilters,
  } = useSquadStore();

  const [marketPlayers, setMarketPlayers] = useState<PlayerMarketItem[]>([]);
  const [clubs, setClubs] = useState<{ id: string; name: string; shortName: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [needsOnboarding, setNeedsOnboarding] = useState(true);

  useEffect(() => {
    async function fetchMarket() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (activePositionFilter !== "ALL") params.append("position", activePositionFilter);
        if (activeClubFilter !== "ALL") params.append("clubId", activeClubFilter);
        if (searchQuery) params.append("search", searchQuery);

        const res = await fetch(`/api/players?${params.toString()}`);
        const data = await res.json();
        if (data.success) {
          setMarketPlayers(data.data);
        }
      } catch (err) {
        console.error("Failed to fetch market players:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchMarket();
  }, [activePositionFilter, activeClubFilter, searchQuery]);

  useEffect(() => {
    async function fetchClubs() {
      try {
        const res = await fetch("/api/players");
        const data = await res.json();
        if (data.success) {
          const clubMap = new Map();
          data.data.forEach((p: PlayerMarketItem) => {
            if (p.club && !clubMap.has(p.club.id)) {
              clubMap.set(p.club.id, p.club);
            }
          });
          setClubs(Array.from(clubMap.values()));
        }
      } catch (err) {
        console.error("Failed to load clubs:", err);
      }
    }
    fetchClubs();
  }, []);

  const handleSaveSquad = async () => {
    if (selectedPlayers.length !== 15) {
      setSaveMessage("⚠️ Squad must contain exactly 15 players.");
      return;
    }
    if (!captainId || !viceCaptainId) {
      setSaveMessage("⚠️ Please select a Captain and Vice-Captain.");
      return;
    }
    setSaving(true);
    setSaveMessage(null);

    try {
      const payload = {
        userId: "demo_user_1",
        name: squadName,
        players: selectedPlayers,
        captainId,
        viceCaptainId,
      };

      const res = await fetch("/api/squad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (data.success) {
        setSaveMessage("🎉 Squad saved successfully!");
      } else {
        const errText = data.errors ? data.errors.map((e: any) => e.message).join(" ") : data.error;
        setSaveMessage(`❌ ${errText}`);
      }
    } catch (err) {
      setSaveMessage("❌ An error occurred while saving.");
    } finally {
      setSaving(false);
    }
  };

  const startingXI = selectedPlayers.filter((p) => p.positionOrder <= 11);
  const bench = selectedPlayers.filter((p) => p.positionOrder > 11);

  const startersByPos = {
    [Position.GK]: startingXI.filter((p) => p.position === Position.GK),
    [Position.DEF]: startingXI.filter((p) => p.position === Position.DEF),
    [Position.MID]: startingXI.filter((p) => p.position === Position.MID),
    [Position.FWD]: startingXI.filter((p) => p.position === Position.FWD),
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 p-4 md:p-8 font-sans selection:bg-emerald-500 selection:text-white">
      <OnboardingModal isOpen={needsOnboarding} onClose={() => setNeedsOnboarding(false)} />
      
      <div className="max-w-[1400px] mx-auto space-y-6">
        
        {/* Playful FPL Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-slate-800/50 p-6 rounded-3xl border border-slate-700/50 shadow-xl backdrop-blur-md">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-400 to-green-600 rounded-2xl shadow-lg flex items-center justify-center border-2 border-emerald-300">
              <span className="text-xl font-black text-white">QFL</span>
            </div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-white">{squadName || "My Fantasy Squad"}</h1>
              <span className="text-sm font-bold text-emerald-400 uppercase tracking-widest">Gameweek 1</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 bg-slate-950/50 p-2 rounded-2xl border border-slate-800">
            <div className="px-6 py-2 text-center border-r border-slate-800">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Players</div>
              <div className="text-2xl font-black text-white">
                <span className={selectedPlayers.length === 15 ? "text-emerald-400" : "text-white"}>
                  {selectedPlayers.length}
                </span>
                <span className="text-slate-600 text-lg">/15</span>
              </div>
            </div>

            <div className="px-6 py-2 text-center">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Bank</div>
              <div className="text-2xl font-black text-emerald-400">
                £{remainingBudget().toFixed(1)}<span className="text-lg">m</span>
              </div>
            </div>

            <div className="pl-2 pr-2">
              <button
                onClick={handleSaveSquad}
                disabled={saving}
                className="bg-gradient-to-b from-emerald-400 to-emerald-600 text-white font-bold px-8 py-3.5 rounded-xl hover:from-emerald-300 hover:to-emerald-500 transition-all shadow-[0_4px_20px_rgba(16,185,129,0.3)] disabled:opacity-50 border border-emerald-300/50"
              >
                {saving ? "Saving..." : "Save Squad"}
              </button>
            </div>
          </div>
        </header>

        {saveMessage && (
          <div className={`p-4 rounded-2xl text-sm font-bold shadow-lg ${saveMessage.startsWith("🎉") ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"}`}>
            {saveMessage}
          </div>
        )}

        {/* Main Grid: Pitch + Market */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          
          {/* Pitch & Bench View (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* The Green FPL Pitch */}
            <div className="relative bg-gradient-to-b from-green-500 to-green-700 rounded-[2.5rem] p-6 min-h-[600px] flex flex-col justify-between overflow-hidden shadow-2xl border-[6px] border-slate-800">
              {/* Pitch Grass Pattern */}
              <div className="absolute inset-0 opacity-15 pointer-events-none" style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 40px, rgba(255,255,255,0.2) 40px, rgba(255,255,255,0.2) 80px)' }} />
              
              {/* Pitch Lines */}
              <div className="absolute inset-x-12 top-0 h-32 border-b-2 border-x-2 border-white/40 rounded-b-3xl pointer-events-none" />
              <div className="absolute inset-x-40 top-0 h-12 border-b-2 border-x-2 border-white/40 rounded-b-xl pointer-events-none" />
              <div className="absolute inset-x-12 bottom-0 h-32 border-t-2 border-x-2 border-white/40 rounded-t-3xl pointer-events-none" />
              <div className="absolute inset-x-0 top-1/2 border-t-2 border-white/40 pointer-events-none" />
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 border-2 border-white/40 rounded-full pointer-events-none" />

              {(["FWD", "MID", "DEF", "GK"] as Position[]).map((pos) => (
                <div key={pos} className="relative z-10 flex items-center justify-around py-2">
                  {startersByPos[pos].length === 0 ? (
                    <div className="text-xs text-white/80 font-black tracking-widest uppercase bg-black/20 backdrop-blur-sm px-4 py-2 rounded-full border border-white/20 shadow-inner">
                      Select {pos}
                    </div>
                  ) : (
                    startersByPos[pos].map((player) => (
                      <div key={player.id} className="group relative flex flex-col items-center drop-shadow-xl hover:scale-105 transition-transform duration-200">
                        
                        {/* Kit Card */}
                        <div className="bg-gradient-to-br from-slate-100 to-slate-300 text-slate-900 border border-white p-1 text-center w-[5.5rem] rounded-xl shadow-lg relative cursor-pointer">
                          
                          {/* Captain/Vice Badges */}
                          {player.id === captainId && (
                            <div className="absolute -top-3 -right-2 bg-emerald-500 text-white text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-full shadow-md border-2 border-white z-10">
                              C
                            </div>
                          )}
                          {player.id === viceCaptainId && (
                            <div className="absolute -top-3 -right-2 bg-slate-800 text-white text-[11px] font-black w-6 h-6 flex items-center justify-center rounded-full shadow-md border-2 border-white z-10">
                              V
                            </div>
                          )}

                          <div className="bg-slate-800 text-white text-[10px] font-black uppercase rounded-t-lg py-1 mb-1 shadow-inner">
                            {player.club?.shortName}
                          </div>
                          
                          <div className="text-xs font-black truncate px-1 text-slate-800">
                            {player.lastName}
                          </div>
                          
                          <div className="bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded mt-1 py-0.5">
                            £{player.price}
                          </div>
                        </div>

                        {/* Hover Actions Panel */}
                        <div className="absolute -bottom-10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 bg-slate-900/90 backdrop-blur p-1.5 rounded-full z-20 shadow-xl border border-slate-700">
                          <button onClick={() => setCaptain(player.id)} className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 text-emerald-400 hover:bg-emerald-500 hover:text-white text-[10px] font-black transition-colors" title="Make Captain">C</button>
                          <button onClick={() => setViceCaptain(player.id)} className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:bg-slate-300 hover:text-slate-900 text-[10px] font-black transition-colors" title="Make Vice-Captain">V</button>
                          <button onClick={() => removePlayer(player.id)} className="w-6 h-6 flex items-center justify-center rounded-full bg-slate-800 text-red-400 hover:bg-red-500 hover:text-white text-[10px] font-black transition-colors" title="Remove Player">✕</button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              ))}
            </div>

            {/* FPL Style Bench */}
            <div className="bg-slate-800/80 backdrop-blur border border-slate-700/50 rounded-3xl p-6 shadow-xl">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-300 mb-4 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                Substitutes
              </h3>
              <div className="grid grid-cols-4 gap-4">
                {bench.map((player) => (
                  <div key={player.id} className="bg-slate-900 border border-slate-700 p-3 rounded-2xl text-center relative group shadow-inner">
                    <div className="text-xs font-black truncate text-white">{player.lastName}</div>
                    <div className="text-[11px] font-bold text-slate-400 mt-1">
                      {player.position} <span className="text-emerald-400 ml-1">£{player.price}</span>
                    </div>
                    <button onClick={() => removePlayer(player.id)} className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-[10px] font-black opacity-0 group-hover:opacity-100 transition-opacity shadow-md border-2 border-slate-900">✕</button>
                  </div>
                ))}
                {Array.from({ length: 4 - bench.length }).map((_, i) => (
                  <div key={i} className="border-2 border-dashed border-slate-700 rounded-2xl p-3 flex flex-col items-center justify-center text-slate-600 h-[68px]">
                    <span className="text-xl font-bold">+</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Player Market (5 cols) */}
          <div className="lg:col-span-5 bg-slate-800/50 backdrop-blur border border-slate-700/50 rounded-[2.5rem] p-6 shadow-xl flex flex-col h-[calc(100vh-14rem)] min-h-[700px]">
            <h2 className="text-xl font-black text-white mb-6 flex items-center gap-2">
              <span className="text-2xl">🛒</span> Player Market
            </h2>

            {/* Filter Pills */}
            <div className="space-y-4 mb-6">
              <input
                type="text"
                placeholder="Search players..."
                value={searchQuery}
                onChange={(e) => setFilters({ search: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 text-white px-5 py-3 rounded-2xl text-sm font-medium focus:outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition-all placeholder:text-slate-500"
              />

              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {(["ALL", "GK", "DEF", "MID", "FWD"] as const).map((pos) => (
                  <button
                    key={pos}
                    onClick={() => setFilters({ position: pos })}
                    className={`px-5 py-2 rounded-full text-xs font-black transition-all whitespace-nowrap ${
                      activePositionFilter === pos
                        ? "bg-emerald-500 text-white shadow-md shadow-emerald-500/25"
                        : "bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-800"
                    }`}
                  >
                    {pos}
                  </button>
                ))}
              </div>

              <select
                value={activeClubFilter}
                onChange={(e) => setFilters({ clubId: e.target.value })}
                className="w-full bg-slate-900 border border-slate-700 text-white px-5 py-3 rounded-2xl text-sm font-medium focus:outline-none focus:border-emerald-500 appearance-none transition-all"
              >
                <option value="ALL">All Clubs</option>
                {clubs.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {/* Market List */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-2 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
              {loading ? (
                <div className="text-center py-10 text-slate-500 text-sm font-bold">Scouting players...</div>
              ) : marketPlayers.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm font-bold">No players match search.</div>
              ) : (
                marketPlayers.map((player) => {
                  const isSelected = selectedPlayers.some((p) => p.id === player.id);
                  return (
                    <div key={player.id} className="flex items-center justify-between p-4 bg-slate-900/80 hover:bg-slate-800 rounded-2xl border border-slate-800/80 transition-all group shadow-sm">
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-slate-700 to-slate-800 flex items-center justify-center text-xs font-black text-slate-300 border border-slate-600">
                          {player.position}
                        </div>
                        <div>
                          <div className="text-sm font-black text-white group-hover:text-emerald-400 transition-colors">
                            {player.firstName} {player.lastName}
                          </div>
                          <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mt-0.5">
                            {player.club?.name}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span className="text-sm font-black text-emerald-400">£{player.price}</span>
                        <button
                          onClick={() => addPlayer(player)}
                          disabled={isSelected}
                          className={`w-8 h-8 rounded-full flex items-center justify-center font-black transition-all ${
                            isSelected
                              ? "bg-slate-800 text-slate-600 cursor-not-allowed"
                              : "bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500 hover:text-white"
                          }`}
                        >
                          {isSelected ? "✓" : "+"}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}