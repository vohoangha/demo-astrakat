
import { GoogleGenAI } from "@google/genai";
import { MediaType, ArchitectureStyle, ImageQuality, RenderEngine, LightingSetting } from "../types";

// Helper function to get specific prompt details for each graphic design type
const getDesignContext = (type: MediaType): string => {
  switch (type) {
    case MediaType.STANDARD:
      return "General Creative Design. Follow the user's prompt and reference images strictly. Do not impose a specific layout format unless explicitly requested in the prompt. Focus on high-quality visual execution.";
    case MediaType.POSTER:
      return "Design a high-impact Movie or Event Poster. Focus on strong visual hierarchy, bold typography integration, cinematic lighting, and a compelling central composition that tells a story from a distance.";
    case MediaType.KEY_VISUAL:
      return "Create a professional Advertising Key Visual (KV). This should be a highly polished, commercial-grade image suitable for a brand campaign. Focus on product/concept highlight, perfect lighting, and premium detailing.";
    case MediaType.SOCIAL_POST:
      return "Design an engaging Social Media Post. The style should be trendy, scroll-stopping, and visually punchy. Use vibrant colors, clear focal points, and a modern aesthetic optimized for mobile screens (Instagram/TikTok style).";
    case MediaType.WALLPAPER:
      return "Create a stunning digital Wallpaper. Focus on aesthetics, atmosphere, and mood. The composition should be balanced but immersive, with less focus on text and more on artistic texture, landscape, or abstract beauty.";
    case MediaType.COVER_ART:
      return "Design creative Cover Art (Album/Book/Podcast). Use artistic expression, symbolic imagery, and emotive color palettes. The style can be abstract, illustrative, or photographic, but must look like a curated piece of art.";
    case MediaType.BANNER:
      return "Design a Web Banner. Focus on a horizontal layout with balanced negative space for potential text overlay. The imagery should be supportive and contextual rather than overwhelming, suitable for website headers or ad strips.";
    case MediaType.CARD:
      return "Design a Greeting Card or Invitation. The style should be tactile, warm, and inviting. Focus on paper textures, elegant motifs, illustration, or sophisticated minimalism suitable for print.";
    default:
      return "Professional high-quality graphic design asset with excellent composition and lighting.";
  }
};

// Helper to extract clean base64 and mimeType
const parseBase64Image = (dataUrl: string) => {
  if (dataUrl.includes(';base64,')) {
    const [metadata, base64] = dataUrl.split(';base64,');
    const mimeType = metadata.split(':')[1];
    return { mimeType, data: base64 };
  }
  // Fallback for raw base64 or comma separated without type
  const data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  
  // Try to detect mime type from header bytes if possible, otherwise default to png
  let mimeType = 'image/png';
  if (data.charAt(0) === '/') mimeType = 'image/jpeg';
  else if (data.charAt(0) === 'i') mimeType = 'image/png';
  else if (data.charAt(0) === 'U') mimeType = 'image/webp';
  
  return { mimeType, data };
};

// Helper for delay
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper to get ALL available API Keys
const getApiKeys = (): string[] => {
  const keys: string[] = [];

  // Helper to safely get env vars from Vite or Process
  const getEnv = (key: string) => {
    if (typeof import.meta !== 'undefined' && (import.meta as any).env) {
        return (import.meta as any).env[key] || '';
    }
    if (typeof process !== 'undefined' && process.env) {
        return process.env[key] || process.env[key.replace('VITE_', '')] || '';
    }
    return '';
  };

  const k1 = getEnv('VITE_API_KEY');
  const k2 = getEnv('VITE_API_KEY_2');
  const k3 = getEnv('VITE_API_KEY_3');

  if (k1) keys.push(k1.trim());
  if (k2) keys.push(k2.trim());
  if (k3) keys.push(k3.trim());

  return keys;
};

