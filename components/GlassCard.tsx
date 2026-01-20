
import React from 'react';

interface GlassCardProps {
  children: React.ReactNode;
  className?: string;
}

// Optimized with React.memo to prevent re-renders
export const GlassCard: React.FC<GlassCardProps> = React.memo(({ children, className = '' }) => {
  return (
    <div 
      className={`
        bg-[#005060]/40 
        backdrop-blur-2xl 
        border border-[#e2b36e]/20 
        shadow-[0_0_25px_-5px_rgba(226,179,110,0.15)]
        rounded-2xl
        ${className}
      `}
    >
      {children}
    </div>
  );
});
