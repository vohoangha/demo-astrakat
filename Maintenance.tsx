
import React from 'react';
import { GlassCard } from './components/GlassCard';

const Maintenance: React.FC = () => {
  return (
    <div className="h-screen w-full relative bg-[#005060] overflow-hidden flex flex-col items-center justify-center selection:bg-red-500 selection:text-white">
      
      {/* BACKGROUND - STATIC & GPU ACCELERATED */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none transform-gpu translate-z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-[#125d6e] via-[#005060] to-[#003b46] blur-[120px] opacity-40 will-change-transform"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full bg-gradient-to-tl from-[#e2b36e] via-[#b28e67] to-[#005060] blur-[120px] opacity-20 will-change-transform"></div>
        
        {/* Added Dark Overlay to match App.tsx */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-black/40 blur-[80px]"></div>
        
        <div className="absolute inset-0 backdrop-blur-[60px]"></div>
        <div className="absolute inset-0 z-0 opacity-50 mix-blend-overlay" style={{backgroundImage: `repeating-linear-gradient(90deg,rgba(255,255,255,0) 0px,rgba(255,255,255,0.1) 10px,rgba(255,255,255,0.2) 15px,rgba(255,255,255,0.1) 20px,rgba(255,255,255,0) 30px,rgba(0,0,0,0.2) 40px,rgba(0,0,0,0.5) 45px,rgba(0,0,0,0.2) 50px,rgba(0,0,0,0) 60px)`}}></div>
        <div className="absolute inset-0 opacity-[0.07] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-screen"></div>
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/80"></div>
      </div>

      {/* HEADER - IDENTICAL TO APP.TSX */}
      <header className="absolute top-0 left-0 w-full h-24 flex items-center justify-center z-20 select-none">
          <div className="w-full max-w-[1920px] mx-auto px-4 lg:px-6 flex items-center gap-3">
              <div className="relative h-16 w-auto flex-none">
                   <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(226,179,110,0.15)_0%,_transparent_70%)] blur-xl"></div>
                   <img 
                    src="https://drive.google.com/thumbnail?id=1LgeMCeo2P5G2ex6Vo9ONZMBVgEA9kGGR&sz=w500" 
                    alt="ASTRA Logo"
                    className="h-full w-auto object-contain relative z-10 drop-shadow-[0_0_15px_rgba(226,179,110,0.2)]"
                    onContextMenu={(e) => e.preventDefault()}
                    draggable={false}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
              </div>
              <div className="flex flex-col justify-center">
                  <h1 className="text-4xl font-black text-white tracking-tighter leading-none uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">ASTRA</h1>
                  <p className="text-[0.6rem] font-bold tracking-[0.4em] uppercase text-white/50 pl-0.5 leading-none mt-1.5">Creatives from the stars</p>
              </div>
          </div>
      </header>

      <GlassCard className="p-12 flex flex-col items-center max-w-2xl mx-4 text-center z-10 relative border-[#e2b36e]/20 shadow-2xl backdrop-blur-2xl">
        
        {/* GLOWING STAR ANIMATION */}
        <div className="relative flex items-center justify-center mb-8">
            <style>{`
                @keyframes star-heartbeat {
                    0% { transform: scale(0.85); opacity: 0.5; filter: drop-shadow(0 0 5px rgba(226,179,110,0.3)); }
                    50% { transform: scale(1.1); opacity: 1; filter: drop-shadow(0 0 15px rgba(226,179,110,0.6)); }
                    100% { transform: scale(0.85); opacity: 0.5; filter: drop-shadow(0 0 5px rgba(226,179,110,0.3)); }
                }
                .animate-star-glow {
                    animation: star-heartbeat 2s infinite ease-in-out;
                }
            `}</style>
            
            {/* Background Glow */}
            <div className="absolute inset-0 bg-gradient-to-r from-[#005060]/30 to-[#e2b36e]/30 blur-2xl rounded-full animate-pulse"></div>

            <svg 
                width="80" 
                height="80" 
                viewBox="0 0 100 100" 
                className="animate-star-glow relative z-10 overflow-visible"
                xmlns="http://www.w3.org/2000/svg"
            >
                <defs>
                    <linearGradient id="astraGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#005060" /> {/* Teal */}
                        <stop offset="50%" stopColor="#e2b36e" /> {/* Gold */}
                        <stop offset="100%" stopColor="#003b46" /> {/* Deep Teal */}
                    </linearGradient>
                </defs>
                <path 
                    d="M 50 0 C 50 35 60 45 100 50 C 60 55 50 65 50 100 C 50 65 40 55 0 50 C 40 45 50 35 50 0 Z" 
                    fill="url(#astraGradient)" 
                    stroke="white"
                    strokeWidth="1"
                    strokeLinejoin="round"
                />
            </svg>
        </div>

        <h1 className="text-4xl md:text-5xl font-black text-[#e2b36e] tracking-tighter uppercase mb-6 drop-shadow-lg">
            System Maintenance
        </h1>
        
        <p className="text-lg md:text-xl text-[#e2b36e]/80 font-medium leading-relaxed max-w-lg">
            We are currently performing scheduled maintenance and will be back shortly. Thanks for sticking with us!
        </p>

      </GlassCard>

      {/* FOOTER */}
      <footer className="absolute bottom-8 w-full text-center">
          <p className="text-[#e2b36e]/30 text-xs font-mono uppercase tracking-[0.3em]">
              ASTRA • SYSTEM MAINTENANCE
          </p>
      </footer>

    </div>
  );
};

export default Maintenance;