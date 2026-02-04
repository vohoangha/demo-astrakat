
import { User } from "../types";
import { IS_DEV_MODE, DEV_CREDENTIALS, MOCK_USER_DATA, DEV_LATENCY } from "../dev/config";
import { supabase } from "./supabaseClient";
import bcrypt from 'bcryptjs';

let MOCK_DB_USERS = [
    { id: 1, username: "admin", credits: 9999, role: 'admin', status: 'active', team: 'EK', passwordHash: '$2a$10$X...', session_token: 'mock-token-1' },
    { id: 2, username: "caonin", credits: 50.5, role: 'user', status: 'active', team: 'KAT - Architectural', passwordHash: '$2a$10$X...', session_token: 'mock-token-2' },
    { id: 3, username: "tester_01", credits: 100.2, role: 'user', status: 'active', team: 'KAT - Design', passwordHash: '$2a$10$X...', session_token: 'mock-token-3' },
    { id: 4, username: "design_lead", credits: 5000, role: 'user', status: 'active', team: 'KAT - Content', passwordHash: '$2a$10$X...', session_token: 'mock-token-4' },
    { id: 5, username: "new_cadet", credits: 0, role: 'user', status: 'banned', team: 'KAT - Marketing', passwordHash: '$2a$10$X...', session_token: 'mock-token-5' }
];

let MOCK_TRANSACTIONS = [
    { date: "01/01/2025 10:00:00", username: "admin", content: "+100 Credits Topup", type: 'topup' },
    { date: "02/01/2025 11:30:00", username: "caonin", content: "-0.2 Credits Generated Image", type: 'usage' }
];

const formatDate = (isoString: string) => {
    try {
        const d = new Date(isoString);
        return d.toLocaleString('en-GB', { timeZone: 'Asia/Ho_Chi_Minh' });
    } catch {
        return isoString;
    }
};

const generateSessionToken = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
};

const generateProfessionalFilename = (promptText: string, quality: string = 'Standard', isEdit: boolean = false): string => {
    const prefix = "AstraKAT";
    
    let slug = "Creative-Design";
    if (isEdit) {
        slug = "EditMode";
    } else if (promptText && promptText.trim()) {
        // Remove accents, keep alphanumeric and spaces, split, take 5 words, join with dash
        const clean = promptText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, "").trim();
        const words = clean.split(/\s+/).slice(0, 5);
        if (words.length > 0) slug = words.join('-');
    }
    
    const resolution = quality === 'Auto' ? 'Standard' : quality;
    
    const d = new Date();
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const dateStr = `${day}${month}${year}`;
    
    const id = Math.random().toString(36).substr(2, 6).toUpperCase();

    return `${prefix}_${slug}_${resolution}_${dateStr}_${id}.png`;
};

const proxyFetch = async (body: any) => {
    const response = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include', 
        body: JSON.stringify(body)
    });
    if (!response.ok) {
        let errorMsg = `Server Error ${response.status}`;
        try {
            const err = await response.json();
            if (err.error) errorMsg = err.error;
        } catch {
            const txt = await response.text();
            if (txt) errorMsg = `Server Error ${response.status}: ${txt.substring(0, 50)}`;
        }
        throw new Error(errorMsg);
    }
    return response.json();
};

