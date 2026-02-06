
import React, { useState, useRef, useEffect } from 'react';
import { LogOut, Upload, ChevronDown, Wallet, Loader2, Lock, ShieldAlert, X, ShieldCheck, Eye, EyeOff, Shield } from 'lucide-react';
import { User } from '../types';
import { apiService } from '../services/apiService';
import { saveUserToCookie, saveLocalAvatar, getLocalAvatar } from '../utils/storage';
import { AdminDashboard } from './AdminDashboard';
import { GlassCard } from './GlassCard';
import { Button } from './Button';
import { useNotification } from '../context/NotificationContext';

interface UserProfileProps {
  user: User;
  onSignOut: () => void;
  onPasswordChange: (newToken: string) => void;
}

const DEFAULT_AVATAR = "https://ui-avatars.com/api/?name=Astra+User&background=103742&color=e2b36e&size=128";

export const UserProfile: React.FC<UserProfileProps> = ({
  user,
  onSignOut,
  onPasswordChange
}) => {
  const { showNotification } = useNotification();
  const [avatar, setAvatar] = useState<string>(() => {
      const cached = getLocalAvatar();
      if (cached) return cached;
      return user.avatarUrl || DEFAULT_AVATAR;
  });
  
  const [isOpen, setIsOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);

  // --- SECURITY CHECK STATE ---
  const [isSecurityCheckOpen, setIsSecurityCheckOpen] = useState(false);
  const [securityPassword, setSecurityPassword] = useState('');
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [showSecurityPass, setShowSecurityPass] = useState(false);
  // ----------------------------

  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [passOld, setPassOld] = useState('');
  const [passNew, setPassNew] = useState('');
  const [passConfirm, setPassConfirm] = useState('');
  
  const [isPassLoading, setIsPassLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const getDisplayUrl = (url: string) => {
     if (!url) return DEFAULT_AVATAR;
     if (url.startsWith('data:')) return url;
     
     let id = '';
     if (url.includes('id=')) {
         try { id = url.split('id=')[1].split('&')[0]; } catch(e){}
     } else if (url.includes('/d/')) {
         try { id = url.split('/d/')[1].split('/')[0]; } catch(e){}
     }

     if (id) {
         return `https://drive.google.com/thumbnail?id=${id}&sz=s500`; 
     }
     
     return url;
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
     if (user.avatarUrl && !getLocalAvatar() && user.avatarUrl !== avatar) {
         setAvatar(user.avatarUrl);
     }
  }, [user.avatarUrl]);

  const compressImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 500;
                const MAX_HEIGHT = 500;
                let width = img.width;
                let height = img.height;

                if (width > height) {
                    if (width > MAX_WIDTH) {
                        height *= MAX_WIDTH / width;
                        width = MAX_WIDTH;
                    }
                } else {
                    if (height > MAX_HEIGHT) {
                        width *= MAX_HEIGHT / height;
                        height = MAX_HEIGHT;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    resolve(event.target?.result as string);
                    return;
                }
                
                ctx.drawImage(img, 0, 0, width, height);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
                resolve(dataUrl);
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
        setIsOpen(false);
        setIsUploading(true);
        
        const oldAvatarUrl = user.avatarUrl || DEFAULT_AVATAR;
        const oldLocalAvatar = getLocalAvatar() || oldAvatarUrl;

        let newDriveUrl = "";

        try {
            const compressedBase64 = await compressImage(file);
            setAvatar(compressedBase64);

            newDriveUrl = await apiService.uploadAvatar(user.username, compressedBase64);
            await apiService.updateUserAvatar(user.username, newDriveUrl);

            const updatedUser = { ...user, avatarUrl: newDriveUrl };
            saveUserToCookie(updatedUser);
            saveLocalAvatar(newDriveUrl);
            
            showNotification("Avatar updated successfully!", "success");
            
        } catch (err: any) {
            console.error("Avatar Update Transaction Failed:", err);
            
            setAvatar(oldLocalAvatar);
            saveLocalAvatar(oldLocalAvatar);
            alert("Connection interrupted. Reverting changes..."); // Error fallback remains alert/toast

            if (newDriveUrl) {
                apiService.deleteAvatar(newDriveUrl);
            }

            if (user.avatarUrl) {
                apiService.updateUserAvatar(user.username, user.avatarUrl)
                    .catch(e => console.warn("Rollback sheet update warning:", e));
            }

        } finally {
            setIsUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    }
  };

  const triggerUpload = () => {
    fileInputRef.current?.click();
  };

  const handlePasswordModalOpen = () => {
      setIsOpen(false);
      setIsPasswordModalOpen(true);
      setPassOld('');
      setPassNew('');
      setPassConfirm('');
      setPassError(null);
  };

  const handlePasswordUpdate = async (e: React.FormEvent) => {
      e.preventDefault();
      setPassError(null);

      if (!passOld || !passNew || !passConfirm) {
          setPassError("All fields are required.");
          return;
      }
      if (passNew !== passConfirm) {
          setPassError("New passwords do not match.");
          return;
      }
      if (passNew.length < 6) {
          setPassError("Password must be at least 6 characters.");
          return;
      }

      setIsPassLoading(true);
      try {
          const newToken = await apiService.changePassword(user.username, passOld, passNew);
          
          setIsPasswordModalOpen(false);
          onPasswordChange(newToken);
          
      } catch (err: any) {
          setPassError(err.message || "Failed to update password.");
      } finally {
          setIsPassLoading(false);
      }
  };

  // --- SECURITY HANDLERS ---
  const handleCommandCenterClick = () => {
      setIsOpen(false);
      setIsSecurityCheckOpen(true);
      setSecurityPassword('');
      setSecurityError(null);
      setShowSecurityPass(false);
  };

  const handleSecuritySubmit = (e: React.FormEvent) => {
      e.preventDefault();
      setSecurityError(null);
      
      const SUPER_ADMIN_PASS = "Astra777"; 

      if (securityPassword === SUPER_ADMIN_PASS) {
          setIsSecurityCheckOpen(false);
          setShowAdminDashboard(true);
          // No notification required, instant access
      } else {
          setSecurityError("Access Denied: Invalid Security Code.");
          setSecurityPassword('');
      }
  };

  return (
    <>
    {showAdminDashboard && <AdminDashboard onClose={() => setShowAdminDashboard(false)} />}
    
    {/* SUPER ADMIN SECURITY MODAL - REDESIGNED */}
    {isSecurityCheckOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-300">
             <GlassCard className="w-full max-w-sm p-0 relative border border-[#e2b36e]/20 shadow-[0_0_60px_rgba(0,0,0,0.6)] overflow-hidden bg-[#09232b]/80">
                 
                 <button 
                    onClick={() => setIsSecurityCheckOpen(false)} 
                    className="absolute top-4 right-4 text-[#e2b36e]/30 hover:text-[#e2b36e] transition-colors"
                 >
                    <X size={18} />
                 </button>
                 
                 <div className="p-10 flex flex-col items-center">
                     {/* Shield Icon Container */}
                     <div className="relative mb-6">
                         <div className="absolute inset-0 bg-[#e2b36e]/20 blur-xl rounded-full"></div>
                         <div className="relative p-4 bg-gradient-to-b from-[#103742] to-[#09232b] rounded-2xl border border-[#e2b36e]/30 shadow-lg">
                            <Shield size={32} className="text-[#e2b36e]" />
                         </div>
                     </div>

                     <div className="text-center mb-8">
                        <h2 className="text-lg font-black uppercase tracking-[0.1em] text-[#e2b36e] drop-shadow-md">Restricted Access</h2>
                        <p className="text-[10px] text-[#e2b36e]/60 font-mono mt-2 tracking-[0.3em] uppercase">System Administrator Only</p>
                     </div>
                     
                     <form onSubmit={handleSecuritySubmit} className="w-full space-y-4">
                        <div className="relative group w-full">
                            <div className="absolute left-4 top-1/2 -translate-y-1/2 text-[#e2b36e]/40 pointer-events-none">
                                <Lock size={16} />
                            </div>
                            <input 
                                type={showSecurityPass ? "text" : "password"} 
                                autoFocus
                                value={securityPassword} 
                                onChange={(e) => { setSecurityPassword(e.target.value); setSecurityError(null); }}
                                className={`w-full bg-black/40 border rounded-xl py-3.5 pl-12 pr-10 text-sm text-[#e2b36e] focus:outline-none transition-all placeholder-[#e2b36e]/20 font-mono tracking-widest text-left ${securityError ? 'border-red-500/50 bg-red-500/5 focus:border-red-500' : 'border-[#e2b36e]/20 focus:border-[#e2b36e]/50 focus:bg-black/60'}`}
                                placeholder="Enter Access Code"
                            />
                            <button 
                                type="button"
                                onClick={() => setShowSecurityPass(!showSecurityPass)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#e2b36e]/30 hover:text-[#e2b36e] transition-colors p-1"
                                tabIndex={-1}
                            >
                                {showSecurityPass ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                        </div>
                        
                        {securityError && (
                            <div className="text-[10px] text-red-400 font-bold tracking-wide animate-in slide-in-from-top-1 text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">
                                {securityError}
                            </div>
                        )}
                        
                        <Button type="submit" className="w-full py-3.5 font-extrabold tracking-[0.2em] text-xs shadow-xl mt-2">
                            ACCESS
                        </Button>
                     </form>
                 </div>
             </GlassCard>
        </div>
    )}

    {isPasswordModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
            <GlassCard className="w-full max-w-sm p-6 relative border border-[#e2b36e]/20 shadow-2xl bg-[#103742]/80">
                <button 
                    onClick={() => setIsPasswordModalOpen(false)} 
                    className="absolute top-4 right-4 text-[#e2b36e]/40 hover:text-[#e2b36e] transition-colors"
                >
                    <X size={20} />
                </button>
                
                <h2 className="text-xl font-bold text-[#e2b36e] mb-1">Change Password</h2>
                <p className="text-xs text-[#e2b36e]/60 mb-6">Secure your creative account</p>
                
                <form onSubmit={handlePasswordUpdate} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-[#e2b36e]/60 uppercase tracking-widest">Current Password</label>
                            <input 
                                type="password" 
                                value={passOld} 
                                onChange={(e) => setPassOld(e.target.value)}
                                className="w-full bg-[#09232b]/50 border border-[#e2b36e]/10 rounded-xl px-4 py-3 text-sm text-[#e2b36e] placeholder-[#e2b36e]/30 focus:border-[#e2b36e]/40 focus:outline-none transition-all"
                                placeholder="Enter current password"
                            />
                        </div>
                        <div className="space-y-1.5">
                             <label className="text-[10px] font-bold text-[#e2b36e]/60 uppercase tracking-widest">New Password</label>
                            <input 
                                type="password" 
                                value={passNew} 
                                onChange={(e) => setPassNew(e.target.value)}
                                className="w-full bg-[#09232b]/50 border border-[#e2b36e]/10 rounded-xl px-4 py-3 text-sm text-[#e2b36e] placeholder-[#e2b36e]/30 focus:border-[#e2b36e]/40 focus:outline-none transition-all"
                                placeholder="Min 6 characters"
                            />
                        </div>
                        <div className="space-y-1.5">
                             <label className="text-[10px] font-bold text-[#e2b36e]/60 uppercase tracking-widest">Confirm Password</label>
                            <input 
                                type="password" 
                                value={passConfirm} 
                                onChange={(e) => setPassConfirm(e.target.value)}
                                className="w-full bg-[#09232b]/50 border border-[#e2b36e]/10 rounded-xl px-4 py-3 text-sm text-[#e2b36e] placeholder-[#e2b36e]/30 focus:border-[#e2b36e]/40 focus:outline-none transition-all"
                                placeholder="Re-enter new password"
                            />
                        </div>

                        {passError && (
                            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-200">
                                {passError}
                            </div>
                        )}

                        <Button 
                            type="submit" 
                            className="w-full py-3 mt-2" 
                            isLoading={isPassLoading}
                        >
                            Update & Logout
                        </Button>
                </form>
            </GlassCard>
        </div>
    )}

    <div className="relative z-50 ml-auto" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-4 p-1.5 pr-5 rounded-full bg-[#09232b]/50 border border-[#e2b36e]/20 hover:bg-[#09232b]/80 hover:border-[#e2b36e]/40 transition-all duration-300 group"
      >
        <div className="relative w-10 h-10 rounded-full overflow-hidden border border-[#e2b36e]/30 shadow-inner group-hover:scale-105 transition-transform bg-black/20 shrink-0">
            <img 
                src={getDisplayUrl(avatar)} 
                alt="User Avatar" 
                referrerPolicy="no-referrer"
                className={`w-full h-full object-cover transition-opacity duration-300 ${isUploading ? 'opacity-50' : 'opacity-100'}`}
                onError={(e) => { 
                    const target = e.currentTarget;
                    if (target.src !== DEFAULT_AVATAR) {
                        target.src = DEFAULT_AVATAR; 
                        try { localStorage.removeItem('astra_user_avatar_cache'); } catch(e){}
                    }
                }}
            />
            {isUploading && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <Loader2 size={16} className="text-[#e2b36e] animate-spin" />
                </div>
            )}
            {!isUploading && (
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <ChevronDown size={14} className="text-[#e2b36e]" />
                </div>
            )}
        </div>

        <div className="flex flex-col items-start min-w-[80px]">
            <span className="text-sm font-bold text-[#e2b36e] leading-none mb-0.5 group-hover:text-[#e2b36e] transition-colors">
                {user.username}
            </span>
            <span className="text-[9px] text-[#e2b36e]/60 font-medium leading-tight mb-1">
                Team {user.team || 'Unknown'}
            </span>
            <div className="flex items-center gap-1.5">
                {/* Changed to White 90% opacity */}
                <Wallet size={10} className="text-white/90" />
                <span className="text-[10px] font-mono text-white/90 font-medium tracking-wide">
                    {user.credits} Credits
                </span>
            </div>
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-[#09232b]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 z-[100]">
            <div className="p-1">
                {user.role === 'admin' && (
                    <>
                    <button 
                        onClick={handleCommandCenterClick}
                        className="group w-full flex items-center gap-3 px-3 py-2.5 text-xs text-[#e2b36e] hover:text-[#e2b36e] hover:bg-[#e2b36e]/10 rounded-lg transition-colors text-left"
                    >
                        <div className="p-1.5 bg-[#e2b36e]/20 rounded-md text-[#e2b36e] shrink-0 group-hover:text-[#09232b] group-hover:bg-[#e2b36e] transition-colors">
                            <ShieldAlert size={14} />
                        </div>
                        <span className="font-bold uppercase tracking-wide group-hover:text-[#e2b36e]">Command Center</span>
                    </button>
                    <div className="h-[1px] w-full bg-[#e2b36e]/10 my-1"></div>
                    </>
                )}

                <button 
                    onClick={triggerUpload}
                    disabled={isUploading}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-xs text-[#e2b36e] hover:text-[#e2b36e] hover:bg-[#e2b36e]/10 rounded-lg transition-colors text-left disabled:opacity-50"
                >
                    <div className="p-1.5 bg-[#e2b36e]/10 rounded-md text-[#e2b36e] shrink-0">
                        <Upload size={14} />
                    </div>
                    <div>
                        <span className="block font-semibold">Change Avatar</span>
                    </div>
                </button>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleFileChange} 
                    accept="image/*" 
                    className="hidden" 
                />

                <div className="h-[1px] w-full bg-[#e2b36e]/10 my-1"></div>

                <button 
                    onClick={handlePasswordModalOpen}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-xs text-[#e2b36e] hover:text-[#e2b36e] hover:bg-[#e2b36e]/10 rounded-lg transition-colors text-left"
                >
                    <div className="p-1.5 bg-[#e2b36e]/10 rounded-md text-[#e2b36e] shrink-0">
                        <Lock size={14} />
                    </div>
                    <span className="font-semibold">Change Password</span>
                </button>

                <div className="h-[1px] w-full bg-[#e2b36e]/10 my-1"></div>

                <button 
                    onClick={onSignOut}
                    className="w-full flex items-center gap-3 px-3 py-2.5 text-xs text-red-300 hover:text-red-200 hover:bg-red-500/10 rounded-lg transition-colors text-left"
                >
                    <div className="p-1.5 bg-red-500/20 rounded-md text-red-400 shrink-0">
                        <LogOut size={14} />
                    </div>
                    <span className="font-semibold">Sign Out</span>
                </button>
            </div>
            
            <div className="bg-black/20 px-3 py-2 text-[9px] text-[#e2b36e]/50 text-center border-t border-[#e2b36e]/10 font-mono tracking-wider">
                ✦ Logged in via the stars ✦
            </div>
        </div>
      )}
    </div>
    </>
  );
};