export const generateCreativeAsset = async (
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
  onImageReady?: (url: string, index: number) => void // callback for incremental loading
): Promise<string[]> => {
  
  const apiKeys = getApiKeys();
  if (apiKeys.length === 0) throw new Error("API Key missing. Please check your Vercel Environment Variables (VITE_API_KEY, VITE_API_KEY_2, etc).");
  
  const hasInput = inputImages.length > 0;
  const hasRef = referenceImages.length > 0;

  // --- MODEL & QUALITY SELECTION LOGIC ---
  
  let effectiveQuality = quality;
  
  // RULE: Default to STANDARD (Flash) if AUTO is selected
  // This ensures 2.5 Flash is used for basic generation unless user explicitly picks HD/2K/4K
  if (effectiveQuality === ImageQuality.AUTO) {
      effectiveQuality = ImageQuality.STANDARD;
  }

  // Model Selection
  // gemini-2.5-flash-image: Fast, Standard Quality, Efficient (Standard/Auto)
  // gemini-3-pro-image-preview: High Fidelity, Nano Banana Pro (HD, 2K, 4K)
  let selectedModel = 'gemini-2.5-flash-image'; 
  let apiImageSize: string | undefined = undefined; 
  
  if (effectiveQuality === ImageQuality.STANDARD) {
      selectedModel = 'gemini-2.5-flash-image';
      apiImageSize = undefined; // Flash does not support imageSize
  } else {
      // For HD, 2K, 4K -> Use Nano Banana Pro (Gemini 3 Pro Image)
      selectedModel = 'gemini-3-pro-image-preview';
      
      switch (effectiveQuality) {
          case ImageQuality.HD:
              apiImageSize = '1K'; // 3-Pro min is 1K, covers HD well
              break;
          case ImageQuality.Q2K:
              apiImageSize = '2K';
              break;
          case ImageQuality.Q4K:
              apiImageSize = '4K';
              break;
          default:
              apiImageSize = '1K';
      }
  }

  // Quality Instruction Prompting
  let qualityInstruction = "";
  if (effectiveQuality !== ImageQuality.STANDARD) {
    qualityInstruction = `Resolution Requirement: Render strictly in ${effectiveQuality} resolution. Detailed textures, sharp edges, high fidelity, photorealistic lighting.`;
  }

  // Construct precise instructions based on image availability
  let imageInstruction = "";
  if (hasInput && hasRef) {
    imageInstruction = `
    I have provided ${inputImages.length + referenceImages.length} images.
    - The FIRST ${inputImages.length} image(s) are the INPUT/SUBJECT (geometry, composition, or main product).
    - The NEXT ${referenceImages.length} image(s) are STYLE REFERENCES (colors, materials, lighting, vibe).
    TASK: Transform the INPUT images to match the style of the REFERENCE images.
    `;
  } else if (hasInput) {
    imageInstruction = `
    I have provided ${inputImages.length} image(s) as the INPUT/SUBJECT.
    TASK: Edit, refine, or render these specific input images based on the text prompt.
    `;
  } else if (hasRef) {
    imageInstruction = `
    I have provided ${referenceImages.length} image(s) as STYLE REFERENCES.
    TASK: Create a new design from scratch that strictly mimics the aesthetic/style of these references.
    `;
  }

  let enhancedPrompt = '';
  if (archStyle !== ArchitectureStyle.NONE) {
    // Architecture Render Mode
    // Handle 'Others' by relying on user note instead of applying a specific style string
    const styleGoal = archStyle === ArchitectureStyle.OTHERS 
        ? "custom architectural style based on User Note" 
        : `${archStyle} style`;
    
    const styleDetails = archStyle === ArchitectureStyle.OTHERS
        ? "Follow the User Note strictly for architectural aesthetics"
        : `Apply ${archStyle} aesthetics`;

    // Construct Engine & Lighting Instructions
    let enginePrompt = "";
    if (renderEngine !== RenderEngine.DEFAULT) {
        enginePrompt = `Render Engine Simulation: Mimic the distinct rendering characteristics of ${renderEngine}. Focus on the specific global illumination, material shaders, and camera effects typical of this software.`;
    }

    let lightingPrompt = "";
    if (lighting !== LightingSetting.DEFAULT) {
        lightingPrompt = `Lighting Condition: ${lighting}. Strictly apply this lighting atmosphere to the scene.`;
    }

    enhancedPrompt = `
    Task: Architectural Visualization / Rendering.
    ${imageInstruction}
    Goal: Render a photorealistic ${styleGoal} architectural image.
    Style Details: ${styleDetails}. High-end material texturing, realistic lighting, ray-tracing quality.
    ${enginePrompt}
    ${lightingPrompt}
    User Note: ${prompt}.
    ${qualityInstruction}
    Composition: Ensure the output fits a ${aspectRatio} aspect ratio.
    `;
  } else {
    // Graphic Design Mode (Standard or Specific)
    const designContext = getDesignContext(type);
    
    // We use the original 'quality' prop for the text prompt description to distinguish "Professional Grade" (Auto) vs specific levels
    const qualityDesc = quality === ImageQuality.AUTO ? 'Professional Grade' : effectiveQuality;

    if (type === MediaType.STANDARD) {
        enhancedPrompt = `
        Task: Creative Image Generation / Manipulation.
        ${imageInstruction}
        User Prompt: ${prompt}.
        Direction: ${designContext}
        Quality Requirements: ${qualityDesc}, highly detailed, visually coherent.
        ${qualityInstruction}
        Composition: Ensure the output fits a ${aspectRatio} aspect ratio.
        `;
    } else {
        enhancedPrompt = `
        Task: Creative Graphic Design Generation.
        Format & Type: ${type}.
        ${imageInstruction}
        User Prompt: ${prompt}.
        Design Direction: ${designContext}
        Quality Requirements: ${qualityDesc}, professional composition, highly detailed, visually coherent.
        ${qualityInstruction}
        Composition: Ensure the output fits a ${aspectRatio} aspect ratio perfectly.
        `;
    }
  }

  const parts: any[] = [];

  // Pushing images in strict order: INPUTS first, then REFERENCES
  const allImages = [...inputImages, ...referenceImages];

  allImages.forEach((img) => {
    const { mimeType, data } = parseBase64Image(img);
    parts.push({
      inlineData: {
        data: data,
        mimeType: mimeType, 
      }
    });
  });

  parts.push({ text: enhancedPrompt });

  const safetySettings = [
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
  ];

  // Helper to generate a single image with KEY ROTATION and RETRY logic
  const generateSingleImage = async (index: number): Promise<string> => {
    let keyIndex = 0;
    
    // Outer loop: Try each API key available (Failover Logic)
    while (keyIndex < apiKeys.length) {
        const currentKey = apiKeys[keyIndex];
        const ai = new GoogleGenAI({ apiKey: currentKey });
        
        let attempt = 0;
        // Inner loop: Retry on current key for transient network issues
        const maxRetriesPerKey = 2; 

        while (attempt < maxRetriesPerKey) {
            if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

            try {
                // Construct config conditionally based on model capabilities
                const config: any = {
                    imageConfig: {
                        aspectRatio: aspectRatio,
                    },
                    safetySettings: safetySettings as any,
                };

                // Only add imageSize if NOT using Flash (Flash doesn't support it)
                if (apiImageSize && selectedModel !== 'gemini-2.5-flash-image') {
                    config.imageConfig.imageSize = apiImageSize;
                }

                const response = await ai.models.generateContent({
                    model: selectedModel,
                    contents: { parts: parts },
                    config: config,
                });

                if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
            
                if (response.candidates && response.candidates[0]) {
                    const candidate = response.candidates[0];
                    if (candidate.finishReason === 'SAFETY') {
                        // Safety errors should not rotate keys, as the content is the issue
                        throw new Error("Image generation blocked by Safety Filters. Please try a different prompt.");
                    }
                    if (candidate.content && candidate.content.parts) {
                        for (const part of candidate.content.parts) {
                            if (part.inlineData) {
                                const base64EncodeString: string = part.inlineData.data;
                                const finalUrl = `data:image/png;base64,${base64EncodeString}`;
                                if (onImageReady) onImageReady(finalUrl, index);
                                return finalUrl;
                            }
                        }
                    }
                }
                // If we got a 200 OK but no image
                throw new Error("No image data returned from model.");

            } catch (error: any) {
                if (signal?.aborted || error.name === 'AbortError') throw error;
                if (error.message && error.message.includes('Safety Filters')) throw error;

                // Check for Quota/Overload errors (Failover triggers)
                const isQuotaError = error.status === 429 || (error.message && error.message.includes('429'));
                const isOverloadError = error.status === 503 || error.code === 503 || (error.message && (error.message.includes('503') || error.message.includes('Overloaded')));

                if (isQuotaError || isOverloadError) {
                    // console.warn(`[ASTRA] Key ...${currentKey.slice(-4)} failed (Quota/Overload). Switching to next key...`);
                    // Break inner loop to try next key in outer loop
                    break; 
                }

                // If it's another type of error (like network glitch), retry same key
                if (attempt < maxRetriesPerKey - 1) {
                    await delay(1000 * (attempt + 1));
                    attempt++;
                    continue;
                } else {
                    // After max retries on this key, if it's not a quota error, we might still want to try next key just in case
                    // console.warn(`[ASTRA] Error on key ...${currentKey.slice(-4)}: ${error.message}`);
                    break; // Break inner, go to next key
                }
            }
        }
        
        // Move to next key
        keyIndex++;
    }

    throw new Error("Failed to generate image. All API keys exhausted or servers are busy.");
  };

  // Execute requests in parallel
  const promises = Array.from({ length: count }, (_, i) => generateSingleImage(i));
  return Promise.all(promises);
};

