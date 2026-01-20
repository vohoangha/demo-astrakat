
import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'glass' | 'rainbow' | 'rainbow-stop';
  isLoading?: boolean;
}

// Optimized with React.memo so the button doesn't re-render unless props change
export const Button: React.FC<ButtonProps> = React.memo(({ 
  children, 
  variant = 'primary', 
  isLoading = false, 
  className = '',
  ...props 
}) => {
  
  // Removed 'disabled:opacity-50' to keep the button bright even when disabled
  const baseStyles = "px-6 py-3 rounded-xl font-medium transition-all duration-300 flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-transparent disabled:cursor-not-allowed";
  
  const variants = {
    // Primary updated to Teal gradient
    primary: "bg-gradient-to-r from-[#005060] to-[#0a3f4c] text-[#e2b36e] shadow-lg hover:shadow-[#e2b36e]/20 border border-[#e2b36e]/20",
    secondary: "bg-white bg-opacity-20 hover:bg-opacity-30 text-white border border-white border-opacity-20 focus:ring-white",
    glass: "bg-white/5 hover:bg-white/10 text-white border border-white/10 backdrop-blur-md",
    rainbow: "", // Custom handled below
    "rainbow-stop": "" // Custom handled below
  };

  // Unified Logic for Rainbow (Generate) and Rainbow-Stop (Stop) to prevent unmounting flicker
  if (variant === 'rainbow' || variant === 'rainbow-stop') {
    const isStop = variant === 'rainbow-stop';
    
    // KATINAT THEME GRADIENTS
    // Generate: Gold Spin -> Teal Background
    // Spin: Gold -> White -> Gold
    const generateSpinGradient = 'conic-gradient(from 0deg, #b28e67, #ffffff, #b28e67)'; 
    // Inner: Deep Teal Gradient
    const generateInnerGradient = 'bg-gradient-to-r from-[#005060] to-[#003b46]';
    
    // Stop: Red -> DarkRed -> Red
    const stopSpinGradient = 'conic-gradient(from 0deg, #dc2626, #7f1d1d, #dc2626)';
    const stopInnerGradient = 'bg-gradient-to-r from-red-700 to-red-900';

    const currentSpinGradient = isStop ? stopSpinGradient : generateSpinGradient;
    const currentInnerGradient = isStop ? stopInnerGradient : generateInnerGradient;
    
    // Text Color: Gold for Generate, White for Stop
    const textColorClass = isStop ? 'text-white' : 'text-[#e2b36e]';

    return (
      <button 
        className={`relative group rounded-xl ${className} ${isLoading ? 'opacity-90' : ''}`}
        disabled={isLoading && !isStop} // Allow clicking stop while loading
        {...props}
      >
        <style>{`
          @keyframes scan-light {
            0% { transform: translateX(-150%) skewX(-25deg); opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { transform: translateX(350%) skewX(-25deg); opacity: 0; }
          }
        `}</style>

        {/* Glow Layer - Gold glow for Generate */}
        <div className={`absolute -inset-[3px] rounded-xl overflow-hidden blur-xl transition-all duration-500 ${isStop ? 'opacity-40 group-hover:opacity-60 bg-red-600' : 'opacity-40 group-hover:opacity-70 bg-[#b28e67]'}`}>
             <div className="absolute inset-0 flex items-center justify-center">
                 <div 
                   className="w-[300%] aspect-square animate-spin-slow flex-none" 
                   style={{ 
                     backgroundImage: currentSpinGradient,
                   }}
                 />
            </div>
        </div>
        
        {/* Border Spin Layer */}
        <div className="relative rounded-xl overflow-hidden p-[2px] transition-all duration-300">
            {/* Spinning Border Gradient */}
            <div className="absolute inset-0 flex items-center justify-center">
                 <div 
                   className="w-[300%] aspect-square animate-spin-slow flex-none" 
                   style={{ 
                     backgroundImage: currentSpinGradient,
                   }}
                 />
            </div>
            
            {/* Inner Content - Background Color */}
            <div className={`relative h-full w-full rounded-[9px] px-6 py-3 flex items-center justify-center gap-2 overflow-hidden font-bold tracking-wider shadow-inner z-10 transition-all duration-500 ${currentInnerGradient} ${!isStop && 'group-hover:brightness-110'} ${textColorClass}`}>
                
                {/* SCAN EFFECT - ONLY FOR STOP BUTTON */}
                {isStop && (
                    <div 
                      className="absolute inset-y-0 w-2/3 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none"
                      style={{ animation: 'scan-light 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite' }}
                    ></div>
                )}
                
                {/* Content */}
                <div className="relative z-10 flex items-center gap-2 transition-all duration-300">
                  {isLoading && !isStop ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-[#e2b36e]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing...
                    </>
                  ) : children}
                </div>
            </div>
        </div>
      </button>
    );
  }

  // Standard Variants
  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${className}`}
      disabled={isLoading || props.disabled}
      {...props}
    >
      {isLoading ? (
        <>
          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          Processing...
        </>
      ) : children}
    </button>
  );
});
