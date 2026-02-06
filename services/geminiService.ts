
import { GoogleGenAI } from "@google/genai";
import { MediaType, ArchitectureStyle, ImageQuality, RenderEngine, LightingSetting } from "../types";
import { apiService } from "./apiService";

const getDesignContext = (type: MediaType): string => {
  switch (type) {
    case MediaType.STANDARD: return "General Creative Design. Follow the user's prompt and reference images strictly. Focus on high-quality visual execution.";
    case MediaType.POSTER: return "Modern Professional Poster Design. Focus on bold typography, clear visual hierarchy, modern layout, and eye-catching composition suitable for print or digital marketing.";
    case MediaType.KEY_VISUAL: return "Key Visual. Central marketing imagery, high production value, suitable for branding and campaigns.";
    case MediaType.SOCIAL_POST: return "Social Media Post. Square or portrait format, engaging, optimized for mobile viewing, viral potential.";
    case MediaType.WALLPAPER: return "Wallpaper. High resolution, aesthetic, balanced composition suitable for backgrounds.";
    case MediaType.COVER_ART: return "Cover Art. Artistic, thematic, suitable for albums, books, or playlists.";
    case MediaType.BANNER: return "Web Banner. Wide aspect ratio, clear messaging, space for text overlay.";
    case MediaType.CARD: return "Greeting Card. Warm, personal, decorative elements, suitable for printing.";
    default: return "Professional high-quality graphic design asset with excellent composition and lighting.";
  }
};

const getEngineCharacteristics = (engine: RenderEngine) => {
    if (engine === RenderEngine.DEFAULT) return "";
    return ` Render style mimicking ${engine}.`;
};

const getLightingDescription = (lighting: LightingSetting) => {
    if (lighting === LightingSetting.DEFAULT) return "";
    return ` Lighting setting: ${lighting}.`;
};

const parseBase64Image = (dataUrl: string) => {
  if (dataUrl.includes(';base64,')) {
    const [metadata, base64] = dataUrl.split(';base64,');
    const mimeType = metadata.split(':')[1];
    return { mimeType, data: base64 };
  }
  const data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  let mimeType = 'image/png';
  if (data.charAt(0) === '/') mimeType = 'image/jpeg';
  else if (data.charAt(0) === 'i') mimeType = 'image/png';
  else if (data.charAt(0) === 'U') mimeType = 'image/webp';
  return { mimeType, data };
};

const resizeBase64Image = (base64Str: string, maxDimension: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.src = base64Str;
        img.onload = () => {
            let width = img.width;
            let height = img.height;
            
            if (width > maxDimension || height > maxDimension) {
                if (width > height) {
                    height = Math.round(height * (maxDimension / width));
                    width = maxDimension;
                } else {
                    width = Math.round(width * (maxDimension / height));
                    height = maxDimension;
                }
            } else {
                resolve(base64Str);
                return;
            }

            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                reject(new Error("Failed to get canvas context for resizing"));
                return;
            }
            
            ctx.drawImage(img, 0, 0, width, height);
            
            resolve(canvas.toDataURL('image/png', 1.0));
        };
        img.onerror = (e) => reject(e);
    });
};

// --- PRIORITY API KEY ROTATION LOGIC (ROBUST SCANNER) ---
let keyPool: string[] = [];
let isPoolInitialized = false;

// SMART SKIP: Memory of failed keys to avoid retrying them immediately
const failedKeys = new Set<string>();
let lastFailureReset = Date.now();
const RESET_INTERVAL_MS = 60000; // 60 Seconds (Gemini quota resets every minute)

