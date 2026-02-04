
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

const getApiKey = (): string => {
  if (typeof process !== 'undefined' && process.env.API_KEY) return process.env.API_KEY;
  const viteKey = (import.meta as any).env?.VITE_API_KEY;
  if (viteKey && typeof viteKey === 'string') return viteKey;
  return "";
};

// HELPER: Execute Generation with automatic Proxy Fallback
async function safeGenerateContent(ai: GoogleGenAI, params: any) {
    try {
        return await ai.models.generateContent(params);
    } catch (error: any) {
        const msg = error.message || error.toString();
        // Check for specific Referrer Error
        if (msg.includes("generativelanguage.googleapis.com") && msg.includes("referrer")) {
            console.warn("⚠️ Direct Gemini API blocked by browser/extension. Switching to Server Proxy...");
            // Use Proxy
            const proxyRes = await apiService.geminiProxy(params);
            
            // Map raw JSON to a structure that looks enough like GenerateContentResponse
            // The SDK response has getters, but for our usage we mostly access properties
            // We need to ensure we return something that works with the existing code
            // Existing code usually accesses: response.candidates[0].content.parts
            // OR response.text getter.
            
            // Add a mock .text getter if needed, but our code accesses parts directly mostly
            if (!proxyRes.candidates) throw new Error("Proxy response invalid: " + JSON.stringify(proxyRes));
            
            // Mock the .text property if used by helper functions
            if (!proxyRes.text) {
                Object.defineProperty(proxyRes, 'text', {
                    get: function() {
                        try {
                            return this.candidates?.[0]?.content?.parts?.[0]?.text;
                        } catch { return undefined; }
                    }
                });
            }
            return proxyRes;
        }
        throw error;
    }
}

const handleGeminiError = (error: any) => {
    const msg = error.message || error.toString();
    
    // LOGGING FOR ADMIN CONSOLE (Technical Details)
    console.error(`[Gemini API Error]: ${msg}`);

    // SPECIFIC CHECK: The "PC 2" Issue
    // If the error explicitly states that the referrer is the Google API itself, it means the browser
    // or an extension is stripping the original referrer and replacing it.
    if (msg.includes("Requests from referer https://generativelanguage.googleapis.com/ are blocked")) {
        throw new Error("⚠️ Browser Privacy Issue: Your browser is blocking the referrer. Please disable privacy extensions (like 'Referer Control') or use Chrome.");
    }

    // USER FACING MESSAGES (Simple)
    if (msg.includes("API_KEY_HTTP_REFERRER_BLOCKED") || (msg.includes("403") && msg.includes("referer"))) {
        throw new Error("⚠️ Security Check Failed: Please check API Key restrictions in Google Cloud Console. Ensure your domain (e.g. localhost) is allowed.");
    }
    
    if (msg.includes("429") || msg.includes("quota")) {
        throw new Error("⚠️ Too many requests. Please wait a moment.");
    }
    
    if (msg.includes("503") || msg.includes("overloaded")) {
         throw new Error("🐢 AI Server is busy. Retrying usually helps.");
    }
    
    if (msg.toLowerCase().includes("failed to fetch") || msg.toLowerCase().includes("networkerror")) {
         throw new Error("📡 Connection failed. Check your internet.");
    }
    
    // Fallback generic error for users
    throw new Error(`Generation failed: ${msg.substring(0, 50)}...`);
};

// NEW FUNCTION: Lightweight ping to check API health
export async function testGeminiConnection(): Promise<{ latency: number, status: 'ok' | 'error', message?: string }> {
    const start = Date.now();
    try {
        const apiKey = getApiKey();
        let ai: GoogleGenAI;
        
        if (apiKey) {
            ai = new GoogleGenAI({ apiKey });
        } else {
            const win = window as any;
            if (win.aistudio && await win.aistudio.hasSelectedApiKey()) {
                ai = new GoogleGenAI({ apiKey: "AISTUDIO_PROXY" }); 
            } else {
                throw new Error("No API Key found");
            }
        }

        // Use smallest model for fastest ping
        const model = 'gemini-3-flash-preview';
        await safeGenerateContent(ai, { 
            model, 
            contents: { parts: [{ text: "ping" }] }
        });

        const latency = Date.now() - start;
        return { latency, status: 'ok' };
    } catch (e: any) {
        let helpfulMsg = e.message;
        if (e.message.includes("403")) helpfulMsg = "403 Forbidden: API Key Restricted.";
        // Catch the specific PC2 error in diagnostics too
        if (e.message.includes("generativelanguage.googleapis.com")) helpfulMsg = "Referrer Blocked by Browser Extension";
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
  
  const apiKey = getApiKey();
  let ai: GoogleGenAI;
  
  if (apiKey) {
      ai = new GoogleGenAI({ apiKey });
  } else {
      const win = window as any;
      if (win.aistudio && await win.aistudio.hasSelectedApiKey()) {
           ai = new GoogleGenAI({ apiKey: "AISTUDIO_PROXY" }); 
      } else {
          throw new Error("API Key missing. Please Connect Gemini or check configuration.");
      }
  }
  
  let model = 'gemini-2.5-flash-image'; 
  // Upgrade model only for 2K or 4K.
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
          const response = await safeGenerateContent(ai, { model, contents: { parts }, config });
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
    const apiKey = getApiKey();
    let ai: GoogleGenAI;
    if (apiKey) ai = new GoogleGenAI({ apiKey });
    else {
         const win = window as any;
         if (win.aistudio && await win.aistudio.hasSelectedApiKey()) ai = new GoogleGenAI({ apiKey: "AISTUDIO_PROXY" });
         else throw new Error("API Key missing.");
    }

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
    promptText += " IMPORTANT: Return ONLY the prompt content. Do not include any conversational filler like 'Here is the prompt' or 'Based on your request'. Start directly with the description.";
    
    parts.push({ text: promptText });

    try {
        const response = await safeGenerateContent(ai, { model, contents: { parts } });
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
    const apiKey = getApiKey();
    let ai: GoogleGenAI;
    if (apiKey) ai = new GoogleGenAI({ apiKey });
    else {
         const win = window as any;
         if (win.aistudio && await win.aistudio.hasSelectedApiKey()) ai = new GoogleGenAI({ apiKey: "AISTUDIO_PROXY" });
         else throw new Error("API Key missing.");
    }

    const model = 'gemini-3-flash-preview';
    let context = `Task: Enhance this prompt for an AI image generator to create a stunning visual.`;
    context += `\nOriginal Prompt: "${originalPrompt}"`;
    context += `\nContext: Media Type: ${type}, Architecture Style: ${archStyle}.`;
    context += `\nGoal: Make it descriptive, artistic, and detailed. Focus on lighting, composition, texture, and mood. Keep it under 200 words. Return ONLY the enhanced prompt text.`;

    try {
        const response = await safeGenerateContent(ai, { model, contents: context });
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
    const apiKey = getApiKey();
    let ai: GoogleGenAI;
    if (apiKey) ai = new GoogleGenAI({ apiKey });
    else {
         const win = window as any;
         if (win.aistudio && await win.aistudio.hasSelectedApiKey()) ai = new GoogleGenAI({ apiKey: "AISTUDIO_PROXY" });
         else throw new Error("API Key missing.");
    }
    
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
        const response = await safeGenerateContent(ai, { model, contents: { parts }, config });

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
