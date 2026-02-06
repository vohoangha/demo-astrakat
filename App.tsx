
import React, { useState, useEffect, useRef } from 'react';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import Maintenance from './components/Maintenance';
import { User } from './types';
import { getUserFromCookie, saveUserToCookie, removeUserCookie } from './utils/storage';
import { apiService, checkWebAccess } from './services/apiService';
import { useNotification } from './context/NotificationContext';
import { supabase } from './services/supabaseClient';
import { IS_DEV_MODE } from './dev/config';

const IS_MAINTENANCE_MODE = false; 

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(() => getUserFromCookie());
  const { showNotification } = useNotification();
  const [isSessionValid, setIsSessionValid] = useState(true);
  
  const userRef = useRef<User | null>(user);

  useEffect(() => {
      userRef.current = user;
  }, [user]);

  useEffect(() => {
      const initialSync = async () => {
          if (user && user.username && isSessionValid) {
              try {
                  const freshUser = await apiService.getUserProfile(user.username);
                  if (freshUser) {
                      if (user.session_token && freshUser.session_token && user.session_token !== freshUser.session_token) {
                          handleSessionMismatch();
                          return;
                      }
                      setUser(freshUser);
                      saveUserToCookie(freshUser);
                  }
              } catch (e) { console.warn("Initial sync failed", e); }
          }
      };
      initialSync();
  }, []);

  useEffect(() => {
    if (!user || !user.username || IS_DEV_MODE) return;

    const channel = supabase.channel(`realtime_${user.username}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `username=eq.${user.username}`,
        },
        (payload) => {
          const newUserFunc = payload.new;
          const currentUser = userRef.current;

          if (!currentUser) return;

          if (newUserFunc.status === 'banned') {
              handleAccountBanned();
              return;
          }
          if (newUserFunc.status === 'deleted user') {
              handleAccountDeleted();
              return;
          }

          if (currentUser.session_token && newUserFunc.session_token && currentUser.session_token !== newUserFunc.session_token) {
              handleSessionMismatch();
              return;
          }

          // NEW: Web Access Check
          const newWebAccess = (newUserFunc.web_access === 'BOTH' ? 'ALL' : newUserFunc.web_access) || 'ALL';
          try {
              checkWebAccess(newWebAccess);
          } catch(e) {
              setIsSessionValid(false);
              showNotification(
                  "Access permissions updated. You no longer have access to this portal.", 
                  "warning", 
                  () => { handleSignOut(); }, 
                  "LOGOUT"
              );
              return;
          }

          setUser(prev => {
              if (!prev) return null;
              const updatedUser: User = {
                  ...prev,
                  credits: newUserFunc.credits,
                  role: newUserFunc.role,
                  status: newUserFunc.status,
                  team: newUserFunc.team,
                  avatarUrl: newUserFunc.avatar_url,
                  session_token: newUserFunc.session_token,
                  web_access: newWebAccess as any 
              };
              if (JSON.stringify(prev) !== JSON.stringify(updatedUser)) {
                  saveUserToCookie(updatedUser);
                  return updatedUser;
              }
              return prev;
          });
        }
      )
      .on(
        'postgres_changes',
        {
           event: 'INSERT',
           schema: 'public',
           table: 'transactions',
           filter: `username=eq.${user.username}`,
        },
        (payload) => {
           const tx = payload.new;
           
           if (tx.type === 'usage') return;

           if (tx.amount > 0) {
               showNotification(`Balance Updated: ${tx.content}`, 'success');
           } else if (tx.amount < 0) {
               showNotification(`Balance Updated: ${tx.content}`, 'info');
           }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.username]); 

  const handleSessionMismatch = () => {
      setIsSessionValid(false);
      showNotification(
          "Session Invalidated. Your password may have been reset or your account was logged in from another location.",
          "warning",
          () => { handleSignOut(); },
          "LOGOUT"
      );
  };

  const handlePasswordChange = (newToken: string) => {
      if (user) {
          const updated = { ...user, session_token: newToken };
          setUser(updated);
          userRef.current = updated;
          saveUserToCookie(updated);
      }
      
      showNotification(
          "Password changed successfully. Please login again.",
          "success",
          () => { handleSignOut(); },
          "Login Again"
      );
  };

  const handleAccountBanned = () => {
      setIsSessionValid(false);
      showNotification(
          "Your account has been suspended by the administrator.",
          "warning",
          () => { handleSignOut(); },
          "LOGOUT"
      );
  };

  const handleAccountDeleted = () => {
      setIsSessionValid(false);
      showNotification(
          "Your account has been permanently deleted by the administrator.",
          "warning",
          () => { handleSignOut(); },
          "LOGOUT"
      );
  };

  const handleLoginSuccess = (loggedInUser: User) => {
    saveUserToCookie(loggedInUser); 
    setUser(loggedInUser);
    setIsSessionValid(true);
  };

  const handleSignOut = () => {
    removeUserCookie(); 
    setUser(null);
  };

  if (IS_MAINTENANCE_MODE) {
    return <Maintenance />;
  }

  if (!user) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  return <Dashboard user={user} onSignOut={handleSignOut} onPasswordChange={handlePasswordChange} />;
};

export default App;
