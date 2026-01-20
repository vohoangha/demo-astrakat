
import React from 'react';
import { GlassCard } from './components/GlassCard';

const Maintenance: React.FC = () => {
  return (
    <div className="h-screen w-full relative bg-[#005060] overflow-hidden flex flex-col items-center justify-center selection:bg-red-500 selection:text-white">
      
      {/* BACKGROUND - STATIC & GPU ACCELERATED */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none transform-gpu translate-z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-[#125d6e] via-[#005060] to-[#003b46] blur-[120px] opacity-40 will-change-transform"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full bg-gradient-to-tl from-[#e2b36e] via-[#b28e67] to-[#005060] blur-[120px] opacity-20 will-change-transform"></div>
        <div className="absolute inset-0 backdrop-blur-[60px]"></div>
        <div className="absolute inset-0 z-0 opacity-50 mix-blend-overlay" style={{backgroundImage: `repeating-linear-gradient(90deg,rgba(255,255,255,0) 0px,rgba(255,255,255,0.1) 10px,rgba(255,255,255,0.2) 15px,rgba(255,255,255,0.1) 20px,rgba(255,255,255,0) 30px,rgba(0,0,0,0.2) 40px,rgba(0,0,0,0.5) 45px,rgba(0,0,0,0.2) 50px,rgba(0,0,0,0) 60px)`}}></div>
        <div className="absolute inset-0 opacity-[0.07] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-screen"></div>
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/80"></div>
      </div>

      {/* HEADER - LOGO TOP LEFT */}
      <header className="absolute top-0 left-0 w-full p-8 z-20 flex items-center gap-6">
        <img 
          src="https://drive.google.com/thumbnail?id=1LgeMCeo2P5G2ex6Vo9ONZMBVgEA9kGGR&sz=w500" 
          alt="ASTRA Logo"
          className="h-20 w-auto object-contain drop-shadow-2xl" 
          draggable={false}
        />
        <div className="flex flex-col justify-center">
            <h2 className="text-5xl font-black text-white tracking-wider leading-[0.9] drop-shadow-md">
              ASTRA
            </h2>
            <span className="text-[10px] text-white/50 uppercase tracking-[0.38em] font-bold ml-1 mt-1">
              Creatives From The Stars
            </span>
        </div>
      </header>

      <GlassCard className="p-12 flex flex-col items-center max-w-2xl mx-4 text-center z-10 relative border-[#e2b36e]/20 shadow-2xl backdrop-blur-2xl">
        
        {/* GLOWING STAR ANIMATION - MOVED ABOVE TEXT */}
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
