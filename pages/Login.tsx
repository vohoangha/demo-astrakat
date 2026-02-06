
import React, { useState } from 'react';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import { User, Lock, ArrowRight, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';
import { User as UserType } from '../types';
import { apiService } from '../services/apiService';

interface LoginProps {
  onLoginSuccess: (user: UserType) => void;
}

export const Login: React.FC<LoginProps> = ({ onLoginSuccess }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValidUsername = (u: string) => /^[a-z0-9_]+$/.test(u);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please enter both username and password.");
      return;
    }

    const normalizedUser = username.toLowerCase().trim();

    if (!isValidUsername(normalizedUser)) {
        setError("Invalid Username. Use only letters, numbers, and underscores. No spaces or accents.");
        return;
    }

    setLoading(true);
    setError(null);

    try {
      const user = await apiService.login(normalizedUser, password);
      onLoginSuccess(user);
    } catch (err: any) {
      console.error(err);
      let errorMessage = err.message || "Authentication failed. Please check your connection.";
      const lowerMsg = errorMessage.toLowerCase();
      if (lowerMsg.includes("app secret") || lowerMsg.includes("unauthorized") || lowerMsg.includes("invalid")) {
          errorMessage = "Unauthorized: Invalid Credentials";
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-full relative bg-[#103742] overflow-hidden flex flex-col items-center justify-center selection:bg-[#e2b36e] selection:text-[#103742]">
      <div className="absolute inset-0 overflow-hidden pointer-events-none transform-gpu translate-z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-[#103742] via-[#09232b] to-[#103742] blur-[120px] opacity-40 will-change-transform"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full bg-gradient-to-tl from-[#e2b36e] via-[#b28e67] to-[#103742] blur-[120px] opacity-20 will-change-transform"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-black/40 blur-[80px]"></div>
        <div className="absolute inset-0 backdrop-blur-[60px]"></div>
        <div className="absolute inset-0 z-0 opacity-50 mix-blend-overlay" style={{backgroundImage: `repeating-linear-gradient(90deg,rgba(255,255,255,0) 0px,rgba(255,255,255,0.1) 10px,rgba(255,255,255,0.2) 15px,rgba(255,255,255,0.1) 20px,rgba(255,255,255,0) 30px,rgba(0,0,0,0.2) 40px,rgba(0,0,0,0.5) 45px,rgba(0,0,0,0.2) 50px,rgba(0,0,0,0) 60px)`}}></div>
        <div className="absolute inset-0 opacity-[0.07] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-screen"></div>
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/80"></div>
      </div>

      <GlassCard className="p-8 sm:p-12 flex flex-col items-center w-full max-w-md mx-4 text-center z-10 relative border-[#e2b36e]/20 shadow-2xl backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-500 bg-[#09232b]/60">
        <div className="flex flex-col justify-center items-center mb-8 w-full">
            <h1 className="text-5xl font-black text-[#e2b36e] tracking-tighter leading-none uppercase drop-shadow-[0_2px_10px_rgba(226,179,110,0.2)]">ASTRA</h1>
            <p className="text-[0.65rem] font-bold tracking-[0.4em] uppercase text-[#e2b36e] pl-0.5 leading-none mt-2 opacity-90">Creatives from the stars</p>
            <div className="w-full mt-6 border-t border-[#e2b36e]/20"></div>
        </div>

        <h2 className="text-sm font-bold text-[#e2b36e] uppercase tracking-widest mb-2">Welcome Back</h2>
        <p className="text-[#e2b36e]/60 text-[10px] font-normal tracking-widest mb-8">The Universe has been waiting. Resume your journey.</p>

        <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
            <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#e2b36e]/60 group-focus-within:text-[#e2b36e] transition-colors">
                    <User size={18} />
                </div>
                <input 
                    type="text" 
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase())}
                    placeholder="Username"
                    className="w-full bg-[#09232b]/80 border border-[#e2b36e]/20 rounded-xl py-3 pl-10 pr-4 text-[#e2b36e] placeholder-[#e2b36e]/30 focus:outline-none focus:border-[#e2b36e]/60 focus:bg-[#09232b] transition-all"
                />
            </div>

            <div className="relative group">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#e2b36e]/60 group-focus-within:text-[#e2b36e] transition-colors">
                    <Lock size={18} />
                </div>
                <input 
                    type={showPassword ? "text" : "password"} 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Password"
                    className="w-full bg-[#09232b]/80 border border-[#e2b36e]/20 rounded-xl py-3 pl-10 pr-10 text-[#e2b36e] placeholder-[#e2b36e]/30 focus:outline-none focus:border-[#e2b36e]/60 focus:bg-[#09232b] transition-all"
                />
                <button 
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#e2b36e]/60 hover:text-[#e2b36e] transition-colors p-1"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
            </div>

            {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2 text-red-200 text-xs text-left animate-in slide-in-from-top-1">
                    <AlertCircle size={14} className="flex-none" />
                    <span>{error}</span>
                </div>
            )}

            <Button 
                type="submit" 
                className="w-full mt-2 py-3 hover:shadow-[0_0_20px_rgba(226,179,110,0.4)] transition-all duration-300 font-bold tracking-wide" 
                variant="primary"
                disabled={loading}
            >
                {loading ? (
                    <>
                        <Loader2 size={18} className="animate-spin" /> Authenticating...
                    </>
                ) : (
                    <>
                        Align Your Stars <ArrowRight size={18} />
                    </>
                )}
            </Button>
        </form>

        <div className="mt-8 pt-6 border-t border-[#e2b36e]/10 w-full">
             <p className="text-[10px] text-[#e2b36e]/40 uppercase tracking-widest">
                 Authorized Astra Creatives Only
             </p>
        </div>
      </GlassCard>
    </div>
  );
};
