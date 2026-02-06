
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Button } from './Button';
import { 
    X, UserPlus, Zap, 
    Users as UsersIcon, CheckCircle2, TrendingUp, CheckSquare, Square, 
    Trash2, ArrowRight, ShieldCheck,
    Shield, UserCog, User, Search, RefreshCw, Lock, Ban, Key, ArrowUpDown, ChevronDown,
    List, RotateCcw, Calendar, Filter, Plus, FileText, Wallet, Coins, AlertOctagon, Fingerprint,
    Eye, EyeOff, Database, Terminal, Server, Activity, AlertCircle, Wifi, Cloud, StopCircle, UploadCloud,
    Globe, MousePointer2
} from 'lucide-react';
import { apiService } from '../services/apiService';
import { testGeminiConnection } from '../services/geminiService';
import { GlassCard } from './GlassCard';
import { useNotification } from '../context/NotificationContext';
// FIREBASE IMPORTS
import { db } from '../services/firebaseConfig';
import { ref, onValue } from 'firebase/database';

// --- GLOBAL LOGGING SYSTEM ---
interface ConsoleLog {
    timestamp: string;
    type: 'info' | 'error' | 'success' | 'warn';
    message: string;
    source: string;
}

// Persist logs outside component lifecycle
export const SYSTEM_LOGS: ConsoleLog[] = [];
const MAX_LOGS = 200;

const pushLog = (type: 'info' | 'error' | 'success' | 'warn', message: string, source: string) => {
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    SYSTEM_LOGS.push({ timestamp: timeString, type, message, source });
    if (SYSTEM_LOGS.length > MAX_LOGS) SYSTEM_LOGS.shift();
};

// Hook into browser errors globally once
if (typeof window !== 'undefined' && !(window as any).hasAstraLogger) {
    (window as any).hasAstraLogger = true;
    
    // Capture console.error
    const originalError = console.error;
    console.error = (...args) => {
        try {
            const msg = args.map(a => (typeof a === 'object' ? JSON.stringify(a) : String(a))).join(' ');
            pushLog('error', msg, 'System');
        } catch (e) {
            pushLog('error', 'Error logging failed', 'System');
        }
        originalError.apply(console, args);
    };

    // Capture unhandled exceptions
    window.addEventListener('error', (event) => {
        pushLog('error', event.message || 'Unknown Error', 'Runtime');
    });

    // Capture unhandled promise rejections (network errors, async fails)
    window.addEventListener('unhandledrejection', (event) => {
        let msg = event.reason ? (event.reason.message || String(event.reason)) : 'Unknown Promise Error';
        pushLog('error', msg, 'Async');
    });
}
// -----------------------------

interface AdminDashboardProps {
  onClose: () => void;
}

type TabType = 'injection' | 'members' | 'transactions' | 'register' | 'console';
type SortOption = 'id_asc' | 'id_desc' | 'alpha_asc' | 'credits_desc' | 'credits_asc';
type TopUpType = 'Top-up' | 'Reward' | 'Others';
type WebAccessType = 'EK' | 'KAT' | 'ALL';

interface Transaction {
    date: string;
    username: string;
    content: string; 
    type?: string;
}

interface ServiceHealth {
    status: 'online' | 'offline' | 'latency' | 'unknown';
    latency: number;
    message?: string;
}

