
import React, { createContext, useContext, useState, ReactNode } from 'react';
import { GlassCard } from '../components/GlassCard';
import { CheckCircle2, AlertTriangle, Info, X, ShieldAlert } from 'lucide-react';
import { Button } from '../components/Button';

type NotificationType = 'success' | 'warning' | 'info';

interface NotificationContextProps {
  showNotification: (message: string, type?: NotificationType, onConfirm?: () => void, actionLabel?: string) => void;
  closeNotification: () => void;
}

const NotificationContext = createContext<NotificationContextProps | undefined>(undefined);

export const useNotification = () => {
  const context = useContext(NotificationContext);
  if (!context) {
    throw new Error('useNotification must be used within a NotificationProvider');
  }
  return context;
};

export const NotificationProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState('');
  const [type, setType] = useState<NotificationType>('success');
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => void) | null>(null);
  const [actionLabel, setActionLabel] = useState<string | null>(null);

  const showNotification = (msg: string, notifType: NotificationType = 'success', onConfirm?: () => void, label?: string) => {
    setMessage(msg);
    setType(notifType);
    setOnConfirmCallback(() => onConfirm || null);
    setActionLabel(label || null);
    setIsOpen(true);
  };

  const closeNotification = () => {
    setIsOpen(false);
    if (onConfirmCallback) {
        onConfirmCallback();
        setOnConfirmCallback(null);
    }
  };

  const getIcon = () => {
      switch(type) {
          case 'success': return <CheckCircle2 size={40} className="text-[#e2b36e]" />;
          case 'warning': return <ShieldAlert size={40} className="text-red-400" />;
          default: return <Info size={40} className="text-[#e2b36e]" />;
      }
  };

  const getTitle = () => {
      switch(type) {
          case 'success': return "Success";
          case 'warning': return "System Alert";
          default: return "Information";
      }
  };

  const getColorClass = () => {
      switch(type) {
          case 'success': return "from-[#e2b36e]/20 to-[#e2b36e]/5 border-[#e2b36e]/30 shadow-[0_0_40px_rgba(226,179,110,0.15)]";
          case 'warning': return "from-red-900/40 to-orange-900/10 border-red-500/30 shadow-[0_0_40px_rgba(220,38,38,0.15)]";
          default: return "from-slate-800/60 to-slate-900/60 border-[#e2b36e]/10";
      }
  };

  return (
    <NotificationContext.Provider value={{ showNotification, closeNotification }}>
      {children}
      {isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-300">
           <GlassCard className={`max-w-sm w-full p-0 flex flex-col items-center text-center relative bg-gradient-to-br ${getColorClass()} overflow-hidden ring-1 ring-[#e2b36e]/10`}>
                
                {/* Close Button (X) - Hidden for critical warnings */}
                {type !== 'warning' && (
                  <button 
                      onClick={closeNotification} 
                      className="absolute top-3 right-3 p-2 text-[#e2b36e]/30 hover:text-[#e2b36e] hover:bg-[#e2b36e]/10 rounded-full transition-colors z-20"
                  >
                      <X size={18} />
                  </button>
                )}

                <div className="p-8 flex flex-col items-center w-full">
                    <div className={`mb-4 p-3 rounded-full bg-black/40 border border-[#e2b36e]/20 shadow-inner ${type === 'success' ? 'animate-bounce-short' : ''}`}>
                        {getIcon()}
                    </div>
                    
                    <h3 className="text-xl font-black text-[#e2b36e] uppercase tracking-tight mb-2 drop-shadow-md">
                        {getTitle()}
                    </h3>
                    
                    <p className="text-sm text-[#e2b36e]/80 font-medium leading-relaxed mb-2">
                        {message}
                    </p>
                </div>

                {/* Show button if it's not success OR if we have a callback action (like logout) */}
                {(type !== 'success' || onConfirmCallback) && (
                    <div className="w-full p-6 pt-0">
                         {/* CHANGED: Forced styles with !important to ensure visibility */}
                         <Button 
                            onClick={closeNotification} 
                            className="w-full py-3 font-bold tracking-widest uppercase text-xs shadow-xl !bg-[#e2b36e] !text-[#09232b] hover:!bg-[#b28e67] !border-0"
                         >
                            {actionLabel ? actionLabel : (type === 'warning' ? 'LOGOUT' : 'Close')}
                         </Button>
                    </div>
                )}
           </GlassCard>
        </div>
      )}
    </NotificationContext.Provider>
  );
};