// --- NEW EDIT/INPAINTING FUNCTION ---
export const editCreativeAsset = async (
  originalImageUrl: string,
  maskImageUrl: string | null,
  prompt: string,
  quality: ImageQuality = ImageQuality.AUTO, // Added argument to support quality selection
  signal?: AbortSignal, // Added Signal for Stop
  referenceImages: string[] = [] // Added Reference Images for Editing
): Promise<string> => {
  const keys = getApiKeys();
  const apiKey = keys[0];
  if (!apiKey) throw new Error("API Key missing");

  // --- MODEL & QUALITY SELECTION LOGIC ---
  let effectiveQuality = quality;
  
  // FORCE GEMINI 3 PRO FOR EDITING
  // Flash model is often too weak for complex inpainting. 
  // We default to Pro for all edit tasks.
  let selectedModel = 'gemini-3-pro-image-preview'; 
  
  // Default to 2K (High Quality) even if AUTO is selected to ensure sharpness
  let apiImageSize = '2K'; 
  
  // Map specific qualities if requested
  if (effectiveQuality === ImageQuality.Q4K) {
      apiImageSize = '4K';
  } else if (effectiveQuality === ImageQuality.Q2K) {
      apiImageSize = '2K';
  } else if (effectiveQuality === ImageQuality.HD || effectiveQuality === ImageQuality.STANDARD) {
      apiImageSize = '1K';
  } else {
      // AUTO -> 2K (Upgrade from 1K default to ensure highest quality)
      apiImageSize = '2K';
  }

  const ai = new GoogleGenAI({ apiKey: apiKey });

  const parts: any[] = [];
  
  // 1. Original Image
  const { mimeType: orgMime, data: orgData } = parseBase64Image(originalImageUrl);
  parts.push({
      inlineData: {
          mimeType: orgMime,
          data: orgData
      }
  });

  // 2. Mask Image (If provided) - Passed as a second image
  if (maskImageUrl) {
     const { mimeType: maskMime, data: maskData } = parseBase64Image(maskImageUrl);
     parts.push({
         inlineData: {
             mimeType: maskMime,
             data: maskData
         }
     });
  }

  // 3. Reference Images (If provided) - Passed as subsequent images
  if (referenceImages && referenceImages.length > 0) {
    referenceImages.forEach(refImg => {
        const { mimeType: refMime, data: refData } = parseBase64Image(refImg);
        parts.push({
            inlineData: {
                mimeType: refMime,
                data: refData
            }
        });
    });
  }

  // 4. Prompt & Instructions
  let qualityInstruction = "";
  if (effectiveQuality === ImageQuality.AUTO || effectiveQuality === ImageQuality.Q2K || effectiveQuality === ImageQuality.Q4K) {
    qualityInstruction = `Resolution Requirement: Render in high resolution (2K/4K) strictly. Texture details must be sharp, photorealistic, and match the original image. Zero blur. High fidelity.`;
  }

  let refInstruction = "";
  if (referenceImages && referenceImages.length > 0) {
      refInstruction = `Additional input: ${referenceImages.length} reference image(s) have been provided to guide the style, color, and texture of the edit.`;
  }

  // Explicitly instruct the model about the mask usage
  const textPrompt = `
  Task: Image Editing / Inpainting.
  Input: Original image, Mask image (White=Edit, Black=Protect)${referenceImages.length > 0 ? ', and Reference Images' : ''}.
  Instruction: Edit the white area of the mask in the original image based on this prompt: "${prompt}".
  ${refInstruction}
  ${qualityInstruction}
  Ensure seamless blending and realistic lighting.
  `;
  parts.push({ text: textPrompt });

  try {
      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const config: any = {};
      // 3-Pro model requires imageSize in many cases or defaults safely, but we explicitly set it.
      config.imageConfig = { imageSize: apiImageSize };

      const response = await ai.models.generateContent({
          model: selectedModel,
          contents: { parts: parts },
          config: config
      });

      if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      if (response.candidates && response.candidates[0].content && response.candidates[0].content.parts) {
          for (const part of response.candidates[0].content.parts) {
              if (part.inlineData) {
                  return `data:image/png;base64,${part.inlineData.data}`;
              }
          }
      }
      throw new Error("No edited image returned.");
  } catch (e: any) {
      if (signal?.aborted || e.name === 'AbortError') {
          throw e; // Re-throw abort to be handled by UI
      }
      console.error("Edit Error:", e);
      throw new Error(`Edit failed: ${e.message}`);
  }
};