const TEAMS = ['KAT - Architectural', 'KAT - Design', 'KAT - Content', 'KAT - Marketing', 'EK'];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ onClose }) => {
  const { showNotification } = useNotification();
  const [activeTab, setActiveTab] = useState<TabType>('injection');
  const [users, setUsers] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [sortOption, setSortOption] = useState<SortOption>('id_asc');
  const [filterTeam, setFilterTeam] = useState<string>('ALL');
  const [isSortDropdownOpen, setIsSortDropdownOpen] = useState(false);
  const [isFilterTeamDropdownOpen, setIsFilterTeamDropdownOpen] = useState(false);

  const [transType, setTransType] = useState<'add' | 'deduct'>('add');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [amount, setAmount] = useState<number>(100);
  
  const [topUpType, setTopUpType] = useState<TopUpType>('Top-up');
  const [customReason, setCustomReason] = useState('');
  const [deductNote, setDeductNote] = useState<string>('');
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isTxLoading, setIsTxLoading] = useState(false);
  const [txUserFilter, setTxUserFilter] = useState<string>('ALL');
  const [isTxUserDropdownOpen, setIsTxUserDropdownOpen] = useState(false);
  
  const [txTypeFilter, setTxTypeFilter] = useState<'ALL' | 'TOPUP' | 'USAGE'>('ALL');
  
  const [isDateFilterOpen, setIsDateFilterOpen] = useState(false);
  const [txDateRange, setTxDateRange] = useState<'ALL' | '7' | '14' | '31'>('ALL');

  const [isBulkRegister, setIsBulkRegister] = useState(false);
  // NEW: Added web_access to state
  const [newUser, setNewUser] = useState<{ username: string; password: string; credits: number | string; role: string; team: string; web_access: WebAccessType }>({ 
      username: '', password: '', credits: '', role: '', team: '', web_access: 'ALL'
  });
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  // NEW: Added web_access to bulk state
  const [bulkUsers, setBulkUsers] = useState<{ username: string; password: string; credits: number | string; role: string; team: string; web_access: WebAccessType }[]>([
      { username: '', password: '', credits: '', role: '', team: '', web_access: 'ALL' }
  ]);

  const [processingUser, setProcessingUser] = useState<string | null>(null);
  const teamDropdownRef = useRef<HTMLDivElement>(null);

  // --- ONLINE USERS STATE (FIREBASE) ---
  const [onlineUsers, setOnlineUsers] = useState<Set<string>>(new Set());

  // --- CONSOLE STATE ---
  const [consoleLogs, setConsoleLogs] = useState<ConsoleLog[]>([]);
  const [geminiHealth, setGeminiHealth] = useState<ServiceHealth>({ status: 'unknown', latency: 0 });
  const [supabaseHealth, setSupabaseHealth] = useState<ServiceHealth>({ status: 'unknown', latency: 0 });
  const [sheetsHealth, setSheetsHealth] = useState<ServiceHealth>({ status: 'unknown', latency: 0 });
  const [webHealth, setWebHealth] = useState<'Stable' | 'Smooth' | 'Laggy' | 'Error' | 'Checking'>('Checking');
  const [isDiagnosticsRunning, setIsDiagnosticsRunning] = useState(false);
  
  // --- SYNC SHEET STATE ---
  const [isSyncingSheet, setIsSyncingSheet] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ current: 0, total: 0 });
  const abortSyncRef = useRef(false);

  const abortDiagnosticsRef = useRef(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // --- SECURITY MODAL STATE ---
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [superAdminPass, setSuperAdminPass] = useState('');
  const [showSecurityPass, setShowSecurityPass] = useState(false);
  const [securityMessage, setSecurityMessage] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [securityAction, setSecurityAction] = useState<((password: string) => Promise<void>) | null>(null);

  // --- WEB ACCESS MODAL STATE ---
  const [webAccessModalUser, setWebAccessModalUser] = useState<{username: string, current: string} | null>(null);
  const [tempWebAccess, setTempWebAccess] = useState<WebAccessType>('ALL');

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
      if (activeTab === 'transactions') {
          fetchTransactions();
      }
  }, [activeTab]);

  // --- FIREBASE ONLINE LISTENER ---
  useEffect(() => {
      const onlineUsersRef = ref(db, 'online_users');
      const unsubscribe = onValue(onlineUsersRef, (snapshot) => {
          if (snapshot.exists()) {
              const data = snapshot.val();
              const onlineSet = new Set<string>();
              Object.values(data).forEach((u: any) => {
                  if (u.username) onlineSet.add(u.username);
              });
              setOnlineUsers(onlineSet);
          } else {
              setOnlineUsers(new Set());
          }
      });

      return () => unsubscribe();
  }, []);

  useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
          if (teamDropdownRef.current && !teamDropdownRef.current.contains(event.target as Node)) {
              setIsTeamDropdownOpen(false);
          }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // --- CONSOLE LOGGING SYNC ---
  useEffect(() => {
      if (activeTab === 'console') {
          // Sync with global logs immediately
          setConsoleLogs([...SYSTEM_LOGS]);
          
          // Poll for new logs every 500ms to keep UI updated without heavy React rendering on every console.log
          const interval = setInterval(() => {
              if (SYSTEM_LOGS.length !== consoleLogs.length) {
                  setConsoleLogs([...SYSTEM_LOGS]);
              }
          }, 500);

          return () => clearInterval(interval);
      }
  }, [activeTab, consoleLogs.length]);

  useEffect(() => {
      if (activeTab === 'console' && logContainerRef.current) {
          logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
      }
  }, [consoleLogs, activeTab]);

  const addLog = (type: 'info' | 'error' | 'success' | 'warn', message: string, source: string) => {
      pushLog(type, message, source);
      setConsoleLogs([...SYSTEM_LOGS]);
  };

  const handleStopDiagnostics = () => {
      abortDiagnosticsRef.current = true;
      addLog('warn', 'Diagnostics manually stopped by user.', 'System');
      setIsDiagnosticsRunning(false);
  };

  const runDiagnostics = async () => {
      if (isDiagnosticsRunning) return;
      setIsDiagnosticsRunning(true);
      abortDiagnosticsRef.current = false;
      
      // Clear local state only visually if desired, or keep history. Let's keep history.
      // setConsoleLogs([]); 
      addLog('info', 'Starting System Diagnostics...', 'System');
      
      let totalLatency = 0;
      let checksPassed = 0;

      // 1. Check Gemini
      if (abortDiagnosticsRef.current) return;
      addLog('info', 'Pinging Gemini AI API...', 'Gemini');
      const geminiRes = await testGeminiConnection();
      
      if (abortDiagnosticsRef.current) return;
      
      if (geminiRes.status === 'ok') {
          setGeminiHealth({ status: 'online', latency: geminiRes.latency });
          addLog('success', `Gemini Online. Latency: ${geminiRes.latency}ms`, 'Gemini');
          totalLatency += geminiRes.latency;
          checksPassed++;
      } else {
          setGeminiHealth({ status: 'offline', latency: 0, message: geminiRes.message });
          addLog('error', `Gemini Connection Failed: ${geminiRes.message}`, 'Gemini');
      }

      // 2. Check Supabase
      if (abortDiagnosticsRef.current) return;
      addLog('info', 'Querying Database (Supabase)...', 'Database');
      const dbRes = await apiService.checkSupabaseHealth();
      
      if (abortDiagnosticsRef.current) return;

      if (dbRes.status === 'ok') {
          setSupabaseHealth({ status: 'online', latency: dbRes.latency });
          addLog('success', `Database Connected. Query Time: ${dbRes.latency}ms`, 'Database');
          totalLatency += dbRes.latency;
          checksPassed++;
      } else {
          setSupabaseHealth({ status: 'offline', latency: 0, message: dbRes.message });
          addLog('error', `Database Error: ${dbRes.message}`, 'Database');
      }

      // 3. Check Google Sheet Proxy
      if (abortDiagnosticsRef.current) return;
      addLog('info', 'Checking Google Apps Script Proxy...', 'Proxy');
      const startSheet = Date.now();
      try {
          const sheetRes = await apiService.testConnection();
          const sheetLat = Date.now() - startSheet;
          
          if (abortDiagnosticsRef.current) return;

          if (sheetRes && sheetRes.success) {
              setSheetsHealth({ status: 'online', latency: sheetLat });
              addLog('success', `Proxy Active. Latency: ${sheetLat}ms`, 'Proxy');
              totalLatency += sheetLat;
              checksPassed++;
          } else {
              throw new Error(sheetRes.error || "Unknown Response");
          }
      } catch (e: any) {
          setSheetsHealth({ status: 'offline', latency: 0, message: e.message });
          addLog('error', `Proxy Unreachable: ${e.message}`, 'Proxy');
      }

      // 4. Calculate Web Health
      if (abortDiagnosticsRef.current) return;
      
      if (checksPassed === 3) {
          const avg = totalLatency / 3;
          if (avg < 500) setWebHealth('Smooth');
          else if (avg < 1500) setWebHealth('Stable');
          else setWebHealth('Laggy');
          addLog('info', `Diagnostics Complete. System Status: ${avg < 500 ? 'Smooth' : 'Stable'}`, 'System');
      } else {
          setWebHealth('Error');
          addLog('error', 'Diagnostics Complete. Issues Detected.', 'System');
      }

      setIsDiagnosticsRunning(false);
  };

  // --- SHEET SYNC ---
  const handleSyncSheet = async () => {
      if (isSyncingSheet) return;
      if (processedUsers.length === 0) {
          showNotification("No users to sync", "info");
          return;
      }

      setIsSyncingSheet(true);
      abortSyncRef.current = false;
      setSyncProgress({ current: 0, total: processedUsers.length });
      
      addLog('info', `Starting manual Sheet Sync for ${processedUsers.length} users...`, 'SheetSync');

      let successCount = 0;
      let failCount = 0;

      for (let i = 0; i < processedUsers.length; i++) {
          if (abortSyncRef.current) {
              addLog('warn', `Sheet Sync Stopped by User at ${i}/${processedUsers.length}`, 'SheetSync');
              showNotification("Sync Stopped", "warning");
              break;
          }

          const user = processedUsers[i];
          setSyncProgress({ current: i + 1, total: processedUsers.length });

          try {
              // Sync credits, role, team, status. No password required for updates usually.
              await apiService.syncUserToGoogleSheet({
                  username: user.username,
                  credits: user.credits,
                  role: user.role,
                  team: user.team,
                  status: user.status,
                  web_access: user.web_access // Sync Access
              });
              successCount++;
          } catch (e: any) {
              failCount++;
              addLog('error', `Failed to sync ${user.username}: ${e.message}`, 'SheetSync');
          }
          
          // Small delay to prevent rate limiting Google Apps Script
          await new Promise(r => setTimeout(r, 200));
      }

      addLog('info', `Sheet Sync Finished. Success: ${successCount}, Failed: ${failCount}`, 'SheetSync');
      if (!abortSyncRef.current) {
          showNotification(`Synced ${successCount} users to Sheet`, "success");
      }
      setIsSyncingSheet(false);
  };

  const handleStopSync = () => {
      abortSyncRef.current = true;
  };

  // --- SECURE ACTION HANDLER ---
  const executeSecureAction = (message: string, action: (password: string) => Promise<void>) => {
      setSecurityMessage(message);
      setSecurityAction(() => action);
      setSuperAdminPass('');
      setShowSecurityPass(false);
      setModalError(null);
      setIsSecurityModalOpen(true);
  };

  const handleSecuritySubmit = async (e: React.FormEvent) => {
      e.preventDefault();
      setModalError(null);
      if (!superAdminPass) {
          setModalError("Password required.");
          return;
      }
      
      if (securityAction) {
          setIsProcessing(true);
          try {
              await securityAction(superAdminPass);
              setIsSecurityModalOpen(false);
          } catch (err: any) {
              // Handle Error Inline inside Modal
              setModalError(err.message || "Incorrect Password or Action Failed");
          } finally {
              setIsProcessing(false);
          }
      }
  };

  const fetchUsers = async () => {
    setIsLoading(true);
    try {
      const list = await apiService.adminGetUsers();
      setUsers(list);
    } catch (e: any) {
      console.error(e);
      addLog('error', `Fetch Users Failed: ${e.message}`, 'API');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchTransactions = async () => {
      setIsTxLoading(true);
      try {
          const txList = await apiService.adminGetTransactions();
          setTransactions(txList);
      } catch (e: any) {
          console.error(e);
          addLog('error', `Fetch Transactions Failed: ${e.message}`, 'API');
      } finally {
          setIsTxLoading(false);
      }
  };

  const handleToggleUser = (username: string) => {
      setSelectedUsers(prev => {
          if (prev.includes(username)) return prev.filter(u => u !== username);
          return [...prev, username];
      });
  };

  const handleSelectAll = () => {
      if (selectedUsers.length === processedUsers.length) {
          setSelectedUsers([]);
      } else {
          setSelectedUsers(processedUsers.map(u => u.username));
      }
  };

  const handleSetMaxRevoke = () => {
      if (selectedUsers.length === 0) {
          showNotification("Select users first", "info");
          return;
      }
      const targetUsers = users.filter(u => selectedUsers.includes(u.username));
      if (targetUsers.length === 0) return;
      const maxCredits = Math.max(...targetUsers.map(u => u.credits));
      setAmount(maxCredits > 0 ? maxCredits : 0);
  };

  const handleTransaction = () => {
    if (selectedUsers.length === 0) return;
    if (amount <= 0 && transType === 'add') { 
        showNotification("Amount must be greater than 0", "warning");
        return;
    }
    
    if (selectedUsers.length === 1 && transType === 'add') {
        const targetUser = users.find(u => u.username === selectedUsers[0]);
        if (targetUser && (targetUser.status === 'banned' || targetUser.status === 'deleted user')) {
            showNotification("This user cannot be topped up because they are banned.", "warning");
            return;
        }
    }
    
    let note = '';
    if (transType === 'deduct') {
        if (!deductNote.trim()) {
            showNotification("Please provide a reason for deduction.", "warning");
            return;
        }
        note = deductNote;
    } else {
        if (topUpType === 'Others') {
            if (!customReason.trim()) {
                showNotification("Please specify the reason.", "warning");
                return;
            }
            note = customReason;
        } else {
            note = topUpType;
        }
    }

    const finalAmount = transType === 'add' ? amount : -amount;
    const actionName = transType === 'add' ? 'TOP-UP' : 'REVOCATION';
    const count = selectedUsers.length;
    
    const confirmMsg = `ACTION: ${actionName}\nTarget: ${count} Users\nAmount: ${finalAmount} Credits (Each)\nReason: ${note}`;

    executeSecureAction(confirmMsg, async (password) => {
        const result = await apiService.adminTopUp(selectedUsers, finalAmount, note, password);
        
        setUsers(prev => prev.map(u => {
            if (selectedUsers.includes(u.username) && u.status !== 'banned' && u.status !== 'deleted user') {
                return { ...u, credits: Math.max(0, u.credits + finalAmount) };
            }
            return u;
        }));
        
        if (result.failedCount > 0) {
            if (result.successCount === 0) {
                 showNotification(`Failed: All ${result.failedCount} selected users are banned/deleted.`, "warning");
            } else {
                 showNotification(`Partial Success: ${result.successCount} processed, ${result.failedCount} failed.`, "warning");
            }
        } else {
            showNotification(`Bulk ${actionName} Successful!`, "success");
        }

        setSelectedUsers([]); 
        if (transType === 'deduct') setDeductNote('');
        else { setCustomReason(''); setTopUpType('Top-up'); }
    });
  };

  const handleResetTransactions = () => {
      executeSecureAction("DELETE ALL transaction history? This action is irreversible.", async (password) => {
          setIsTxLoading(true);
          try {
              await apiService.adminResetTransactions(password);
              setTransactions([]);
              showNotification("All transactions have been cleared.", "success");
          } catch (e: any) {
              throw e; // Let the modal handle the error
          } finally {
              setIsTxLoading(false);
          }
      });
  };

  const isValidUsername = (u: string) => /^[a-z0-9_]+$/.test(u);

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (isBulkRegister) {
        const validUsers = bulkUsers.filter(u => u.username.trim() !== '');
        if (validUsers.length === 0) {
            showNotification("Please enter at least one user.", "warning");
            return;
        }
        for (const u of validUsers) {
            if (!isValidUsername(u.username.toLowerCase())) {
                showNotification(`Invalid username: '${u.username}'`, "warning");
                return;
            }
        }

        executeSecureAction(`Register ${validUsers.length} new users?`, async (password) => {
             const result = await (apiService as any).adminCreateUserBulk(validUsers, password);
             if (result.success) {
                showNotification(`Registered ${result.createdCount} users!`, "success");
                // Reset bulk form
                setBulkUsers([{ username: '', password: '', credits: '', role: '', team: '', web_access: 'ALL' }]); 
                fetchUsers();
            } else { 
                throw new Error(result.error);
            }
        });

    } else {
        const finalUsername = newUser.username.toLowerCase().trim();
        if (!finalUsername) {
            showNotification("Username required", "warning");
            return;
        }
        if (!isValidUsername(finalUsername)) {
            showNotification("Invalid username. Letters, numbers, underscores only.", "warning");
            return;
        }

        const payload = {
            username: finalUsername,
            password: newUser.password.trim() || "Astra123@",
            credits: newUser.credits === '' ? 0 : Number(newUser.credits), 
            role: newUser.role || 'user',
            team: newUser.team || 'EK',
            web_access: newUser.web_access || 'ALL'
        };

        executeSecureAction(`Initialize User: ${finalUsername}?`, async (password) => {
            await apiService.adminCreateUser(payload, password);
            showNotification(`User [${payload.username}] initialized!`, "success");
            setNewUser({ username: '', password: '', credits: '', role: '', team: '', web_access: 'ALL' }); 
            fetchUsers();
        });
    }
  };

  const updateBulkUser = (index: number, field: string, value: any) => {
      setBulkUsers(prev => { const newArr = [...prev]; newArr[index] = { ...newArr[index], [field]: value }; return newArr; });
  };
  const addBulkRow = () => { if (bulkUsers.length >= 10) return; setBulkUsers(prev => [...prev, { username: '', password: '', credits: '', role: '', team: '', web_access: 'ALL' }]); };
  const removeBulkRow = (index: number) => { setBulkUsers(prev => prev.filter((_, i) => i !== index)); };

  const handleRoleChange = (username: string, currentRole: string) => {
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      executeSecureAction(`Promote/Demote [${username}] to ${newRole}?`, async (password) => {
          setProcessingUser(username);
          try {
            await (apiService as any).adminUpdateRole(username, newRole, password);
            setUsers(prev => prev.map(u => u.username === username ? { ...u, role: newRole } : u));
            showNotification(`Role updated for ${username}`, "success");
          } finally { setProcessingUser(null); }
      });
  };

  const handleToggleBan = (username: string, currentStatus: string) => {
      const newStatus = currentStatus === 'banned' ? 'active' : 'banned';
      executeSecureAction(`${newStatus === 'banned' ? 'BAN' : 'UNBAN'} user [${username}]?`, async (password) => {
          setProcessingUser(username);
          try {
            await (apiService as any).adminToggleStatus(username, newStatus, password);
            setUsers(prev => prev.map(u => u.username === username ? { ...u, status: newStatus } : u));
            showNotification(`Status updated for ${username}`, "success");
          } finally { setProcessingUser(null); }
      });
  };

  // NEW: Open Web Access Modal
  const openWebAccessModal = (username: string, current: string) => {
      setWebAccessModalUser({ username, current });
      setTempWebAccess((current as WebAccessType) || 'ALL');
  };

  const confirmWebAccessChange = () => {
      if (!webAccessModalUser) return;
      const { username } = webAccessModalUser;
      const newAccess = tempWebAccess;
      
      setWebAccessModalUser(null); // Close modal first

      executeSecureAction(`Change access for [${username}] to ${newAccess}?`, async (password) => {
          setProcessingUser(username);
          try {
             await (apiService as any).adminUpdateWebAccess(username, newAccess, password);
             setUsers(prev => prev.map(u => u.username === username ? { ...u, web_access: newAccess } : u));
             showNotification(`Web Access updated to ${newAccess}`, "success");
          } finally { setProcessingUser(null); }
      });
  };

  const handleResetPassword = (username: string) => {
      executeSecureAction(`Reset password for [${username}] to 'Astra123@'?`, async (password) => {
          setProcessingUser(username);
          try {
             await (apiService as any).adminResetPassword(username, password);
             showNotification(`Password reset for ${username}`, "success");
          } finally { setProcessingUser(null); }
      });
  };

  const handleDeleteUser = (username: string) => {
      executeSecureAction(`PERMANENTLY DELETE user [${username}]? This cannot be undone.`, async (password) => {
          setProcessingUser(username);
          try {
             await (apiService as any).adminDeleteUser(username, password);
             setUsers(prev => prev.map(u => u.username === username ? { ...u, status: 'deleted user', credits: 0 } : u));
             showNotification(`User [${username}] deleted.`, "success");
          } finally { setProcessingUser(null); }
      });
  };

  const processedUsers = useMemo(() => {
      let result = users.filter(u => u.status !== 'deleted user' && u.username?.toLowerCase().includes(searchTerm.toLowerCase()));
      if (filterTeam !== 'ALL') result = result.filter(u => u.team === filterTeam);
      return result.sort((a, b) => {
          switch (sortOption) {
              case 'id_asc': return a.id - b.id;
              case 'id_desc': return b.id - a.id;
              case 'alpha_asc': return a.username.localeCompare(b.username);
              case 'credits_desc': return b.credits - a.credits;
              case 'credits_asc': return a.credits - b.credits;
              default: return 0;
          }
      });
  }, [users, searchTerm, sortOption, filterTeam]);

  const processedTransactions = useMemo(() => {
      let filtered = [...transactions];
      filtered = filtered.filter(t => !t.username.includes('(deleted user)'));
      if (txUserFilter !== 'ALL') filtered = filtered.filter(t => t.username === txUserFilter);
      
      if (txTypeFilter === 'TOPUP') {
          filtered = filtered.filter(t => t.type === 'topup' || t.type === 'bonus' || t.content.includes('+'));
      } else if (txTypeFilter === 'USAGE') {
          filtered = filtered.filter(t => t.type === 'usage' || t.type === 'adjustment' || t.content.includes('-'));
      }

      if (txDateRange !== 'ALL') {
          const days = parseInt(txDateRange);
          const cutoff = new Date();
          cutoff.setDate(cutoff.getDate() - days);
          filtered = filtered.filter(t => {
               const parts = t.date.split(' ')[0].split('/');
               if(parts.length === 3) {
                   const tDate = new Date(parseInt(parts[2]), parseInt(parts[1])-1, parseInt(parts[0]));
                   return tDate >= cutoff;
               }
               return true;
          });
      }
      return filtered;
  }, [transactions, txUserFilter, txDateRange, txTypeFilter]);

  const parseTransactionContent = (content: string) => {
      const match = content.match(/^([+\-]?\d+)\s*(?:credits?|credit)\s*\|?\s*(.*)$/i);
      if (match) {
          return { amount: parseInt(match[1]), reason: match[2] || '-' };
      }
      return { amount: 0, reason: content };
  };

  const isAllSelected = processedUsers.length > 0 && selectedUsers.length === processedUsers.length;
  const quickAmounts = [100, 200, 500, 1000];
  const getSortLabel = (opt: SortOption) => {
      switch(opt) {
          case 'id_asc': return 'ID Increasing';
          case 'id_desc': return 'Newest Users';
          case 'alpha_asc': return 'A-Z';
          case 'credits_desc': return 'Most Credits';
          case 'credits_asc': return 'Least Credits';
      }
  };

  const getHealthColor = (status: string) => {
      if (status === 'online' || status === 'Smooth') return 'text-[#e2b36e] bg-[#e2b36e]/10 border-[#e2b36e]/30';
      if (status === 'latency' || status === 'Stable') return 'text-white bg-white/10 border-white/30';
      if (status === 'offline' || status === 'Error' || status === 'Laggy') return 'text-red-400 bg-red-500/10 border-red-500/30';
      return 'text-white/40 bg-white/5 border-white/10';
  };

  return (
    <>
    {/* WEB ACCESS SELECTION MODAL */}
    {webAccessModalUser && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-in fade-in duration-200">
             <div className="w-full max-w-md bg-[#09232b] border border-[#e2b36e]/20 rounded-3xl shadow-[0_0_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col relative">
                 
                 {/* Header */}
                 <div className="p-6 pb-2 flex justify-between items-start">
                     <div>
                         <h2 className="text-xl font-black text-[#e2b36e] uppercase tracking-tight">Select Web Access</h2>
                         <p className="text-xs text-[#e2b36e]/50 font-medium mt-1">
                            Determine which portal <span className="text-[#e2b36e] font-bold">{webAccessModalUser.username}</span> can access.
                         </p>
                     </div>
                     <button onClick={() => setWebAccessModalUser(null)} className="p-2 bg-white/5 hover:bg-white/10 rounded-full text-[#e2b36e]/50 hover:text-[#e2b36e] transition-colors">
                         <X size={18} />
                     </button>
                 </div>

                 {/* Options */}
                 <div className="p-6 pt-4 space-y-3">
                     {/* EK Option */}
                     <button 
                        onClick={() => setTempWebAccess('EK')}
                        className={`w-full p-4 rounded-2xl border flex items-center gap-4 transition-all duration-200 group relative overflow-hidden ${tempWebAccess === 'EK' ? 'bg-[#103742] border-[#1e40af] shadow-[0_0_20px_rgba(30,64,175,0.3)]' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'}`}
                     >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border text-lg transition-colors ${tempWebAccess === 'EK' ? 'bg-[#1e40af] border-[#1e40af] text-white' : 'bg-[#09232b] border-white/10 text-[#e2b36e]/40 group-hover:text-[#1e40af]'}`}>
                            <Globe size={20} />
                        </div>
                        <div className="text-left flex-1">
                            {/* Text always gold */}
                            <div className="font-bold text-sm text-[#e2b36e]">EK Portal</div>
                            <div className="text-[10px] text-[#e2b36e]/40 font-mono mt-0.5">https://ekastra.vercel.app/</div>
                        </div>
                        {tempWebAccess === 'EK' && <div className="text-[#1e40af]"><CheckCircle2 size={20} /></div>}
                     </button>

                     {/* KAT Option */}
                     <button 
                        onClick={() => setTempWebAccess('KAT')}
                        className={`w-full p-4 rounded-2xl border flex items-center gap-4 transition-all duration-200 group relative overflow-hidden ${tempWebAccess === 'KAT' ? 'bg-[#103742] border-[#e2b36e] shadow-[0_0_20px_rgba(226,179,110,0.3)]' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'}`}
                     >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border text-lg transition-colors ${tempWebAccess === 'KAT' ? 'bg-[#e2b36e] border-[#e2b36e] text-[#09232b]' : 'bg-[#09232b] border-white/10 text-[#e2b36e]/40 group-hover:text-[#e2b36e]'}`}>
                            <Globe size={20} />
                        </div>
                        <div className="text-left flex-1">
                            {/* Text always gold */}
                            <div className="font-bold text-sm text-[#e2b36e]">KAT Portal</div>
                            <div className="text-[10px] text-[#e2b36e]/40 font-mono mt-0.5">https://astra-kat.vercel.app/</div>
                        </div>
                        {tempWebAccess === 'KAT' && <div className="text-[#e2b36e]"><CheckCircle2 size={20} /></div>}
                     </button>

                     {/* ALL Option */}
                     <button 
                        onClick={() => setTempWebAccess('ALL')}
                        className={`w-full p-4 rounded-2xl border flex items-center gap-4 transition-all duration-200 group relative overflow-hidden ${tempWebAccess === 'ALL' ? 'bg-gradient-to-r from-[#215a6c]/40 to-[#215a6c]/20 border-[#215a6c] shadow-[0_0_20px_rgba(33,90,108,0.3)]' : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05]'}`}
                     >
                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center border text-lg transition-colors ${tempWebAccess === 'ALL' ? 'bg-[#215a6c] border-[#215a6c] text-white' : 'bg-[#09232b] border-white/10 text-[#e2b36e]/40 group-hover:text-[#215a6c]'}`}>
                            <ShieldCheck size={20} />
                        </div>
                        <div className="text-left flex-1">
                            {/* Text always gold */}
                            <div className="font-bold text-sm text-[#e2b36e]">All Access</div>
                            <div className="text-[10px] text-[#e2b36e]/40 font-mono mt-0.5 uppercase tracking-wider">Full Privileges</div>
                        </div>
                        {tempWebAccess === 'ALL' && <div className="text-[#215a6c]"><CheckCircle2 size={20} /></div>}
                     </button>
                 </div>

                 {/* Footer - Confirm Action */}
                 <div className="p-6 pt-0">
                     <Button onClick={confirmWebAccessChange} className="w-full py-4 text-sm font-bold tracking-widest shadow-xl">
                        CONFIRM CHANGE
                     </Button>
                 </div>
             </div>
        </div>
    )}

    {isSecurityModalOpen && (
        <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-black/40 backdrop-blur-md animate-in fade-in duration-200">
             <GlassCard className="w-full max-w-sm p-0 relative border border-[#e2b36e]/30 shadow-[0_0_50px_rgba(226,179,110,0.15)] overflow-hidden">
                 <div className="h-1 w-full bg-gradient-to-r from-[#e2b36e] to-[#b28e67]"></div>
                 <div className="p-6">
                     <div className="flex items-center gap-3 mb-4 text-[#e2b36e]">
                         <div className="p-2 bg-[#e2b36e]/10 rounded-lg border border-[#e2b36e]/20">
                            <Fingerprint size={28} />
                         </div>
                         <h2 className="text-lg font-black uppercase tracking-tight text-[#e2b36e]">Security Clearance</h2>
                     </div>
                     <p className="text-xs text-[#e2b36e]/60 mb-5 whitespace-pre-wrap font-mono bg-[#09232b] p-3 rounded-lg border border-white/5 shadow-inner">
                         {securityMessage}
                     </p>
                     
                     <form onSubmit={handleSecuritySubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-[#e2b36e]/40 uppercase tracking-widest flex items-center justify-between">
                                <span>Super Admin Password</span>
                                <Lock size={10} />
                            </label>
                            <div className="relative">
                                <input 
                                    type={showSecurityPass ? "text" : "password"} 
                                    autoFocus
                                    value={superAdminPass} 
                                    onChange={(e) => { setSuperAdminPass(e.target.value); setModalError(null); }}
                                    className={`w-full bg-black/40 border rounded-xl px-4 py-3 pr-10 text-sm text-[#e2b36e] focus:outline-none transition-all ${modalError ? 'border-red-500/50 bg-red-500/5' : 'border-[#e2b36e]/30 focus:border-[#e2b36e]/50'}`}
                                    placeholder="Enter Access Code"
                                />
                                <button 
                                    type="button"
                                    onClick={() => setShowSecurityPass(!showSecurityPass)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#e2b36e]/30 hover:text-[#e2b36e] transition-colors"
                                    tabIndex={-1}
                                >
                                    {showSecurityPass ? <EyeOff size={14} /> : <Eye size={14} />}
                                </button>
                            </div>
                            {modalError && (
                                <div className="text-[10px] text-red-400 font-bold tracking-wide animate-in slide-in-from-top-1 pt-1">
                                    {modalError}
                                </div>
                            )}
                        </div>
                        <div className="flex gap-3 pt-2">
                            <Button type="button" onClick={() => setIsSecurityModalOpen(false)} className="flex-1 bg-white/5 hover:bg-white/10 border-white/10 text-white/60">Cancel</Button>
                            <Button type="submit" isLoading={isProcessing} className="flex-1 bg-gradient-to-r from-[#e2b36e] to-[#b28e67] border-0 shadow-lg hover:shadow-[#e2b36e]/20 text-[#09232b] font-bold tracking-wide">Authenticate</Button>
                        </div>
                     </form>
                 </div>
             </GlassCard>
        </div>
    )}

    {/* ... [Main Container code same as before] ... */}
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 overflow-hidden font-sans">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-md animate-in fade-in duration-500" onClick={onClose}></div>
      
      <div className="relative w-full max-w-7xl h-[90vh] flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-500 shadow-2xl rounded-3xl overflow-hidden border border-[#e2b36e]/20 ring-1 ring-[#e2b36e]/10 bg-[#103742]/60 backdrop-blur-2xl">
         
         {/* ... [Header code same as before] ... */}
         <div className="flex-none h-20 border-b border-[#e2b36e]/10 flex items-center justify-between px-8 relative z-20 bg-gradient-to-r from-white/5 to-transparent">
            {/* ... */}
            <div className="flex items-center gap-4">
                <div className="relative">
                    <div className="absolute inset-0 bg-[#e2b36e] blur-lg opacity-20 animate-pulse"></div>
                    <div className="relative p-2.5 bg-[#09232b] rounded-xl border border-[#e2b36e]/30 text-[#e2b36e] shadow-[0_0_15px_rgba(226,179,110,0.1)]">
                        <ShieldCheck size={24} />
                    </div>
                </div>
                <div>
                    <h2 className="text-xl font-black text-[#e2b36e] uppercase tracking-tight drop-shadow-md">Command Center</h2>
                    <div className="flex items-center gap-2">
                         <span className="w-1.5 h-1.5 rounded-full bg-[#e2b36e] animate-pulse shadow-[0_0_8px_rgba(226,179,110,0.8)]"></span>
                         <p className="text-[10px] text-[#e2b36e]/80 font-mono tracking-[0.2em] uppercase">System Administrator Level 5</p>
                    </div>
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                {activeTab === 'members' && (
                    <button 
                        onClick={isSyncingSheet ? handleStopSync : handleSyncSheet} 
                        disabled={processedUsers.length === 0} 
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${isSyncingSheet ? 'bg-red-500/20 text-red-400 border-red-500/30' : 'bg-[#e2b36e]/20 text-[#e2b36e] border-[#e2b36e]/30 hover:bg-[#e2b36e]/30 disabled:opacity-50 disabled:cursor-not-allowed'}`}
                    >
                        {isSyncingSheet ? <StopCircle size={14} className="animate-pulse" /> : <UploadCloud size={14} />}
                        {isSyncingSheet ? `Stop (${syncProgress.current}/${syncProgress.total})` : 'Update Sheet'}
                    </button>
                )}

                {/* ONLINE USER COUNTER IN HEADER */}
                <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-[#e2b36e]/10 border border-[#e2b36e]/20 rounded-full shadow-[0_0_10px_rgba(226,179,110,0.1)] mr-2">
                    <span className="relative flex h-2 w-2">
                       <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e2b36e] opacity-75"></span>
                       <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e2b36e]"></span>
                    </span>
                    <span className="text-[10px] font-bold text-[#e2b36e] uppercase tracking-wider">
                       {onlineUsers.size} Online Now
                    </span>
                </div>

                {activeTab !== 'console' && (
                    <button 
                        onClick={activeTab === 'transactions' ? fetchTransactions : fetchUsers}
                        disabled={isLoading || isTxLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold uppercase tracking-wider text-[#e2b36e] transition-all disabled:opacity-50"
                    >
                        <RefreshCw size={14} className={(isLoading || isTxLoading) ? "animate-spin" : ""} />
                        {(isLoading || isTxLoading) ? "Syncing..." : "Refresh"}
                    </button>
                )}
                {activeTab !== 'console' && <div className="h-6 w-[1px] bg-white/10 mx-1"></div>}
                <button onClick={onClose} className="p-3 hover:bg-white/10 rounded-full text-[#e2b36e]/50 hover:text-[#e2b36e] transition-all hover:rotate-90 duration-300">
                    <X size={24} />
                </button>
            </div>
         </div>

         {/* ... [Tabs and Content Area] ... */}
         <div className="flex-none h-14 border-b border-[#e2b36e]/10 flex items-center px-8 gap-8 bg-[#09232b]/40 overflow-x-auto">
            <button onClick={() => setActiveTab('injection')} className={`h-full border-b-2 flex items-center gap-2 px-2 transition-all text-sm font-bold tracking-wide uppercase whitespace-nowrap ${activeTab === 'injection' ? 'border-[#e2b36e] text-[#e2b36e]' : 'border-transparent text-[#e2b36e]/40 hover:text-[#e2b36e]'}`}><Zap size={16} className={activeTab === 'injection' ? 'fill-[#e2b36e]/20' : ''}/> Top-Up</button>
            <button onClick={() => setActiveTab('members')} className={`h-full border-b-2 flex items-center gap-2 px-2 transition-all text-sm font-bold tracking-wide uppercase whitespace-nowrap ${activeTab === 'members' ? 'border-[#e2b36e] text-[#e2b36e]' : 'border-transparent text-[#e2b36e]/40 hover:text-[#e2b36e]'}`}><UsersIcon size={16} className={activeTab === 'members' ? 'fill-[#e2b36e]/20' : ''}/> Members</button>
            <button onClick={() => setActiveTab('transactions')} className={`h-full border-b-2 flex items-center gap-2 px-2 transition-all text-sm font-bold tracking-wide uppercase whitespace-nowrap ${activeTab === 'transactions' ? 'border-[#e2b36e] text-[#e2b36e]' : 'border-transparent text-[#e2b36e]/40 hover:text-[#e2b36e]'}`}><List size={16} className={activeTab === 'transactions' ? 'fill-[#e2b36e]/20' : ''}/> Transactions</button>
            <button onClick={() => setActiveTab('register')} className={`h-full border-b-2 flex items-center gap-2 px-2 transition-all text-sm font-bold tracking-wide uppercase whitespace-nowrap ${activeTab === 'register' ? 'border-[#e2b36e] text-[#e2b36e]' : 'border-transparent text-[#e2b36e]/40 hover:text-[#e2b36e]'}`}><UserPlus size={16} className={activeTab === 'register' ? 'fill-[#e2b36e]/20' : ''}/> Register</button>
            <button onClick={() => setActiveTab('console')} className={`h-full border-b-2 flex items-center gap-2 px-2 transition-all text-sm font-bold tracking-wide uppercase whitespace-nowrap ${activeTab === 'console' ? 'border-[#e2b36e] text-[#e2b36e]' : 'border-transparent text-[#e2b36e]/40 hover:text-[#e2b36e]'}`}><Terminal size={16} className={activeTab === 'console' ? 'fill-[#e2b36e]/20' : ''}/> Console</button>
         </div>

         <div className="flex-1 relative min-w-0 bg-gradient-to-b from-transparent to-[#09232b]/50 overflow-hidden">
            
            {activeTab === 'injection' && (
                <div className="absolute inset-0 flex flex-row animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="w-56 border-r border-[#e2b36e]/10 bg-black/20 p-4 flex flex-col gap-3">
                        <div className="text-[10px] font-bold text-[#e2b36e]/30 uppercase tracking-widest mb-1">Mode</div>
                        <button onClick={() => { setTransType('add'); setDeductNote(''); setTopUpType('Top-up'); setCustomReason(''); }} className={`w-full text-left p-3 rounded-xl border flex items-center gap-3 transition-all ${transType === 'add' ? 'bg-[#e2b36e]/20 border-[#e2b36e] text-white shadow-[0_0_20px_rgba(226,179,110,0.1)]' : 'bg-white/5 border-white/5 text-[#e2b36e]/40 hover:bg-white/10'}`}><div className={`p-1.5 rounded-lg ${transType === 'add' ? 'bg-[#e2b36e] text-[#09232b]' : 'bg-white/10'}`}><TrendingUp size={16} /></div><div className="text-sm font-bold">Top-up</div></button>
                        <button onClick={() => setTransType('deduct')} className={`w-full text-left p-3 rounded-xl border flex items-center gap-3 transition-all ${transType === 'deduct' ? 'bg-red-600/20 border-red-500 text-white shadow-[0_0_20px_rgba(220,38,38,0.2)]' : 'bg-white/5 border-white/5 text-[#e2b36e]/40 hover:bg-white/10'}`}><div className={`p-1.5 rounded-lg ${transType === 'deduct' ? 'bg-red-500 text-white' : 'bg-white/10'}`}><Trash2 size={16} /></div><div className="text-sm font-bold">Revoke</div></button>
                    </div>

                    <div className="flex-1 flex flex-col h-full overflow-hidden relative">
                        {/* ... [Search header] ... */}
                        <div className="h-10 bg-white/5 border-b border-[#e2b36e]/10 grid grid-cols-12 gap-4 px-6 items-center text-[10px] text-[#e2b36e]/40 font-bold uppercase tracking-widest select-none shrink-0 relative z-20">
                             <div className="col-span-1 flex justify-center"><button onClick={handleSelectAll} className="hover:text-[#e2b36e] transition-colors">{isAllSelected ? <CheckSquare size={16} className="text-[#e2b36e]" /> : <Square size={16} />}</button></div>
                             <div className="col-span-1">ID</div>
                             <div className="col-span-3 flex items-center gap-2"><span>Username</span><div className="relative"><button onClick={() => setIsSortDropdownOpen(!isSortDropdownOpen)} className="p-1 hover:bg-white/10 rounded text-[#e2b36e]/60 hover:text-[#e2b36e] transition-colors"><ArrowUpDown size={12} /></button>{isSortDropdownOpen && (<div className="absolute top-full left-0 mt-1 w-48 bg-[#09232b] border border-[#e2b36e]/20 rounded-lg shadow-xl overflow-hidden z-[100]">{(['id_asc', 'id_desc', 'alpha_asc', 'credits_desc', 'credits_asc'] as SortOption[]).map(opt => (<button key={opt} onClick={() => { setSortOption(opt); setIsSortDropdownOpen(false); }} className={`w-full text-left px-3 py-2 text-[10px] uppercase font-bold hover:bg-white/10 transition-colors ${sortOption === opt ? 'text-[#e2b36e] bg-white/5' : 'text-[#e2b36e]/60'}`}>{getSortLabel(opt)}</button>))}</div>)}</div></div>
                             <div className="col-span-2 text-center flex items-center justify-center gap-1 relative"><span>Team</span><button onClick={() => setIsFilterTeamDropdownOpen(!isFilterTeamDropdownOpen)} className="p-1 hover:bg-white/10 rounded text-[#e2b36e]/60 hover:text-[#e2b36e] transition-colors"><Filter size={10} /></button>{isFilterTeamDropdownOpen && (<div className="absolute top-full right-0 mt-1 w-48 bg-[#09232b] border border-[#e2b36e]/20 rounded-lg shadow-xl overflow-hidden z-[100]"><button onClick={() => { setFilterTeam('ALL'); setIsFilterTeamDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-[10px] uppercase font-bold hover:bg-white/10 transition-colors text-[#e2b36e]">ALL TEAMS</button>{TEAMS.map(team => (<button key={team} onClick={() => { setFilterTeam(team); setIsFilterTeamDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-[10px] uppercase font-bold hover:bg-white/10 transition-colors text-[#e2b36e]/70">{team}</button>))}</div>)}</div>
                             <div className="col-span-1 text-center">Status</div>
                             <div className="col-span-2 text-right">Balance</div>
                             <div className="col-span-2 text-right">Projected</div>
                        </div>

                        <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-1 relative bg-gradient-to-b from-transparent via-[#09232b]/20 to-[#09232b]/40">
                            {isLoading && (<div className="flex items-center justify-center h-full gap-3 text-[#e2b36e]/30 animate-pulse"><RefreshCw className="animate-spin" size={20} /><span className="text-xs font-mono tracking-widest">SYNCING DATABASE...</span></div>)}
                            {!isLoading && processedUsers.map((u, i) => {
                                const isSelected = selectedUsers.includes(u.username);
                                const projectedBalance = transType === 'add' ? u.credits + amount : Math.max(0, u.credits - amount);
                                return (
                                <div key={u.username} onClick={() => handleToggleUser(u.username)} className={`grid grid-cols-12 gap-4 px-6 py-3 mx-2 rounded-xl items-center cursor-pointer transition-all duration-200 border group ${isSelected ? 'bg-[#e2b36e]/10 border-[#e2b36e]/30 shadow-lg' : 'bg-transparent border-transparent hover:bg-white/5 hover:border-white/5'}`}>
                                     <div className="col-span-1 flex justify-center text-[#e2b36e]/20 group-hover:text-[#e2b36e]/50 transition-colors">{isSelected ? <CheckSquare size={16} className="text-[#e2b36e]" /> : <Square size={16} />}</div>
                                     <div className="col-span-1 text-[#e2b36e]/30 font-mono text-xs">#{u.id}</div>
                                     <div className="col-span-3 flex items-center gap-3"><div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shadow-inner transition-colors ${isSelected ? 'bg-gradient-to-br from-[#e2b36e] to-[#b28e67] text-[#09232b]' : 'bg-white/10 text-[#e2b36e]/40'}`}>{u.username.substring(0, 1).toUpperCase()}</div><span className={`text-sm font-bold transition-colors ${isSelected ? 'text-[#e2b36e]' : 'text-[#e2b36e]/70'}`}>{u.username}</span></div>
                                     <div className="col-span-2 text-center"><span className={`text-[9px] font-medium transition-colors uppercase tracking-tight ${isSelected ? 'text-[#e2b36e]/80' : 'text-[#e2b36e]/30'}`}>{u.team || '-'}</span></div>
                                     <div className="col-span-1 flex justify-center"><div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${u.status === 'banned' ? 'bg-red-500/20 text-red-400' : 'bg-[#e2b36e]/20 text-[#e2b36e]'}`}>{u.status === 'active' ? 'ACTIVE' : u.status}</div></div>
                                     <div className="col-span-2 text-right font-mono text-sm text-[#e2b36e]/60 font-medium">{u.credits.toLocaleString()}</div>
                                     <div className="col-span-2 text-right font-mono text-sm flex items-center justify-end gap-3">{isSelected ? (<><ArrowRight size={14} className="text-[#e2b36e]/20" /><span className={`font-bold ${transType === 'add' ? "text-[#e2b36e]" : "text-red-400"}`}>{projectedBalance.toLocaleString()}</span></>) : (<span className="text-[#e2b36e]/10">-</span>)}</div>
                                </div>
                            )})}
                        </div>
                        
                        {/* ... [Amount/Action Bar same as before] ... */}
                        <div className="flex-none p-6 border-t border-[#e2b36e]/10 bg-[#09232b]/95 backdrop-blur-xl z-30 shadow-[0_-10px_40px_rgba(0,0,0,0.5)] min-h-[8rem] h-auto">
                             <div className="flex flex-wrap items-center gap-4 justify-center max-w-6xl mx-auto relative">
                                 <div className="flex items-center gap-3 bg-black/40 border border-white/10 rounded-xl px-5 py-3 shadow-inner h-14 shrink-0">
                                     <label className="text-[10px] text-[#e2b36e]/70 uppercase tracking-widest font-bold border-r border-white/10 pr-3 mr-1">Amount</label>
                                     <div className="relative">
                                        <input 
                                            type="number" 
                                            value={amount} 
                                            onChange={(e) => setAmount(Math.max(0, parseInt(e.target.value)))} 
                                            className="bg-transparent text-[#e2b36e] font-mono text-xl w-24 focus:outline-none text-right placeholder-[#e2b36e]/20 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" 
                                            placeholder="0" 
                                        />
                                        <span className="text-[10px] text-[#e2b36e]/30 font-bold tracking-wider ml-2">Credits</span>
                                    </div>
                                 </div>
                                 <div className="flex items-center gap-4 flex-wrap justify-center">
                                     {transType === 'add' ? (
                                         <>
                                            <div className="flex gap-1.5 bg-black/20 p-1.5 rounded-lg border border-white/5 h-14 items-center shrink-0">
                                                {quickAmounts.map(val => (<button key={val} onClick={() => setAmount(val)} className={`px-3 py-1.5 rounded-md text-xs font-mono font-bold transition-all ${amount === val ? 'bg-[#e2b36e] text-[#09232b] shadow-lg' : 'text-[#e2b36e]/40 hover:bg-white/10 hover:text-[#e2b36e]'}`}>{val}</button>))}
                                            </div>
                                            <div className="relative h-14 shrink-0">
                                                <button onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)} className="h-full px-4 rounded-xl border border-white/10 bg-black/40 flex items-center justify-between gap-3 text-white min-w-[140px] hover:bg-white/5 transition-colors"><div className="flex flex-col items-start"><span className="text-[9px] text-[#e2b36e]/40 uppercase tracking-widest font-bold">Type</span><span className="text-sm font-bold text-[#e2b36e]">{topUpType}</span></div><ChevronDown size={14} className="text-[#e2b36e]/40" /></button>
                                                {isTypeDropdownOpen && (<div className="absolute bottom-full left-0 mb-2 w-full bg-[#09232b] border border-[#e2b36e]/20 rounded-xl shadow-xl overflow-hidden z-50">{(['Top-up', 'Reward', 'Others'] as TopUpType[]).map(t => (<button key={t} onClick={() => { setTopUpType(t); setIsTypeDropdownOpen(false); }} className="w-full text-left px-4 py-3 text-xs font-bold hover:bg-white/10 text-[#e2b36e]/70">{t}</button>))}</div>)}
                                            </div>
                                            {topUpType === 'Others' && (<input type="text" value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="Enter reason..." className="h-14 bg-black/40 border border-white/20 rounded-xl px-4 text-[#e2b36e] text-sm focus:border-[#e2b36e] focus:bg-black/60 focus:outline-none transition-all placeholder-[#e2b36e]/20 w-48" />)}
                                         </>
                                     ) : (
                                        <>
                                            <div className="flex gap-1.5 bg-black/20 p-1.5 rounded-lg border border-white/5 h-14 items-center shrink-0">
                                                <button 
                                                    onClick={handleSetMaxRevoke} 
                                                    className="h-full px-4 rounded-md text-xs font-mono font-bold transition-all text-red-400 hover:bg-red-500/20 hover:text-red-300 border border-red-500/30 flex items-center gap-2"
                                                >
                                                    <Trash2 size={12} /> ALL
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-3 w-full sm:w-auto min-w-[300px]">
                                                <div className="h-14 px-4 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center justify-center shrink-0">
                                                    <label className="text-[10px] text-red-400 uppercase tracking-widest font-bold whitespace-nowrap">Reason</label>
                                                </div>
                                                <input type="text" value={deductNote} onChange={(e) => setDeductNote(e.target.value)} placeholder="Revocation reason..." className="h-14 w-full bg-black/40 border border-red-500/30 rounded-xl px-4 text-white text-sm focus:border-red-500 focus:bg-black/60 focus:outline-none transition-all placeholder-white/20" />
                                            </div>
                                        </>
                                     )}
                                 </div>
                                 <Button onClick={handleTransaction} disabled={selectedUsers.length === 0 || isProcessing} isLoading={isProcessing} className={`h-14 px-10 rounded-xl text-sm font-bold uppercase tracking-widest border-0 shadow-xl hover:scale-105 active:scale-95 transition-transform shrink-0 ${transType === 'add' ? 'bg-gradient-to-r from-[#e2b36e] to-[#b28e67] text-[#09232b]' : 'bg-gradient-to-r from-red-600 to-pink-600'}`}>Execute</Button>
                                 {selectedUsers.length > 0 && (<div className="absolute top-0 right-0 -mt-3 mr-0 bg-[#e2b36e] text-[#09232b] text-[10px] font-bold px-2 py-1 rounded-full shadow-lg z-50">Targeting {selectedUsers.length} User(s)</div>)}
                             </div>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'members' && (
                <div className="absolute inset-0 p-8 overflow-y-auto custom-scrollbar animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="max-w-6xl mx-auto space-y-6">
                        <div className="bg-[#09232b]/70 backdrop-blur-xl border border-[#e2b36e]/20 rounded-2xl p-4 flex items-center gap-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)] sticky top-0 z-40 transition-all">
                             <Search className="text-[#e2b36e]/40" />
                             <input type="text" placeholder="Search members by username..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="bg-transparent w-full text-[#e2b36e] placeholder-[#e2b36e]/30 focus:outline-none" />
                             <div className="relative shrink-0"><button onClick={() => setIsFilterTeamDropdownOpen(!isFilterTeamDropdownOpen)} className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs hover:bg-white/5 transition-colors text-[#e2b36e]/70"><Filter size={12} /> Team: <span className="text-[#e2b36e] font-bold">{filterTeam === 'ALL' ? 'All' : filterTeam}</span> <ChevronDown size={12} /></button>{isFilterTeamDropdownOpen && (<div className="absolute top-full right-0 mt-2 w-48 bg-[#09232b] border border-[#e2b36e]/20 rounded-lg shadow-xl overflow-hidden z-[100]"><button onClick={() => { setFilterTeam('ALL'); setIsFilterTeamDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-white/10 text-[#e2b36e]">ALL TEAMS</button>{TEAMS.map(team => (<button key={team} onClick={() => { setFilterTeam(team); setIsFilterTeamDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 text-[#e2b36e]/70">{team}</button>))}</div>)}</div>
                             <div className="px-3 py-1 bg-white/10 rounded text-xs font-bold text-[#e2b36e]/50 whitespace-nowrap">{processedUsers.length} Users</div>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {isLoading ? Array.from({length:6}).map((_,i) => (<div key={i} className="h-40 bg-white/5 rounded-2xl animate-pulse"></div>)) : processedUsers.length === 0 ? (<div className="col-span-full flex flex-col items-center justify-center py-20 opacity-50"><UsersIcon size={48} className="mb-4 text-[#e2b36e]/30" /><p className="text-[#e2b36e]/60 font-medium">No members found matching your criteria.</p></div>) : processedUsers.map(u => (
                                <GlassCard key={u.id} className="p-5 flex flex-col gap-4 group hover:bg-white/5 transition-colors relative overflow-hidden">
                                    <div className="flex items-start justify-between">
                                        <div className="flex items-center gap-3">
                                            <div className="relative">
                                                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[#e2b36e] to-[#b28e67] flex items-center justify-center text-lg font-bold shadow-lg text-[#09232b]">{u.username.charAt(0).toUpperCase()}</div>
                                                {/* ONLINE INDICATOR */}
                                                {onlineUsers.has(u.username) && (
                                                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                                      <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500 border-2 border-[#09232b]"></span>
                                                    </span>
                                                )}
                                            </div>
                                            <div><div className="font-bold text-lg leading-tight text-[#e2b36e]">{u.username}</div><div className="text-[10px] text-[#e2b36e]/60 mb-0.5">{u.team || 'No Team'}</div><div className="text-xs text-[#e2b36e]/40 font-mono">ID: #{u.id}</div></div>
                                        </div>
                                        <div className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${u.status === 'banned' ? 'bg-red-500/20 text-red-400' : 'bg-[#e2b36e]/20 text-[#e2b36e]'}`}>{u.status === 'active' ? 'ACTIVE' : u.status}</div>
                                    </div>
                                    <div className="grid grid-cols-2 gap-2 text-sm mt-2 bg-black/20 p-3 rounded-lg border border-white/5"><div className="flex flex-col"><span className="text-[10px] text-[#e2b36e]/40 uppercase">Role</span><span className="font-bold text-[#e2b36e]">{u.role}</span></div><div className="flex flex-col items-end"><span className="text-[10px] text-[#e2b36e]/40 uppercase">Balance</span><span className="font-bold text-[#e2b36e]">{u.credits}</span></div></div>
                                    
                                    {/* WEB ACCESS BADGE */}
                                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/5">
                                        <Globe size={12} className={u.web_access === 'EK' ? 'text-[#1e40af]' : u.web_access === 'KAT' ? 'text-[#e2b36e]' : 'text-[#215a6c]'} />
                                        <span className="text-[10px] font-bold text-[#e2b36e]/60 uppercase tracking-wide flex-1">PORTAL:</span>
                                        <span className={`text-[10px] font-bold uppercase ${u.web_access === 'EK' ? 'text-[#1e40af]' : u.web_access === 'KAT' ? 'text-[#e2b36e]' : 'text-[#215a6c]'}`}>
                                            {u.web_access === 'BOTH' ? 'ALL' : (u.web_access || 'ALL')}
                                        </span>
                                    </div>

                                    <div className="grid grid-cols-5 gap-2 mt-auto pt-2 border-t border-white/5">
                                        <button onClick={() => handleRoleChange(u.username, u.role)} className="p-2 rounded hover:bg-white/10 text-[#e2b36e]/40 hover:text-[#e2b36e] transition-colors" title={u.role === 'admin' ? "Demote" : "Promote"} disabled={processingUser === u.username}>{u.role === 'admin' ? <User size={16} /> : <Shield size={16} />}</button>
                                        <button onClick={() => openWebAccessModal(u.username, u.web_access === 'BOTH' ? 'ALL' : (u.web_access || 'ALL'))} className="p-2 rounded hover:bg-white/10 text-[#e2b36e]/40 hover:text-green-400 transition-colors" title="Change Web Access" disabled={processingUser === u.username}><Globe size={16} /></button>
                                        <button onClick={() => handleResetPassword(u.username)} className="p-2 rounded hover:bg-white/10 text-[#e2b36e]/40 hover:text-yellow-400 transition-colors" title="Reset Password" disabled={processingUser === u.username}><Key size={16} /></button>
                                        <button onClick={() => handleToggleBan(u.username, u.status)} className={`p-2 rounded hover:bg-white/10 transition-colors ${u.status === 'banned' ? 'text-[#e2b36e]' : 'text-[#e2b36e]/40 hover:text-orange-400'}`} title={u.status === 'banned' ? "Unban" : "Ban"} disabled={processingUser === u.username}>{u.status === 'banned' ? <CheckCircle2 size={16} /> : <Ban size={16} />}</button>
                                        <button onClick={() => handleDeleteUser(u.username)} className="p-2 rounded hover:bg-white/10 text-[#e2b36e]/40 hover:text-red-500 transition-colors" title="Delete User" disabled={processingUser === u.username}><Trash2 size={16} /></button>
                                    </div>
                                    {processingUser === u.username && <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-20"><RefreshCw className="animate-spin text-white" /></div>}
                                </GlassCard>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'transactions' && (
                <div className="absolute inset-0 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="h-16 border-b border-white/10 flex items-center justify-between px-8 bg-white/5 shrink-0">
                        {/* Transaction Header Content (Kept same) */}
                        <div className="flex items-center gap-4">
                            <h3 className="text-sm font-bold uppercase tracking-widest text-[#e2b36e]/60">Transaction Log</h3>
                            <button onClick={handleResetTransactions} disabled={isTxLoading} className="text-xs text-red-400 hover:text-red-300 hover:underline flex items-center gap-1"><Trash2 size={12} /> Clear History</button>
                        </div>
                        <div className="flex gap-3">
                             <div className="relative">
                                 <div className="flex bg-black/40 border border-white/10 rounded-lg p-1 gap-1">
                                     <button onClick={() => setTxTypeFilter('ALL')} className={`px-3 py-1 text-xs rounded font-bold transition-all ${txTypeFilter === 'ALL' ? 'bg-white text-black' : 'text-[#e2b36e]/40 hover:text-[#e2b36e]'}`}>All</button>
                                     <button onClick={() => setTxTypeFilter('TOPUP')} className={`px-3 py-1 text-xs rounded font-bold transition-all flex items-center gap-1 ${txTypeFilter === 'TOPUP' ? 'bg-[#e2b36e] text-[#09232b]' : 'text-[#e2b36e]/40 hover:text-[#e2b36e]'}`}><TrendingUp size={10} /> Top-ups</button>
                                     <button onClick={() => setTxTypeFilter('USAGE')} className={`px-3 py-1 text-xs rounded font-bold transition-all flex items-center gap-1 ${txTypeFilter === 'USAGE' ? 'bg-white text-black' : 'text-[#e2b36e]/40 hover:text-[#e2b36e]'}`}><Zap size={10} /> Usage</button>
                                 </div>
                             </div>
                             <div className="relative">
                                 <button onClick={() => setIsTxUserDropdownOpen(!isTxUserDropdownOpen)} className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs hover:bg-white/5 transition-colors text-[#e2b36e]/70"><Filter size={12} /> User: <span className="text-[#e2b36e] font-bold">{txUserFilter}</span> <ChevronDown size={12} /></button>
                                 {isTxUserDropdownOpen && (<div className="absolute top-full right-0 mt-2 w-48 bg-[#09232b] border border-[#e2b36e]/20 rounded-lg shadow-xl overflow-hidden z-50 max-h-60 overflow-y-auto"><button onClick={() => { setTxUserFilter('ALL'); setIsTxUserDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-xs font-bold hover:bg-white/10 text-[#e2b36e]">ALL USERS</button>{users.map(u => (<button key={u.username} onClick={() => { setTxUserFilter(u.username); setIsTxUserDropdownOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 text-[#e2b36e]/70">{u.username}</button>))}</div>)}
                             </div>
                             <div className="relative">
                                 <button onClick={() => setIsDateFilterOpen(!isDateFilterOpen)} className="flex items-center gap-2 px-3 py-1.5 bg-black/40 border border-white/10 rounded-lg text-xs hover:bg-white/5 transition-colors text-[#e2b36e]/70"><Calendar size={12} /> Date: <span className="text-[#e2b36e] font-bold">{txDateRange === 'ALL' ? 'All Time' : `Last ${txDateRange} Days`}</span> <ChevronDown size={12} /></button>
                                 {isDateFilterOpen && (<div className="absolute top-full right-0 mt-2 w-48 bg-[#09232b] border border-[#e2b36e]/20 rounded-lg shadow-xl overflow-hidden z-50"><button onClick={() => { setTxDateRange('ALL'); setIsDateFilterOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 text-[#e2b36e]/70">All Time</button><button onClick={() => { setTxDateRange('7'); setIsDateFilterOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 text-[#e2b36e]/70">Last 7 Days</button><button onClick={() => { setTxDateRange('14'); setIsDateFilterOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 text-[#e2b36e]/70">Last 14 Days</button><button onClick={() => { setTxDateRange('31'); setIsDateFilterOpen(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-white/10 text-[#e2b36e]/70">Last 30 Days</button></div>)}
                             </div>
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                        {isTxLoading ? (<div className="flex items-center justify-center h-full text-[#e2b36e]/30 animate-pulse text-xs uppercase tracking-widest"><RefreshCw className="animate-spin mr-2" /> Loading Transactions...</div>) : processedTransactions.length === 0 ? (<div className="flex flex-col items-center justify-center h-full text-[#e2b36e]/20 gap-4 opacity-50"><FileText size={48} /><span className="text-sm font-medium">No transactions found matching criteria.</span></div>) : (
                            <div className="space-y-2">
                                {processedTransactions.map((tx, idx) => {
                                    const { amount: txAmount, reason } = parseTransactionContent(tx.content);
                                    const isPositive = txAmount >= 0;
                                    const isTopUp = tx.type === 'topup' || tx.type === 'bonus';
                                    return (
                                        <div key={idx} className={`rounded-xl p-4 flex items-center justify-between border transition-colors group ${isTopUp ? 'bg-[#e2b36e]/5 border-[#e2b36e]/10 hover:bg-[#e2b36e]/10' : 'bg-white/[0.03] border-white/5 hover:bg-white/[0.06]'}`}>
                                            <div className="flex items-center gap-4">
                                                <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${isPositive ? 'bg-[#e2b36e]/10 border-[#e2b36e]/20 text-[#e2b36e]' : 'bg-white/10 border-white/20 text-white'}`}>
                                                    {isPositive ? <ArrowRight size={16} className="-rotate-45" /> : <Zap size={16} />}
                                                </div>
                                                <div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-sm font-bold text-[#e2b36e]">{tx.username}</span>
                                                        <span className="text-[10px] text-[#e2b36e]/30">{tx.date}</span>
                                                        {tx.type && <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${isTopUp ? 'bg-[#e2b36e]/20 text-[#e2b36e]' : 'bg-white/10 text-white/40'}`}>{tx.type}</span>}
                                                    </div>
                                                    <div className="text-xs text-[#e2b36e]/50 mt-0.5 max-w-md truncate" title={reason}>{reason}</div>
                                                </div>
                                            </div>
                                            <div className={`font-mono font-bold text-sm ${isPositive ? 'text-[#e2b36e]' : 'text-white'}`}>{isPositive ? '+' : ''}{txAmount}</div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'register' && (
                <div className="absolute inset-0 p-8 flex items-center justify-center animate-in fade-in slide-in-from-bottom-2 duration-300 overflow-y-auto">
                    <div className="w-full max-w-2xl">
                        <div className="flex justify-center mb-6"><div className="bg-black/20 p-1 rounded-xl flex gap-1 border border-white/10"><button onClick={() => setIsBulkRegister(false)} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${!isBulkRegister ? 'bg-white text-black shadow-lg' : 'text-[#e2b36e]/40 hover:text-[#e2b36e]'}`}>Single User</button><button onClick={() => setIsBulkRegister(true)} className={`px-6 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all ${isBulkRegister ? 'bg-white text-black shadow-lg' : 'text-[#e2b36e]/40 hover:text-[#e2b36e]'}`}>Multi-User</button></div></div>
                        {!isBulkRegister ? (
                            <GlassCard className="p-8 md:p-10 border-white/10 relative">
                                <div className="text-center mb-8"><h3 className="text-2xl font-black text-[#e2b36e] uppercase tracking-tight mb-2">New Recruit</h3><p className="text-[#e2b36e]/40 text-xs">Initialize a new creative agent into the system.</p></div>
                                <form onSubmit={handleCreateUser} className="space-y-5">
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-[#e2b36e]/40 uppercase tracking-widest pl-1">Codename (Username)</label><div className="relative group"><User className="absolute left-4 top-1/2 -translate-y-1/2 text-[#e2b36e]/30 group-focus-within:text-[#e2b36e] transition-colors" size={16} /><input type="text" value={newUser.username} onChange={(e) => setNewUser({...newUser, username: e.target.value})} placeholder="e.g. agent_sky" className="w-full bg-black/20 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-[#e2b36e] placeholder-[#e2b36e]/20 focus:outline-none focus:border-[#e2b36e]/50 focus:bg-black/40 transition-all font-mono lowercase" /></div></div>
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-[#e2b36e]/40 uppercase tracking-widest pl-1">Access Key (Password)</label><div className="relative group"><Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-[#e2b36e]/30 group-focus-within:text-[#e2b36e] transition-colors" size={16} /><input type="text" value={newUser.password} onChange={(e) => setNewUser({...newUser, password: e.target.value})} placeholder="Default: Astra123@" className="w-full bg-black/20 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-[#e2b36e] placeholder-[#e2b36e]/20 focus:outline-none focus:border-[#e2b36e]/50 focus:bg-black/40 transition-all font-mono" /></div></div>
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-[#e2b36e]/40 uppercase tracking-widest pl-1">Starting Balance (Credits)</label><div className="relative group"><Wallet className="absolute left-4 top-1/2 -translate-y-1/2 text-[#e2b36e]/30 group-focus-within:text-[#e2b36e] transition-colors" size={16} />
                                    <input 
                                        type="number" 
                                        value={newUser.credits} 
                                        onChange={(e) => setNewUser({...newUser, credits: e.target.value})} 
                                        placeholder="Credits" 
                                        className="w-full bg-black/20 border border-white/10 rounded-xl py-3.5 pl-11 pr-4 text-[#e2b36e] placeholder-[#e2b36e]/20 focus:outline-none focus:border-[#e2b36e]/50 focus:bg-black/40 transition-all font-mono appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" 
                                    /></div></div>
                                    <div className="grid grid-cols-2 gap-5">
                                        <div className="space-y-1"><label className="text-[10px] font-bold text-[#e2b36e]/40 uppercase tracking-widest pl-1">Clearance Level</label><div className="relative"><select value={newUser.role} onChange={(e) => setNewUser({...newUser, role: e.target.value})} className={`w-full bg-black/20 border border-white/10 rounded-xl py-3.5 px-4 appearance-none focus:outline-none focus:border-[#e2b36e]/50 cursor-pointer ${newUser.role ? 'text-[#e2b36e]' : 'text-[#e2b36e]/40'}`}><option value="" disabled className="bg-[#09232b] text-[#e2b36e]/50">Select Role</option><option value="user" className="bg-[#09232b] text-[#e2b36e]">User</option><option value="admin" className="bg-[#09232b] text-[#e2b36e]">Administrator</option></select><ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 text-[#e2b36e]/30 pointer-events-none" size={16} /></div></div>
                                        <div className="space-y-1"><label className="text-[10px] font-bold text-[#e2b36e]/40 uppercase tracking-widest pl-1">Team</label><div className="relative" ref={teamDropdownRef}><button type="button" onClick={() => setIsTeamDropdownOpen(!isTeamDropdownOpen)} className={`w-full bg-black/20 border border-white/10 rounded-xl py-3.5 px-4 text-left focus:outline-none focus:border-[#e2b36e]/50 flex items-center justify-between ${newUser.team ? 'text-[#e2b36e]' : 'text-[#e2b36e]/40'}`}><span>{newUser.team || 'Select Team'}</span><ChevronDown className={`text-[#e2b36e]/30 transition-transform ${isTeamDropdownOpen ? 'rotate-180' : ''}`} size={16} /></button>{isTeamDropdownOpen && (<div className="absolute bottom-full left-0 mb-1 w-full bg-[#09232b] border border-[#e2b36e]/20 rounded-xl shadow-xl overflow-hidden z-50">{TEAMS.map(team => (<button type="button" key={team} onClick={() => { setNewUser({...newUser, team: team}); setIsTeamDropdownOpen(false); }} className={`w-full text-left px-4 py-3 text-sm font-medium hover:bg-white/10 transition-colors ${newUser.team === team ? 'text-[#e2b36e] bg-white/5' : 'text-[#e2b36e]/80'}`}>{team}</button>))}</div>)}</div></div>
                                    </div>
                                    {/* WEB ACCESS SELECTION */}
                                    <div className="space-y-1"><label className="text-[10px] font-bold text-[#e2b36e]/40 uppercase tracking-widest pl-1">Web Access</label><div className="relative"><select value={newUser.web_access} onChange={(e) => setNewUser({...newUser, web_access: e.target.value as any})} className={`w-full bg-black/20 border border-white/10 rounded-xl py-3.5 px-4 appearance-none focus:outline-none focus:border-[#e2b36e]/50 cursor-pointer text-[#e2b36e]`}><option value="ALL" className="bg-[#09232b] text-[#e2b36e]">ALL (Astra KAT + EK)</option><option value="EK" className="bg-[#09232b] text-[#e2b36e]">EK Astra Only</option><option value="KAT" className="bg-[#09232b] text-[#e2b36e]">Astra KAT Only</option></select><Globe className="absolute right-4 top-1/2 -translate-y-1/2 text-[#e2b36e]/30 pointer-events-none" size={16} /></div></div>
                                    
                                    <Button type="submit" variant="primary" isLoading={isProcessing} className="w-full py-4 mt-4 font-bold tracking-widest text-sm shadow-xl">INITIALIZE USER</Button>
                                </form>
                            </GlassCard>
                        ) : (
                            <GlassCard className="p-0 border-white/10 overflow-hidden flex flex-col max-h-[600px]">
                                <div className="p-6 bg-black/20 border-b border-white/10 flex justify-between items-center"><h3 className="font-bold text-[#e2b36e]">Multi-User Creation</h3><div className="text-[10px] text-[#e2b36e]/40 font-mono">MAX 10 PER BATCH</div></div>
                                <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-2">
                                    {bulkUsers.map((u, idx) => (
                                        <div key={idx} className="grid grid-cols-12 gap-2 animate-in fade-in slide-in-from-left-2 duration-300">
                                            <div className="col-span-2"><input type="text" placeholder="Username" value={u.username} onChange={(e) => updateBulkUser(idx, 'username', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-[10px] text-[#e2b36e] focus:outline-none focus:bg-white/10" /></div>
                                            <div className="col-span-2"><input type="text" placeholder="Pass" value={u.password} onChange={(e) => updateBulkUser(idx, 'password', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-[10px] text-[#e2b36e] focus:outline-none focus:bg-white/10" /></div>
                                            <div className="col-span-2"><input type="number" placeholder="Credits" value={u.credits} onChange={(e) => updateBulkUser(idx, 'credits', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-2 py-2 text-[10px] text-[#e2b36e] focus:outline-none focus:bg-white/10 appearance-none" /></div>
                                            <div className="col-span-2"><select value={u.team} onChange={(e) => updateBulkUser(idx, 'team', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-1 py-2 text-[10px] text-[#e2b36e] focus:outline-none"><option value="" disabled className="bg-[#09232b]">Team</option>{TEAMS.map(t => <option key={t} value={t} className="bg-[#09232b]">{t}</option>)}</select></div>
                                            <div className="col-span-3"><select value={u.web_access} onChange={(e) => updateBulkUser(idx, 'web_access', e.target.value)} className="w-full bg-white/5 border border-white/10 rounded-lg px-1 py-2 text-[10px] text-[#e2b36e] focus:outline-none"><option value="ALL" className="bg-[#09232b]">ALL</option><option value="EK" className="bg-[#09232b]">EK</option><option value="KAT" className="bg-[#09232b]">KAT</option></select></div>
                                            <div className="col-span-1"><button onClick={() => removeBulkRow(idx)} disabled={bulkUsers.length === 1} className="w-full h-full bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500 hover:text-white transition-colors disabled:opacity-30 flex items-center justify-center"><Trash2 size={12} /></button></div>
                                        </div>
                                    ))}
                                </div>
                                <div className="p-4 border-t border-white/10 bg-black/20 flex justify-between">
                                    <button onClick={addBulkRow} disabled={bulkUsers.length >= 10} className="px-4 py-2 bg-white/5 border border-white/10 rounded-lg text-xs font-bold text-[#e2b36e] hover:bg-white/10 transition-colors disabled:opacity-50">+ Add Row</button>
                                    <Button onClick={handleCreateUser} isLoading={isProcessing} className="px-8 py-2 text-xs font-bold">EXECUTE BATCH</Button>
                                </div>
                            </GlassCard>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'console' && (
                <div className="absolute inset-0 p-6 flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 overflow-hidden">
                    {/* Status Grid (Kept same) */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-none">
                        <GlassCard className={`p-4 flex items-center justify-between border-l-4 ${getHealthColor(geminiHealth.status)}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg bg-black/20`}>
                                    <Zap size={20} className={geminiHealth.status === 'online' ? 'text-[#e2b36e]' : 'text-white/50'} />
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Gemini API</div>
                                    <div className="text-sm font-bold">{geminiHealth.status === 'unknown' ? 'Unknown' : (geminiHealth.status === 'online' ? 'Operational' : 'Error')}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-mono font-bold">{geminiHealth.latency}ms</div>
                            </div>
                        </GlassCard>

                        <GlassCard className={`p-4 flex items-center justify-between border-l-4 ${getHealthColor(supabaseHealth.status)}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg bg-black/20`}>
                                    <Database size={20} className={supabaseHealth.status === 'online' ? 'text-[#e2b36e]' : 'text-white/50'} />
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Database</div>
                                    <div className="text-sm font-bold">{supabaseHealth.status === 'unknown' ? 'Unknown' : (supabaseHealth.status === 'online' ? 'Connected' : 'Error')}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-mono font-bold">{supabaseHealth.latency}ms</div>
                            </div>
                        </GlassCard>

                        <GlassCard className={`p-4 flex items-center justify-between border-l-4 ${getHealthColor(sheetsHealth.status)}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg bg-black/20`}>
                                    <Server size={20} className={sheetsHealth.status === 'online' ? 'text-[#e2b36e]' : 'text-white/50'} />
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Proxy (Sheet)</div>
                                    <div className="text-sm font-bold">{sheetsHealth.status === 'unknown' ? 'Unknown' : (sheetsHealth.status === 'online' ? 'Active' : 'Down')}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-mono font-bold">{sheetsHealth.latency}ms</div>
                            </div>
                        </GlassCard>

                        <GlassCard className={`p-4 flex items-center justify-between border-l-4 ${getHealthColor(webHealth)}`}>
                            <div className="flex items-center gap-3">
                                <div className={`p-2 rounded-lg bg-black/20`}>
                                    <Activity size={20} className={webHealth === 'Smooth' || webHealth === 'Stable' ? 'text-[#e2b36e]' : 'text-white/50'} />
                                </div>
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-widest opacity-60">Web Health</div>
                                    <div className="text-sm font-bold">{webHealth}</div>
                                </div>
                            </div>
                            {webHealth === 'Checking' && <RefreshCw size={14} className="animate-spin opacity-50" />}
                        </GlassCard>
                    </div>

                    {/* Console Output (Kept same) */}
                    <GlassCard className="flex-1 p-0 flex flex-col overflow-hidden border-white/20 bg-[#0c0a09]">
                        <div className="flex-none p-3 bg-white/5 border-b border-white/10 flex items-center justify-between">
                            <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#e2b36e]/60">
                                <Terminal size={14} />
                                <span>SYSTEM_LOGS://ADMIN_CONSOLE</span>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setConsoleLogs([])} className="px-3 py-1 bg-white/5 hover:bg-white/10 rounded text-[10px] font-mono text-white/50 hover:text-white transition-colors">CLEAR</button>
                                {isDiagnosticsRunning ? (
                                    <button onClick={handleStopDiagnostics} className="px-4 py-1 bg-red-500/20 hover:bg-red-500/40 border border-red-500/30 rounded text-[10px] font-mono text-red-400 font-bold transition-colors flex items-center gap-2 animate-pulse">
                                        <StopCircle size={10} /> STOP
                                    </button>
                                ) : (
                                    <button onClick={runDiagnostics} className="px-4 py-1 bg-white/10 hover:bg-white/20 border border-white/30 rounded text-[10px] font-mono text-white font-bold transition-colors flex items-center gap-2">
                                        <Zap size={10} /> RUN DIAGNOSTICS
                                    </button>
                                )}
                            </div>
                        </div>
                        <div ref={logContainerRef} className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1.5 scroll-smooth">
                            {consoleLogs.length === 0 && (
                                <div className="h-full flex items-center justify-center text-[#e2b36e]/20">
                                    <p>Ready. Waiting for input or events...</p>
                                </div>
                            )}
                            {consoleLogs.map((log, i) => (
                                <div key={i} className={`flex gap-3 animate-in fade-in slide-in-from-left-1 duration-100 ${
                                    log.type === 'error' ? 'text-red-400' : 
                                    log.type === 'success' ? 'text-[#e2b36e]' : 
                                    log.type === 'warn' ? 'text-white' : 'text-white/60'
                                }`}>
                                    <span className="opacity-40 min-w-[60px] select-none">[{log.timestamp}]</span>
                                    <span className="font-bold min-w-[70px] uppercase tracking-wider text-[10px] py-0.5 px-1 rounded bg-white/5 text-center select-none">{log.source}</span>
                                    <span className="break-all whitespace-pre-wrap">{log.message}</span>
                                </div>
                            ))}
                            {isDiagnosticsRunning && (
                                <div className="flex gap-2 items-center text-[#e2b36e]/40 animate-pulse">
                                    <span className="w-1.5 h-4 bg-white/60 block"></span>
                                </div>
                            )}
                        </div>
                    </GlassCard>
                </div>
            )}
         </div>
      </div>
    </div>
    </>
  );
};