const initKeyPool = () => {
    if (isPoolInitialized) return;
    
    // 1. Get Environment Object
    const env = (import.meta as any).env || {};
    const tempPool: string[] = [];
    
    // 2. Add Base Keys (Priority #1)
    if (env.VITE_API_KEY) tempPool.push(env.VITE_API_KEY);
    if (typeof process !== 'undefined' && process.env.API_KEY) tempPool.push(process.env.API_KEY);

    // 3. Scan for Rotated Keys (1 to 100) - Support Gaps (e.g., 1, 3, 50)
    for (let i = 1; i <= 100; i++) {
        const keyName = `VITE_API_KEY_${i}`;
        const val = env[keyName];
        
        // Strict validation: Must be string, longer than 20 chars (Gemini keys are ~39 chars)
        if (val && typeof val === 'string' && val.trim().length > 20) {
            tempPool.push(val.trim());
        }
    }

    // 4. Deduplicate & Clean (Preserve Order)
    keyPool = Array.from(new Set(tempPool)); // Set removes duplicates automatically
    isPoolInitialized = true;

    if (keyPool.length > 0) {
        console.log(`[ASTRA System] Loaded ${keyPool.length} unique API Keys (Scanned 1-100).`);
    } else {
        console.warn("[ASTRA System] No 'VITE_' API Keys found. Will fallback to Server Proxy.");
    }
};

async function safeGenerateContent(params: any) {
    initKeyPool();

    // Reset failed keys list if enough time has passed
    if (Date.now() - lastFailureReset > RESET_INTERVAL_MS) {
        if (failedKeys.size > 0) {
            console.log(`[ASTRA Rotation] Resetting ${failedKeys.size} blacklisted keys (Quota Refresh).`);
            failedKeys.clear();
        }
        lastFailureReset = Date.now();
    }

    // FALLBACK STRATEGY: 
    // If no Client keys (VITE_...) are found, immediately attempt Server Proxy.
    // This supports Vercel Environments where users only define 'API_KEY_X' (Secure/Server-side).
    if (keyPool.length === 0) {
        const win = window as any;
        // 1. Try AI Studio (Dev/Iframe)
        if (win.aistudio && await win.aistudio.hasSelectedApiKey()) {
             const ai = new GoogleGenAI({ apiKey: "AISTUDIO_PROXY" });
             return await ai.models.generateContent(params);
        }
        
        // 2. Try Server Proxy (Vercel)
        console.log("[ASTRA] No Client Keys. Switching to Server Proxy...");
        try {
            const proxyRes = await apiService.geminiProxy(params);
            
            // Normalize Proxy Response to match GoogleGenAI SDK format
            if (!proxyRes.text) {
                Object.defineProperty(proxyRes, 'text', {
                    get: function() {
                        try { return this.candidates?.[0]?.content?.parts?.[0]?.text; } catch { return undefined; }
                    }
                });
            }
            return proxyRes;
        } catch (e: any) {
            throw new Error("No API Keys found on Client or Server. Please configure Vercel Environment Variables.");
        }
    }

    let lastError: any = null;
    let attemptedCount = 0;

    // SEQUENTIAL LOOP with SMART SKIP (Client Side)
    for (let i = 0; i < keyPool.length; i++) {
        const apiKey = keyPool[i];

        // SMART SKIP: If key failed recently, skip it instantly (0 latency)
        if (failedKeys.has(apiKey)) {
            continue;
        }
        
        try {
            attemptedCount++;
            const ai = new GoogleGenAI({ apiKey });
            return await ai.models.generateContent(params);
        } catch (error: any) {
            lastError = error;
            const msg = (error.message || error.toString()).toLowerCase();
            
            // Critical Browser Privacy Issue -> Try Server Proxy immediately
            if (msg.includes("generativelanguage.googleapis.com") && (msg.includes("referer") || msg.includes("referrer"))) {
                console.warn("Switching to Server Proxy due to Referrer Policy...");
                const proxyRes = await apiService.geminiProxy(params);
                
                if (!proxyRes.candidates && !proxyRes.text) throw new Error("Proxy response invalid: " + JSON.stringify(proxyRes));
                
                if (!proxyRes.text) {
                    Object.defineProperty(proxyRes, 'text', {
                        get: function() {
                            try { return this.candidates?.[0]?.content?.parts?.[0]?.text; } catch { return undefined; }
                        }
                    });
                }
                return proxyRes;
            }

            // Handle Invalid API Key (400) - Treat as "Dead Key" and skip
            if (msg.includes("api key not valid") || msg.includes("api_key_invalid")) {
                 console.warn(`[ASTRA Rotation] Key #${i + 1} is Invalid/Expired. Skipping.`);
                 failedKeys.add(apiKey);
                 continue;
            }

            // Retryable Errors (Quota, Overloaded)
            if (msg.includes("429") || msg.includes("quota") || msg.includes("503") || msg.includes("overloaded")) {
                console.warn(`[ASTRA Rotation] Key #${i + 1} failed (${msg}). Marking as dead for 60s.`);
                
                // ADD TO BLACKLIST
                failedKeys.add(apiKey);
                
                continue; // Try next key immediately
            }

            // Non-retryable error (e.g., Invalid Argument, 400) -> Throw immediately
            throw error;
        }
    }
    
    // If all Client keys fail, TRY SERVER PROXY as a last resort
    // (Maybe the server has extra keys that the client doesn't know about)
    console.warn("[ASTRA] All Client keys exhausted. Attempting Server Proxy as last resort...");
    try {
        const proxyRes = await apiService.geminiProxy(params);
        if (!proxyRes.text) {
             Object.defineProperty(proxyRes, 'text', {
                get: function() { try { return this.candidates?.[0]?.content?.parts?.[0]?.text; } catch { return undefined; } }
             });
        }
        return proxyRes;
    } catch (e) {
        throw lastError || new Error(`All ${keyPool.length} client keys exhausted and Server Proxy failed.`);
    }
}