export const generatePromptFromImage = async (
  images: string[],
  type: MediaType,
  archStyle: ArchitectureStyle = ArchitectureStyle.NONE,
  renderEngine: RenderEngine = RenderEngine.DEFAULT,
  lighting: LightingSetting = LightingSetting.DEFAULT
): Promise<string> => {
  const keys = getApiKeys();
  const apiKey = keys[0]; // Use first key for text tasks
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  const parts: any[] = [];

  images.forEach((img) => {
    const { mimeType, data } = parseBase64Image(img);
    parts.push({
      inlineData: {
        mimeType: mimeType,
        data: data
      }
    });
  });

  let promptRequest = '';

  if (archStyle !== ArchitectureStyle.NONE) {
    const styleText = archStyle === ArchitectureStyle.OTHERS ? "custom" : `"${archStyle}"`;
    let engineText = "";
    if (renderEngine !== RenderEngine.DEFAULT) engineText = `Simulate the rendering style of ${renderEngine}.`;
    
    let lightingText = "";
    if (lighting !== LightingSetting.DEFAULT) lightingText = `The lighting should be ${lighting}.`;

    promptRequest = `
      You are an expert Architectural Consultant. 
      Analyze the provided ${images.length} image(s) as a reference for geometry, layout, or atmosphere.
      The user wants to create a Photorealistic Architectural Render in the ${styleText} style.
      ${engineText}
      ${lightingText}
      Write a precise, professional prompt (approx 40-60 words) describing the scene, materials, lighting, and furniture.
      Return ONLY the prompt text.
    `;
  } else {
    promptRequest = `
      You are a Creative Director. 
      Analyze the provided ${images.length} image(s). 
      The user wants to use these as reference to create a "${type}". 
      Write a creative, detailed, and artistic prompt (approx 40-60 words) that describes how to transform these references.
      Return ONLY the prompt text.
    `;
  }

  parts.push({ text: promptRequest });

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: { parts: parts }
  });

  return response.text || "";
};

