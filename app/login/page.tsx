"use client";

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center text-slate-100 font-sans">
      <div className="bg-[#0F172A] p-8 rounded-xl border border-white/5 max-w-md w-full shadow-2xl">
        <h1 className="text-2xl font-bold mb-6 text-center tracking-tight">KPL Fantasy Login</h1>
        <p className="text-sm text-slate-400 text-center mb-8">
          Authentication providers will be configured here shortly.
        </p>
        <button 
          disabled
          className="w-full bg-[#00E5FF]/20 text-[#00E5FF] font-bold py-3 rounded-lg border border-[#00E5FF]/50 opacity-50 cursor-not-allowed"
        >
          Sign In with Google
        </button>
      </div>
    </div>
  );
}