export const apiService = {

  // NEW: Proxy method for Gemini API
  geminiProxy: async (payload: { model: string, contents: any, config?: any }) => {
      try {
          return await proxyFetch({
              action: 'gemini_proxy',
              ...payload
          });
      } catch (e: any) {
          throw new Error(`Proxy Gemini Failed: ${e.message}`);
      }
  },

  getUserProfile: async (username: string): Promise<User | null> => {
      if (IS_DEV_MODE) {
          const user = MOCK_DB_USERS.find(u => u.username === username.toLowerCase());
          if (!user) return null;
          return {
            username: user.username,
            credits: user.credits,
            avatarUrl: `https://ui-avatars.com/api/?name=${user.username}&background=random`,
            role: user.role as any,
            status: user.status as any,
            team: user.team,
            session_token: user.session_token
          };
      }

      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username.toLowerCase())
        .single();
      
      if (error || !data) return null;

      return {
        username: data.username,
        credits: Number(data.credits || 0), // Allow float
        avatarUrl: data.avatar_url || '',
        role: data.role as any,
        status: data.status || 'active',
        team: data.team || 'EK',
        session_token: data.session_token
      };
  },

  syncUserToGoogleSheet: async (userData: { username: string, password?: string, credits?: number, team?: string, role?: string, status?: string }) => {
     if (!userData.username) return;

     try {
         const result = await proxyFetch({
            endpointType: 'db_sync', 
            action: 'sync_user_data',
            ...userData
         });
         return result;
     } catch (e) {
         return { error: e };
     }
  },

  testConnection: async () => {
      return proxyFetch({
          endpointType: 'db_sync',
          action: 'test_connection'
      });
  },

  checkSupabaseHealth: async (): Promise<{ latency: number; status: 'ok' | 'error'; message?: string }> => {
      if (IS_DEV_MODE) return { latency: 50, status: 'ok' };
      
      const start = Date.now();
      try {
          const { error } = await supabase.from('users').select('id', { count: 'exact', head: true });
          if (error) throw error;
          const latency = Date.now() - start;
          return { latency, status: 'ok' };
      } catch (e: any) {
          return { latency: 0, status: 'error', message: e.message };
      }
  },

  login: async (username: string, password: string): Promise<User> => {
    const lowerUser = username.toLowerCase();

    if (IS_DEV_MODE) {
        await new Promise(r => setTimeout(r, DEV_LATENCY));
        const user = MOCK_DB_USERS.find(u => u.username === lowerUser);
        if (!user) {
             if (lowerUser === DEV_CREDENTIALS.username && password === DEV_CREDENTIALS.password) return MOCK_USER_DATA;
             throw new Error("Invalid credentials.");
        }
        if (user.status === 'banned' || user.status === 'deleted user') throw new Error("Your account has been banned.");
        
        user.session_token = generateSessionToken();
        
        return {
            username: user.username,
            credits: user.credits,
            avatarUrl: `https://ui-avatars.com/api/?name=${user.username}&background=random`,
            role: user.role as any,
            status: user.status as any,
            team: user.team,
            session_token: user.session_token
        };
    }

    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', lowerUser)
        .single();

    if (error || !data) {
        throw new Error("Invalid username or password.");
    }

    let isMatch = false;
    let needsMigration = false;
    const isHashed = data.password.startsWith('$2');

    if (isHashed) {
        isMatch = await bcrypt.compare(password, data.password);
    } else {
        isMatch = data.password === password;
        if (isMatch) needsMigration = true;
    }

    if (!isMatch) {
        throw new Error("Invalid username or password.");
    }

    if (data.status === 'banned' || data.status === 'deleted user') {
         throw new Error("Your account has been banned. Please contact the administrator.");
    }

    const newSessionToken = generateSessionToken();
    const updatePayload: any = { session_token: newSessionToken };

    if (needsMigration) {
        const salt = await bcrypt.genSalt(10);
        updatePayload.password = await bcrypt.hash(password, salt);
    }

    await supabase.from('users').update(updatePayload).eq('id', data.id);

    return {
        username: data.username,
        credits: Number(data.credits || 0),
        avatarUrl: data.avatar_url || '',
        role: data.role as any,
        status: data.status || 'active',
        team: data.team || 'EK',
        session_token: newSessionToken 
    };
  },

  changePassword: async (username: string, oldPassword: string, newPassword: string): Promise<string> => {
    const lowerUser = username.toLowerCase();
    
    if (IS_DEV_MODE) {
        await new Promise(r => setTimeout(r, 1500));
        return "new-mock-token-" + Date.now();
    }
    
    const { data: user, error: verifyError } = await supabase
        .from('users')
        .select('password')
        .eq('username', lowerUser)
        .single();

    if (verifyError || !user) throw new Error("User not found.");

    const isHashed = user.password.startsWith('$2');
    let isMatch = false;
    if (isHashed) {
        isMatch = await bcrypt.compare(oldPassword, user.password);
    } else {
        isMatch = user.password === oldPassword;
    }

    if (!isMatch) throw new Error("Incorrect old password.");

    const salt = await bcrypt.genSalt(10);
    const newHash = await bcrypt.hash(newPassword, salt);
    
    const newSessionToken = generateSessionToken();

    const { error: updateError } = await supabase
        .from('users')
        .update({ password: newHash, session_token: newSessionToken })
        .eq('username', lowerUser);

    if (updateError) throw new Error(updateError.message);

    apiService.syncUserToGoogleSheet({ username: lowerUser, password: newPassword });

    return newSessionToken;
  },

  logTransaction: async (username: string, description: string, amount: number, type: 'usage' | 'topup' | 'bonus' | 'adjustment' = 'usage'): Promise<{ success: boolean; newBalance: number }> => {
    const lowerUser = username.toLowerCase();
    
    // Support decimals (e.g., 0.2, 0.8)
    const safeAmount = Number(amount.toFixed(2));

    if (IS_DEV_MODE) {
         const user = MOCK_DB_USERS.find(u => u.username === lowerUser);
         let newBal = 9999 + safeAmount;
         if (user) { 
             user.credits = Number((user.credits + safeAmount).toFixed(2)); 
             newBal = user.credits; 
         }
         return { success: true, newBalance: newBal };
    }

    const { data: user, error: fetchError } = await supabase
        .from('users')
        .select('credits')
        .eq('username', lowerUser)
        .single();
    
    if (fetchError || !user) {
        const msg = fetchError ? fetchError.message : "User row not found";
        throw new Error(`Transaction Init Failed: ${msg}`);
    }

    // Support decimals
    const currentCredits = Number(user.credits || 0);
    const newCredits = Number((currentCredits + safeAmount).toFixed(2));

    const { error: updateError } = await supabase
        .from('users')
        .update({ credits: newCredits })
        .eq('username', lowerUser);

    if (updateError) {
        throw new Error(`Credit Update Failed: ${updateError.message} (Supabase Column must be 'numeric' not 'int')`);
    }

    const prefix = safeAmount >= 0 ? "+" : "";
    const content = `${prefix}${safeAmount} Credits | ${description}`;
    
    supabase.from('transactions').insert([{
        username: lowerUser,
        amount: safeAmount,
        content: content,
        type: type
    }]).then(({ error }) => {
        if (error) console.error("Transaction Log Error:", error);
    });

    if (type !== 'usage') {
        apiService.syncUserToGoogleSheet({ username: lowerUser, credits: newCredits });
    }

    return { success: true, newBalance: newCredits };
  },

   uploadGeneratedImage: async (username: string, team: string | undefined, base64Image: string, promptText: string, isEdit: boolean = false, quality: string = 'Standard') => {
       if (IS_DEV_MODE && !window.location.hostname.includes('localhost')) return; 

       try {
           const filename = generateProfessionalFilename(promptText, quality, isEdit);
           
           await proxyFetch({
               endpointType: 'storage', 
               action: 'upload_generated_image', 
               image: base64Image,      
               filename: filename,
               prompt: promptText,
               username: username,
               team: team
           });
       } catch (error) {
           console.error("Upload failed", error);
       }
   },

   uploadAvatar: async (username: string, base64Image: string): Promise<string> => {
      if (IS_DEV_MODE) {
          return `data:image/png;base64,${base64Image.replace(/^data:image\/[a-z]+;base64,/, '')}`;
      }

      try {
          const result = await proxyFetch({
              action: 'upload_avatar',
              username: username,
              base64Image: base64Image
          });

          if (!result.success || !result.url) {
              throw new Error(result.error || "Failed to get image URL");
          }

          return result.url;
      } catch (error: any) {
          throw new Error("Failed to upload avatar to Drive.");
      }
   },
   
   deleteAvatar: async (fileUrl: string): Promise<void> => { 
       if (IS_DEV_MODE || !fileUrl.includes("drive.google.com")) return;
       try {
           await proxyFetch({
               action: 'delete_avatar',
               fileUrl: fileUrl
           });
       } catch (e) {
       }
   },

   updateUserAvatar: async (username: string, avatarUrl: string): Promise<boolean> => {
      if (IS_DEV_MODE) return true;
      const { error } = await supabase
        .from('users')
        .update({ avatar_url: avatarUrl })
        .eq('username', username);
      return !error;
   },

   adminGetUsers: async (): Promise<any[]> => {
      if (IS_DEV_MODE) {
          await new Promise(r => setTimeout(r, 600)); 
          return [...MOCK_DB_USERS];
      }
      
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .neq('status', 'deleted user')
        .order('id', { ascending: true });

      if (error) throw new Error(error.message);

      return data.map(u => ({
          id: u.id,
          username: u.username,
          credits: Number(u.credits), // Allow float
          team: u.team,
          role: u.role,
          status: u.status,
          avatarUrl: u.avatar_url
      }));
   },

   adminCreateUser: async (newUser: any, superAdminPass: string): Promise<boolean> => {
      await proxyFetch({ action: 'admin_create_user', superAdminPass, username: 'admin' });

      const lowerUser = newUser.username.toLowerCase().trim();
      const { data: existing } = await supabase.from('users').select('id').eq('username', lowerUser).single();
      if (existing) throw new Error("Username already exists.");

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(newUser.password, salt);
      const newToken = generateSessionToken();

      const { error } = await supabase.from('users').insert([{
          username: lowerUser,
          password: hashedPassword,
          credits: Number(newUser.credits || 0),
          role: newUser.role || 'user',
          team: newUser.team || 'EK',
          status: 'active',
          session_token: newToken
      }]);

      if (error) throw new Error(error.message);
      
      if (newUser.credits > 0) {
          await supabase.from('transactions').insert([{
              username: lowerUser,
              amount: Number(newUser.credits),
              content: `+${Number(newUser.credits)} Fresh start Credits`,
              type: 'bonus'
          }]);
      }

      try {
          await apiService.syncUserToGoogleSheet({
              username: lowerUser,
              password: newUser.password, 
              credits: Number(newUser.credits || 0),
              team: newUser.team || 'EK',
              role: newUser.role || 'user',
              status: 'active'
          });
      } catch (e) {
      }

      return true;
   },

   adminCreateUserBulk: async (users: any[], superAdminPass: string): Promise<{ success: boolean; createdCount: number; error?: string }> => {
        await proxyFetch({ action: 'admin_create_user_bulk', superAdminPass, username: 'admin' });

        const sanitizedUsers = users.map(u => ({ ...u, username: u.username.toLowerCase().trim() }));
        let createdCount = 0;
        
        for (const u of sanitizedUsers) {
            try {
                const { data: existing } = await supabase.from('users').select('id').eq('username', u.username).single();
                if (!existing) {
                    const salt = await bcrypt.genSalt(10);
                    const hashedPassword = await bcrypt.hash(u.password || 'Astra123@', salt);
                    const newToken = generateSessionToken();

                    await supabase.from('users').insert([{
                        username: u.username,
                        password: hashedPassword,
                        credits: Number(u.credits || 0),
                        role: u.role || 'user',
                        team: u.team || 'EK',
                        status: 'active',
                        session_token: newToken
                    }]);
                    createdCount++;
                    
                     if (u.credits > 0) {
                        await supabase.from('transactions').insert([{
                            username: u.username,
                            amount: Number(u.credits),
                            content: `+${Number(u.credits)} Fresh start Credits`,
                            type: 'bonus'
                        }]);
                    }

                    await new Promise(r => setTimeout(r, 200));
                    apiService.syncUserToGoogleSheet({
                        username: u.username,
                        password: u.password || 'Astra123@',
                        credits: Number(u.credits || 0),
                        team: u.team || 'EK',
                        role: u.role || 'user',
                        status: 'active'
                    });
                }
            } catch (e) { }
        }

        return { success: true, createdCount };
   },

   adminTopUp: async (targetUsernames: string[], amount: number, note: string | undefined, superAdminPass: string): Promise<{ success: boolean; successCount: number; failedCount: number }> => {
      await proxyFetch({ action: 'admin_top_up', superAdminPass, username: 'admin' });
      
      const sanitizedTargets = targetUsernames.map(t => t.toLowerCase());
      let successCount = 0;
      let failedCount = 0;
      const finalType = amount >= 0 ? 'topup' : 'adjustment';
      const safeAmount = Number(amount.toFixed(2)); // Allow Float

      for (const username of sanitizedTargets) {
          const { data: user } = await supabase.from('users').select('*').eq('username', username).single();
          
          if (!user || user.status === 'banned' || user.status === 'deleted user') {
              failedCount++;
              continue;
          }

          const currentCredits = Number(user.credits || 0);
          const newCredits = Number(Math.max(0, currentCredits + safeAmount).toFixed(2));

          const { error } = await supabase.from('users').update({ credits: newCredits }).eq('id', user.id);
          
          if (!error) {
              successCount++;
              const prefix = safeAmount >= 0 ? "+" : "";
              const noteText = note ? ` ${note}` : "";
              await supabase.from('transactions').insert([{
                  username: username,
                  amount: safeAmount,
                  content: `${prefix}${safeAmount} Credits${noteText}`,
                  type: finalType
              }]);
              
              apiService.syncUserToGoogleSheet({ username: username, credits: newCredits });
          } else {
              failedCount++;
          }
      }

      return { success: true, successCount, failedCount };
   },

   adminUpdateRole: async (targetUsername: string, newRole: string, superAdminPass: string): Promise<boolean> => {
       await proxyFetch({ action: 'admin_update_role', superAdminPass, username: 'admin' });

       const { error } = await supabase.from('users').update({ role: newRole }).eq('username', targetUsername);
       if (!error) apiService.syncUserToGoogleSheet({ username: targetUsername, role: newRole });
       return !error;
   },

   adminToggleStatus: async (targetUsername: string, newStatus: string, superAdminPass: string): Promise<boolean> => {
       await proxyFetch({ action: 'admin_toggle_status', superAdminPass, username: 'admin' });

       const { error } = await supabase.from('users').update({ status: newStatus }).eq('username', targetUsername);
       if (!error) apiService.syncUserToGoogleSheet({ username: targetUsername, status: newStatus });
       return !error;
   },

   adminResetPassword: async (targetUsername: string, superAdminPass: string): Promise<boolean> => {
       await proxyFetch({ action: 'admin_reset_password', superAdminPass, username: 'admin' });

       const salt = await bcrypt.genSalt(10);
       const hashedPassword = await bcrypt.hash('Astra123@', salt);
       const newToken = generateSessionToken(); 
       const { error } = await supabase.from('users').update({ password: hashedPassword, session_token: newToken }).eq('username', targetUsername);
       
       if (!error) apiService.syncUserToGoogleSheet({ username: targetUsername, password: 'Astra123@' });

       return !error;
   },

   adminDeleteUser: async (targetUsername: string, superAdminPass: string): Promise<boolean> => {
        await proxyFetch({ action: 'admin_delete_user', superAdminPass, username: 'admin' });

        const { data: user } = await supabase.from('users').select('credits').eq('username', targetUsername).single();
        
        const { error } = await supabase.from('users').update({ 
            status: 'deleted user',
            credits: 0,
            password: 'DELETED', 
            avatar_url: '',
            session_token: 'DELETED'
        }).eq('username', targetUsername);

        if (!error && user && user.credits > 0) {
             await supabase.from('transactions').insert([{
                  username: targetUsername,
                  amount: -Number(user.credits),
                  content: `-${Number(user.credits)} Credits Revoked due to account deletion`,
                  type: 'adjustment'
             }]);
        }

        if (!error) apiService.syncUserToGoogleSheet({ 
            username: targetUsername, 
            status: 'deleted user', 
            credits: 0,
            password: '[DELETED]' 
        });
        
        return !error;
   },
   
   adminGetTransactions: async (): Promise<any[]> => {
       if (IS_DEV_MODE) {
           await new Promise(r => setTimeout(r, 600));
           return [...MOCK_TRANSACTIONS];
       }
       const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(300); 

       if (error) throw new Error(error.message);
       
       return data.map(t => ({
           date: formatDate(t.created_at),
           username: t.username,
           content: t.content,
           type: t.type || 'usage'
       }));
   },

   adminResetTransactions: async (superAdminPass: string): Promise<boolean> => {
       await proxyFetch({ action: 'admin_reset_transactions', superAdminPass, username: 'admin' });

       const { error: delError } = await supabase.from('transactions').delete().neq('id', 0); 
       return !delError;
   }
};