const handleGeminiError = (error: any) => {
    const msg = error.message || error.toString();
    const lowerMsg = msg.toLowerCase();
    
    console.error(`[Gemini API Error]: ${msg}`);

    if (lowerMsg.includes("generativelanguage.googleapis.com") && (lowerMsg.includes("referer") || lowerMsg.includes("referrer"))) {
        throw new Error("⚠️ Browser Privacy Issue: Your browser is blocking the referrer. Please disable privacy extensions or try a different browser.");
    }

    if (msg.includes("API_KEY_HTTP_REFERRER_BLOCKED") || (msg.includes("403") && lowerMsg.includes("referer"))) {
        throw new Error("⚠️ Security Check Failed: API Key restrictions prevent this request.");
    }
    
    if (msg.includes("429") || msg.includes("quota")) {
        throw new Error("⚠️ System Busy: All API keys are currently exhausted. Please try again in a minute.");
    }
    
    if (msg.includes("503") || msg.includes("overloaded")) {
         throw new Error("🐢 AI Server is busy. Retrying usually helps.");
    }
    
    if (lowerMsg.includes("failed to fetch") || lowerMsg.includes("networkerror")) {
         throw new Error("📡 Connection failed. Check your internet.");
    }
    
    throw new Error(`Generation failed: ${msg.substring(0, 50)}...`);
};

export async function testGeminiConnection(): Promise<{ latency: number, status: 'ok' | 'error', message?: string }> {
    const start = Date.now();
    try {
        const model = 'gemini-3-flash-preview';
        await safeGenerateContent({ 
            model, 
            contents: { parts: [{ text: "ping" }] }
        });

        const latency = Date.now() - start;
        return { latency, status: 'ok' };
    } catch (e: any) {
        let helpfulMsg = e.message;
        const lowerMsg = helpfulMsg.toLowerCase();
        
        if (lowerMsg.includes("403")) helpfulMsg = "403 Forbidden: API Key Restricted.";
        if (lowerMsg.includes("generativelanguage.googleapis.com") && (lowerMsg.includes("referer") || lowerMsg.includes("referrer"))) {
             helpfulMsg = "Referrer Blocked (Proxy Failed)";
        }
        if (lowerMsg.includes("api key not valid")) helpfulMsg = "Invalid API Key (Check .env)";
        
        return { latency: 0, status: 'error', message: helpfulMsg };
    }
}

