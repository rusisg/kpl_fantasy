"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const router = useRouter();
  const [teamName, setTeamName] = useState("");
  const [favoriteClub, setFavoriteClub] = useState("");
  const [strategy, setStrategy] = useState("BALANCED");
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleComplete = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    setTimeout(() => {
      setLoading(false);
      onClose();
    }, 1500);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-slate-900 border border-slate-800 w-full max-w-lg shadow-2xl rounded-3xl overflow-hidden">
        
        {/* Header Graphic */}
        <div className="bg-gradient-to-r from-emerald-600 to-green-500 p-8 text-center relative overflow-hidden">
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(255,255,255,0.1) 10px, rgba(255,255,255,0.1) 20px)' }}></div>
          <h2 className="text-3xl font-extrabold text-white tracking-tight relative z-10">Welcome Manager</h2>
          <p className="text-emerald-50 mt-2 text-sm font-medium relative z-10">Set up your profile to start building your squad</p>
        </div>

        <div className="p-8">
          <form onSubmit={handleComplete} className="space-y-6">
            
            <div className="space-y-2">
              <label htmlFor="teamName" className="text-sm font-bold text-slate-300">
                Team Name
              </label>
              <input 
                id="teamName"
                type="text"
                required
                placeholder="e.g. Almaty All-Stars"
                className="w-full bg-slate-950 border border-slate-700 px-4 py-3 text-white rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all placeholder:text-slate-600 font-medium"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="favoriteClub" className="text-sm font-bold text-slate-300">
                Favorite Club
              </label>
              <select 
                id="favoriteClub"
                className="w-full bg-slate-950 border border-slate-700 px-4 py-3 text-white rounded-xl focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all appearance-none font-medium"
                value={favoriteClub}
                onChange={(e) => setFavoriteClub(e.target.value)}
              >
                <option value="">No preference</option>
                <option value="astana">FC Astana</option>
                <option value="kairat">FC Kairat</option>
                <option value="aktobe">FC Aktobe</option>
                <option value="ordabasy">FC Ordabasy</option>
                <option value="kyzylzhar">Kyzylzhar SK</option>
              </select>
            </div>

            <div className="space-y-3 pt-2">
              <span className="text-sm font-bold text-slate-300">Autopick Strategy</span>
              
              <div className="grid grid-cols-2 gap-4">
                <label className={`flex flex-col p-4 border-2 rounded-2xl cursor-pointer transition-all ${strategy === "BALANCED" ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}>
                  <input 
                    type="radio" 
                    name="strategy" 
                    value="BALANCED"
                    checked={strategy === "BALANCED"}
                    onChange={() => setStrategy("BALANCED")}
                    className="sr-only"
                  />
                  <div className="text-sm font-bold text-white mb-1">Balanced</div>
                  <div className="text-xs text-slate-400 font-medium">Even budget across the pitch.</div>
                </label>

                <label className={`flex flex-col p-4 border-2 rounded-2xl cursor-pointer transition-all ${strategy === "PREMIUM_ATTACK" ? 'border-emerald-500 bg-emerald-500/10' : 'border-slate-800 bg-slate-950 hover:border-slate-700'}`}>
                  <input 
                    type="radio" 
                    name="strategy" 
                    value="PREMIUM_ATTACK"
                    checked={strategy === "PREMIUM_ATTACK"}
                    onChange={() => setStrategy("PREMIUM_ATTACK")}
                    className="sr-only"
                  />
                  <div className="text-sm font-bold text-white mb-1">Heavy Attack</div>
                  <div className="text-xs text-slate-400 font-medium">Focus funds on goalscorers.</div>
                </label>
              </div>
            </div>

            <button 
              type="submit" 
              disabled={loading}
              className="w-full bg-gradient-to-r from-emerald-500 to-green-500 text-white font-black text-lg py-4 rounded-xl hover:from-emerald-400 hover:to-green-400 transition-all mt-4 shadow-lg shadow-emerald-500/25 disabled:opacity-50"
            >
              {loading ? "Drafting Players..." : "Enter Game"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}