export const enhanceUserPrompt = async (
  currentPrompt: string,
  type: MediaType,
  archStyle: ArchitectureStyle,
  renderEngine: RenderEngine = RenderEngine.DEFAULT,
  lighting: LightingSetting = LightingSetting.DEFAULT
): Promise<string> => {
  const keys = getApiKeys();
  const apiKey = keys[0]; // Use first key for text tasks
  if (!apiKey) throw new Error("API Key missing");

  const ai = new GoogleGenAI({ apiKey: apiKey });
  
  let instruction = '';
  if (archStyle !== ArchitectureStyle.NONE) {
    const context = archStyle === ArchitectureStyle.OTHERS ? "architectural render" : `${archStyle} style render`;
    const engineText = renderEngine !== RenderEngine.DEFAULT ? `, rendered in ${renderEngine}` : '';
    const lightingText = lighting !== LightingSetting.DEFAULT ? `, with ${lighting} lighting` : '';

    instruction = `
      You are a specialized Architectural Visualization Prompt Engineer.
      Improve the user's prompt: "${currentPrompt}".
      Context: Creating a ${context}${engineText}${lightingText}.
      Task: Expand the prompt to include details about lighting, materials, and atmosphere. 
      Keep it concise (under 80 words). Output ONLY the improved prompt.
    `;
  } else {
     instruction = `
      You are a Creative Design Prompt Expert.
      Improve the user's prompt: "${currentPrompt}".
      Context: Creating a ${type}.
      Task: Expand the prompt to add professional design keywords, lighting description, and compositional details.
      Keep it concise (under 80 words). Output ONLY the improved prompt.
    `;
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: instruction
  });

  return response.text || currentPrompt;
};