export async function generateCreativeAsset(
  prompt: string, 
  type: MediaType,
  aspectRatio: string,
  count: number = 1,
  inputImages: string[] = [], 
  referenceImages: string[] = [], 
  archStyle: ArchitectureStyle = ArchitectureStyle.NONE,
  quality: ImageQuality = ImageQuality.AUTO,
  renderEngine: RenderEngine = RenderEngine.DEFAULT,
  lighting: LightingSetting = LightingSetting.DEFAULT,
  signal?: AbortSignal,
  onImageReady?: (url: string, index: number) => void
): Promise<string[]> {
  
  let model = 'gemini-2.5-flash-image'; 
  if (quality === ImageQuality.Q2K || quality === ImageQuality.Q4K) {
      model = 'gemini-3-pro-image-preview';
  }

  let fullPrompt = `${getDesignContext(type)} ${prompt}`;
  if (archStyle !== ArchitectureStyle.NONE) fullPrompt += ` Architecture Style: ${archStyle}.`;
  fullPrompt += getEngineCharacteristics(renderEngine);
  fullPrompt += getLightingDescription(lighting);
  
  if (inputImages.length > 0) fullPrompt += " Use the first provided image as the primary composition/structure reference (Input Image).";
  if (referenceImages.length > 0) fullPrompt += " Use the subsequent images as style references.";

  const parts: any[] = [];
  for (const img of inputImages) {
      const { mimeType, data } = parseBase64Image(img);
      parts.push({ inlineData: { mimeType, data } });
  }
  for (const img of referenceImages) {
      const { mimeType, data } = parseBase64Image(img);
      parts.push({ inlineData: { mimeType, data } });
  }
  parts.push({ text: fullPrompt });

  const config: any = { imageConfig: { aspectRatio: aspectRatio || "1:1" } };
  
  if (model === 'gemini-3-pro-image-preview') {
      let size = '1K';
      if (quality === ImageQuality.Q2K) size = '2K';
      if (quality === ImageQuality.Q4K) size = '4K';
      config.imageConfig.imageSize = size;
  }

  const generatedUrls: string[] = [];

  for (let i = 0; i < count; i++) {
      if (signal?.aborted) break;
      try {
          const response = await safeGenerateContent({ model, contents: { parts }, config });
          let foundImage = false;
          if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
              for (const part of response.candidates[0].content.parts) {
                  if (part.inlineData) {
                      const base64 = part.inlineData.data;
                      const mime = part.inlineData.mimeType || 'image/png';
                      const url = `data:${mime};base64,${base64}`;
                      generatedUrls.push(url);
                      if (onImageReady) onImageReady(url, i);
                      foundImage = true;
                      break; 
                  }
              }
          }
          if (!foundImage) console.warn("No image in response", response);
      } catch (e) {
          handleGeminiError(e);
      }
  }
  
  if (generatedUrls.length === 0) throw new Error("Failed to generate any images.");
  return generatedUrls;
}

