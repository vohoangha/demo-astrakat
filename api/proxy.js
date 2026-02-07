
// Memory cache for bad keys (Global variable survives warm restarts in Vercel/Node)
const failedKeys = new Set();
let lastFailureReset = Date.now();
const RESET_INTERVAL_MS = 60000; // 60s

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body;
    const { action, endpointType, username, superAdminPass } = payload;

    if (action === 'gemini_proxy') {
        // --- API KEY ROTATION LOGIC (ROBUST SERVER SIDE) ---
        
        // Periodic Reset of Blacklist
        if (Date.now() - lastFailureReset > RESET_INTERVAL_MS) {
             if (failedKeys.size > 0) failedKeys.clear();
             lastFailureReset = Date.now();
        }

        const tempKeyPool = [];
        
        // 1. Base Keys (Support both VITE_ and non-VITE standard)
        if (process.env.API_KEY) tempKeyPool.push(process.env.API_KEY);
        if (process.env.VITE_API_KEY) tempKeyPool.push(process.env.VITE_API_KEY);

        // 2. Rotated Keys - Scan 1 to 100 regardless of gaps
        // IMPORTANT: We explicitly look for VITE_ keys because user defined them in Vercel
        for(let i = 1; i <= 100; i++) {
             // Check VITE_API_KEY_X (Client visible style)
             const k1 = process.env[`VITE_API_KEY_${i}`];
             if(k1 && k1.trim().length > 20) tempKeyPool.push(k1.trim());
             
             // Check API_KEY_X (Server secret style)
             const k2 = process.env[`API_KEY_${i}`];
             if(k2 && k2.trim().length > 20) tempKeyPool.push(k2.trim());
        }

        // Deduplicate (Remove identical keys if defined in both places)
        const keyPool = Array.from(new Set(tempKeyPool));

        if (keyPool.length === 0) return res.status(500).json({ error: "Server API Keys missing. Please check Vercel Env Vars." });

        const { model, contents, config } = payload;
        
        const bodyPayload = {
            contents: contents,
            generationConfig: config
        };

        let refererToUse = req.headers.origin;
        if (!refererToUse) refererToUse = req.headers.referer;
        if (!refererToUse && req.headers.host) {
             const proto = req.headers['x-forwarded-proto'] || 'http'; 
             refererToUse = `${proto}://${req.headers.host}`;
        }
        if (!refererToUse) refererToUse = "http://localhost:3000";

        // SEQUENTIAL EXECUTION LOOP
        let lastError = null;

        for (const apiKey of keyPool) {
            // SMART SKIP: If key is in blacklist, skip immediately
            if (failedKeys.has(apiKey)) continue;

            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            
            try {
                const gRes = await fetch(url, {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Referer': refererToUse 
                    },
                    body: JSON.stringify(bodyPayload)
                });
                
                const data = await gRes.json();
                
                if (gRes.ok) {
                    // Success! 
                    return res.status(200).json(data);
                }
                
                // If Quota Exceeded (429) or Server Overload (503)
                if (gRes.status === 429 || gRes.status === 503) {
                    lastError = { status: gRes.status, message: data.error?.message };
                    // ADD TO BLACKLIST
                    failedKeys.add(apiKey);
                    continue; 
                }
                
                // Other errors (400, 403, etc) -> Stop immediately
                return res.status(gRes.status).json({ error: data.error?.message, details: data });

            } catch (e) {
                // Network error - try next key
                lastError = { status: 502, message: e.message };
                continue;
            }
        }
        
        // If loop finishes without success
        return res.status(lastError?.status || 500).json({ 
            error: lastError?.message || "All API Keys exhausted (Quota limit reached)." 
        });
    }

    const ADMIN_USER = (process.env.ADMIN_USERNAME || process.env.VITE_ADMIN_USERNAME || "").trim();
    const ADMIN_PASS = (process.env.ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || "").trim();
    
    const rawSuperAdmin = process.env.SUPER_ADMIN || process.env.VITE_SUPER_ADMIN || "astra_super_secret";
    const SUPER_ADMIN_SECRET = rawSuperAdmin.trim();

    // --- SERVER SIDE ADMIN LOGIN ---
    if (action === 'login') {
        // Only verify if Env Vars are actually set
        if (ADMIN_USER && ADMIN_PASS) {
            if (payload.username === ADMIN_USER && payload.password === ADMIN_PASS) {
                 return res.status(200).json({
                     username: 'admin', 
                     credits: 9999,
                     avatarUrl: '',
                     role: 'admin',
                     status: 'active',
                     web_access: 'ALL', // Explicitly grant ALL access
                     portal: 'ALL'
                 });
            } else {
                // If creds are set but don't match, return 401 so apiService knows specifically it failed server auth
                // But we must allow fall-through if username isn't 'admin'
                if (payload.username === ADMIN_USER) {
                    return res.status(401).json({ error: 'Invalid Admin Credentials' });
                }
            }
        }
        // If logic reaches here, it means it wasn't the Vercel Admin, so we allow 
        // the request to fall through? No, 'login' action is unique. 
        // If it's not the Vercel Admin, return 404/400 so apiService tries Supabase.
        return res.status(400).json({ error: 'Not Server Admin' }); 
    }

    // --- SESSION CHECK FOR NON-LOGIN ACTIONS ---
    if (action !== 'login') {
        const cookieHeader = req.headers.cookie || '';
        const cookies = Object.fromEntries(
            cookieHeader.split(';').map(c => {
                const [key, ...v] = c.trim().split('=');
                return [key, decodeURIComponent(v.join('='))];
            })
        );

        const sessionCookie = cookies['astra_user_session'];

        if (!sessionCookie) {
            return res.status(401).json({ error: 'Unauthorized' });
        }

        try {
            const sessionUser = JSON.parse(sessionCookie);
            const isAdminAction = action && action.startsWith('admin_');
            const isAdminUser = sessionUser.username === 'admin' || sessionUser.role === 'admin';

            if (!isAdminUser && username) {
                if (username !== sessionUser.username) {
                    return res.status(403).json({ error: 'Forbidden' });
                }
            }

            if (isAdminAction && !isAdminUser) {
                 return res.status(403).json({ error: 'Forbidden' });
            }

            // --- SENSITIVE ACTION ALLOWLIST ---
            const SENSITIVE_ACTIONS = [
                'admin_verify', 
                'admin_top_up', 
                'admin_update_role', 
                'admin_toggle_status', 
                'admin_update_web_access', // Critical: Added access update
                'admin_reset_password', 
                'admin_delete_user', 
                'admin_create_user',
                'admin_create_user_bulk',
                'admin_reset_transactions'
            ];

            if (SENSITIVE_ACTIONS.includes(action)) {
                if (!superAdminPass || superAdminPass !== SUPER_ADMIN_SECRET) {
                    return res.status(403).json({ error: 'Access Denied: Invalid Security Code' });
                }
                // Stop processing and return success. 
                // These actions don't go to Google Script (unless needed later, but usually handled by apiService DB calls)
                // Wait... apiService calls proxyFetch for these to verify pass, THEN calls Supabase. 
                // So checking pass here is the goal.
                return res.status(200).json({ success: true, message: "Authorized" });
            }

        } catch (e) {
            return res.status(401).json({ error: 'Unauthorized Session' });
        }
    }

    const rawMainScript = process.env.ASTRA_DB_URL || process.env.USER_DB || process.env.GOOGLE_APPS_SCRIPT || process.env.GOOGLE_SCRIPT_URL || "";
    const MAIN_SCRIPT_URL = rawMainScript.replace(/['"]/g, "").trim();
    
    const rawStorageScript = process.env.STORAGE_SCRIPT_URL || "";
    const STORAGE_URL = rawStorageScript.replace(/['"]/g, "").trim() || MAIN_SCRIPT_URL;
    
    const rawAppSecret = process.env.APP_SECRET || process.env.VITE_APP_SECRET || "astra_secure_key_2024";
    const APP_SECRET = rawAppSecret.replace(/['"]/g, "").trim();

    if (!APP_SECRET) {
      return res.status(500).json({ error: 'Config Error' });
    }

    let targetUrl;
    if (endpointType === 'storage') {
        if (!STORAGE_URL) return res.status(500).json({ error: 'Storage Config Error' });
        targetUrl = STORAGE_URL;
    } else {
        if (!MAIN_SCRIPT_URL) return res.status(500).json({ error: 'DB Config Error' });
        targetUrl = MAIN_SCRIPT_URL;
    }

    const { superAdminPass: _, ...cleanPayload } = payload;

    const securePayload = {
      ...cleanPayload,
      appSecret: APP_SECRET 
    };

    const googleResponse = await fetch(targetUrl, {
      method: 'POST',
      headers: { "Content-Type": "text/plain" },
      body: JSON.stringify(securePayload),
      redirect: "follow"
    });

    if (!googleResponse.ok) {
        return res.status(502).json({ error: `Upstream Error: ${googleResponse.status}` });
    }

    const textData = await googleResponse.text();
    
    try {
        const jsonData = JSON.parse(textData);
        if (jsonData.error) {
           return res.status(400).json(jsonData);
        }
        return res.status(200).json(jsonData);
    } catch (e) {
        return res.status(200).json({ success: true, raw: textData });
    }

  } catch (error) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
}