
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const payload = req.body;
    const { action, endpointType, username, superAdminPass } = payload;

    // --- GEMINI PROXY HANDLER (Fix for blocked Referrers) ---
    if (action === 'gemini_proxy') {
        const apiKey = process.env.API_KEY || process.env.VITE_API_KEY;
        if (!apiKey) return res.status(500).json({ error: "Server API Key missing" });

        const { model, contents, config } = payload;
        
        // Map SDK config to REST API generationConfig
        // The SDK uses 'config', REST API expects 'generationConfig'
        const bodyPayload = {
            contents: contents,
            generationConfig: config
        };

        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        
        // Fix for "referer <empty> blocked":
        // We must explicitly send a Referer header that matches the API Key's allowed domain list.
        // We prioritize the Origin header from the client request.
        let refererToUse = req.headers.origin;
        
        // Fallback to Referer header if Origin is missing
        if (!refererToUse) refererToUse = req.headers.referer;
        
        // Fallback to Host header construction if both are missing (e.g., server-to-server or stripped)
        if (!refererToUse && req.headers.host) {
             const proto = req.headers['x-forwarded-proto'] || 'http'; 
             refererToUse = `${proto}://${req.headers.host}`;
        }
        
        // Ultimate fallback for local dev if nothing else works
        if (!refererToUse) refererToUse = "http://localhost:3000";

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
            
            if (!gRes.ok) {
                // Pass through the Gemini error
                const errMsg = data.error?.message || `Gemini API Error: ${gRes.status}`;
                return res.status(gRes.status).json({ error: errMsg, details: data });
            }
            
            return res.status(200).json(data);
        } catch (e) {
            return res.status(500).json({ error: "Proxy Fetch Failed: " + e.message });
        }
    }
    // --------------------------------------------------------

    const ADMIN_USER = (process.env.ADMIN_USERNAME || process.env.VITE_ADMIN_USERNAME || "").trim();
    const ADMIN_PASS = (process.env.ADMIN_PASSWORD || process.env.VITE_ADMIN_PASSWORD || "").trim();
    
    const rawSuperAdmin = process.env.SUPER_ADMIN || process.env.VITE_SUPER_ADMIN || "astra_super_secret";
    const SUPER_ADMIN_SECRET = rawSuperAdmin.trim();

    if (action === 'login' && ADMIN_USER && ADMIN_PASS) {
        if (payload.username === ADMIN_USER && payload.password === ADMIN_PASS) {
             return res.status(200).json({
                 username: 'admin', 
                 credits: 9999,
                 avatarUrl: '',
                 role: 'admin',
                 status: 'active'
             });
        }
    }

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

            const SENSITIVE_ACTIONS = [
                'admin_top_up', 
                'admin_update_role', 
                'admin_toggle_status', 
                'admin_reset_password', 
                'admin_delete_user', 
                'admin_create_user',
                'admin_create_user_bulk',
                'admin_reset_transactions'
            ];

            if (SENSITIVE_ACTIONS.includes(action)) {
                if (!superAdminPass || superAdminPass !== SUPER_ADMIN_SECRET) {
                    return res.status(403).json({ error: 'Access Denied' });
                }
                return res.status(200).json({ success: true, message: "Authorized" });
            }

        } catch (e) {
            return res.status(401).json({ error: 'Unauthorized' });
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