export async function generatePromptFromImage(
    images: string[], 
    type: MediaType, 
    archStyle: ArchitectureStyle = ArchitectureStyle.NONE,
    renderEngine: RenderEngine = RenderEngine.DEFAULT,
    lighting: LightingSetting = LightingSetting.DEFAULT
): Promise<string> {
    const model = 'gemini-3-flash-preview';
    const parts: any[] = [];
    for (const img of images) {
        const { mimeType, data } = parseBase64Image(img);
        parts.push({ inlineData: { mimeType, data } });
    }
    
    let promptText = "Analyze these images and create a detailed creative prompt to generate a similar design.";
    if (type !== MediaType.NONE) promptText += ` The target media type is ${type}.`;
    if (archStyle !== ArchitectureStyle.NONE) promptText += ` The architecture style is ${archStyle}.`;
    promptText += " Describe the subject, composition, colors, typography, lighting, materials, and mood in detail.";
    promptText += " IMPORTANT: Return ONLY the prompt content. Do not include any conversational filler.";
    
    parts.push({ text: promptText });

    try {
        const response = await safeGenerateContent({ model, contents: { parts } });
        let text = response.text || "";
        text = text.replace(/^Here is a .*? prompt:?\s*/i, "");
        text = text.replace(/^Based on .*?:\s*/i, "");
        text = text.replace(/^\*\*Prompt:\*\*\s*/i, "");
        return text.trim();
    } catch (e) {
        handleGeminiError(e);
        return "";
    }
}

export async function enhanceUserPrompt(
    originalPrompt: string, 
    type: MediaType, 
    archStyle: ArchitectureStyle = ArchitectureStyle.NONE,
    renderEngine: RenderEngine = RenderEngine.DEFAULT,
    lighting: LightingSetting = LightingSetting.DEFAULT
): Promise<string> {
    const model = 'gemini-3-flash-preview';
    let context = `Task: Enhance this prompt for an AI image generator to create a stunning visual.`;
    context += `\nOriginal Prompt: "${originalPrompt}"`;
    context += `\nContext: Media Type: ${type}, Architecture Style: ${archStyle}.`;
    context += `\nGoal: Make it descriptive, artistic, and detailed. Focus on lighting, composition, texture, and mood. Keep it under 200 words. Return ONLY the enhanced prompt text.`;

    try {
        const response = await safeGenerateContent({ model, contents: context });
        return response.text || originalPrompt;
    } catch (e) {
        handleGeminiError(e);
        return originalPrompt;
    }
}

export async function editCreativeAsset(
    baseImageUrl: string,
    maskBase64: string,
    prompt: string,
    quality: ImageQuality,
    signal?: AbortSignal,
    referenceImages: string[] = []
): Promise<string> {
    const model = 'gemini-3-pro-image-preview';
    const MAX_EDIT_RESOLUTION = 2048; 

    const resizedBase = await resizeBase64Image(baseImageUrl, MAX_EDIT_RESOLUTION);
    const resizedMask = maskBase64 ? await resizeBase64Image(maskBase64, MAX_EDIT_RESOLUTION) : "";

    const parts: any[] = [];
    const baseObj = parseBase64Image(resizedBase);
    parts.push({ inlineData: { mimeType: baseObj.mimeType, data: baseObj.data } });

    if (resizedMask) {
         const maskObj = parseBase64Image(resizedMask);
         parts.push({ inlineData: { mimeType: maskObj.mimeType, data: maskObj.data } });
    }

    for (const ref of referenceImages) {
        const refObj = parseBase64Image(ref);
        parts.push({ inlineData: { mimeType: refObj.mimeType, data: refObj.data } });
    }

    let textPrompt = `Edit the first image based on this instruction: ${prompt}.`;
    if (maskBase64) {
        textPrompt += " Use the second image (black and white mask) to identify the specific area to edit (white area is the active selection). Only modify the masked area while maintaining visual consistency with the rest of the image.";
    }
    parts.push({ text: textPrompt });

    const config: any = { 
        imageConfig: {
            imageSize: "2K" 
        } 
    };

    try {
        const response = await safeGenerateContent({ model, contents: { parts }, config });

        if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
            for (const part of response.candidates[0].content.parts) {
                if (part.inlineData) {
                    const base64 = part.inlineData.data;
                    const mime = part.inlineData.mimeType || 'image/png';
                    return `data:${mime};base64,${base64}`;
                }
            }
        }
        throw new Error("Editing failed to produce an image.");
    } catch (e) {
        handleGeminiError(e);
        throw e;
    }
}
