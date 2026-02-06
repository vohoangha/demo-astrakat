
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GlassCard } from '../components/GlassCard';
import { Button } from '../components/Button';
import { UserProfile } from '../components/UserProfile';
import { FullScreenViewer } from '../components/FullScreenViewer';
import { MediaType, ASPECT_RATIOS, GeneratedImage, ArchitectureStyle, ImageQuality, RenderEngine, LightingSetting, User } from '../types';
import { generateCreativeAsset, generatePromptFromImage, enhanceUserPrompt, editCreativeAsset } from '../services/geminiService';
import { apiService } from '../services/apiService';
import { saveUserToCookie } from '../utils/storage';
import { calculateGenerationCost } from '../utils/pricing';
import { db } from '../services/firebaseConfig';
import { ref, onValue, set, onDisconnect, remove, serverTimestamp } from "firebase/database";
import { 
  Wand2, Download, Image as ImageIcon, Sparkles, LayoutTemplate, MonitorPlay, Instagram,
  ChevronDown, Smartphone, Disc, CreditCard, RectangleHorizontal, Plus, X, Key,
  Palette, Building2, BoxSelect, Ratio, Layers, History as HistoryIcon, Trash2,
  Cpu, Sun, ChevronRight, CopyPlus, Edit3, Maximize
} from 'lucide-react';

const ARCH_STYLE_GROUPS = {
  "Modern": [
    ArchitectureStyle.BAUHAUS, ArchitectureStyle.JAPANDI, ArchitectureStyle.LUXURY,
    ArchitectureStyle.MID_CENTURY, ArchitectureStyle.MINIMALIST, ArchitectureStyle.MODERN,
    ArchitectureStyle.SCANDINAVIAN, ArchitectureStyle.WABI_SABI
  ],
  "Classic": [
    ArchitectureStyle.ART_DECO, ArchitectureStyle.INDOCHINE, ArchitectureStyle.MEDITERRANEAN,
    ArchitectureStyle.MOROCCAN, ArchitectureStyle.NEOCLASSIC, ArchitectureStyle.VICTORIAN
  ],
  "Rustic & Nature": [
    ArchitectureStyle.BRUTALIST, ArchitectureStyle.COTTAGECORE, ArchitectureStyle.FARMHOUSE,
    ArchitectureStyle.FRAME_HOUSE, ArchitectureStyle.TROPICAL
  ],
  "Industrial & Future": [
    ArchitectureStyle.CYBERPUNK, ArchitectureStyle.FUTURISTIC, ArchitectureStyle.INDUSTRIAL
  ]
};

const ENGINE_GROUPS = {
  "Interior": [
    RenderEngine.BLENDER, RenderEngine.CORONA, RenderEngine.MAXWELL,
    RenderEngine.OCTANE, RenderEngine.REDSHIFT, RenderEngine.VRAY
  ],
  "Architecture": [
    RenderEngine.D5, RenderEngine.ENSCAPE, RenderEngine.LUMION,
    RenderEngine.MARMOSET, RenderEngine.TWINMOTION, RenderEngine.UNREAL
  ]
};

const LIGHTING_GROUPS = {
  "Time of Day": [
    LightingSetting.BLUE_HOUR, LightingSetting.GOLDEN_HOUR, LightingSetting.NIGHT,
    LightingSetting.NOON, LightingSetting.SUNNY_DAY, LightingSetting.SUNRISE
  ],
  "Weather & Environment": [
    LightingSetting.FOGGY, LightingSetting.OVERCAST, LightingSetting.RAINY, LightingSetting.SNOWY
  ],
  "Artificial & Indoor": [
    LightingSetting.NEON, LightingSetting.STUDIO, LightingSetting.WARM_INTERIOR
  ],
  "Mood & Artistic": [
    LightingSetting.BIOLUMINESCENT, LightingSetting.CINEMATIC, LightingSetting.MOODY
  ]
};

interface OnlinePresenceBeaconProps {
    user: User;
}

// Logic-only component to register user presence in Firebase
const OnlinePresenceBeacon: React.FC<OnlinePresenceBeaconProps> = ({ user }) => {
    useEffect(() => {
        if (!user || !user.username) return;

        // Clean username for firebase key path (remove special chars)
        const safeKey = user.username.replace(/[.#$/[\]]/g, '_');
        
        // Define references
        const userStatusRef = ref(db, `online_users/${safeKey}`);

        // Set user as online
        set(userStatusRef, {
            username: user.username,
            team: user.team || 'Unknown',
            avatar: user.avatarUrl || '',
            last_seen: serverTimestamp(),
            state: 'online'
        }).then(() => {
            // Configure automatic removal on disconnect (tab close/internet loss)
            onDisconnect(userStatusRef).remove();
        }).catch((err) => {
            console.error("Firebase connection error:", err);
        });

        // Cleanup on component unmount
        return () => {
            remove(userStatusRef); // Explicitly remove if user navigates away within app
        };
    }, [user]);

    return null; // Invisible component
};

interface DashboardProps {
  user: User;
  onSignOut: () => void;
  onPasswordChange: (newToken: string) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, onSignOut, onPasswordChange }) => {
  const [prompt, setPrompt] = useState('');
  const [currentUser, setCurrentUser] = useState<User>(user);

  const [selectedType, setSelectedType] = useState<MediaType>(MediaType.NONE);
  const [selectedArchStyle, setSelectedArchStyle] = useState<ArchitectureStyle>(ArchitectureStyle.NONE);
  const [selectedRenderEngine, setSelectedRenderEngine] = useState<RenderEngine>(RenderEngine.DEFAULT);
  const [selectedLighting, setSelectedLighting] = useState<LightingSetting>(LightingSetting.DEFAULT);
  
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>(''); 
  const [imageCount, setImageCount] = useState<number>(0);
  const [selectedQuality, setSelectedQuality] = useState<ImageQuality>(ImageQuality.AUTO);
  const [isQualitySet, setIsQualitySet] = useState(false); 

  const [isRatioAuto, setIsRatioAuto] = useState(false);
  const [isCountAuto, setIsCountAuto] = useState(false);
  const [isQualityAuto, setIsQualityAuto] = useState(false);
  
  const [generatedImages, setGeneratedImages] = useState<(string | null)[]>([]);
  const [isLastGenEdit, setIsLastGenEdit] = useState(false);

  const [inputImages, setInputImages] = useState<string[]>([]); 
  const [referenceImages, setReferenceImages] = useState<string[]>([]); 

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0); 
  const [isAutoPrompting, setIsAutoPrompting] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasApiKey, setHasApiKey] = useState(false); 
  const [history, setHistory] = useState<GeneratedImage[]>([]);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewSource, setPreviewSource] = useState<'input' | 'ref' | 'generated' | null>(null);
  const [securityTampered, setSecurityTampered] = useState(false); 

  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const archDropdownRef = useRef<HTMLDivElement>(null);
  const ratioDropdownRef = useRef<HTMLDivElement>(null);
  const countDropdownRef = useRef<HTMLDivElement>(null);
  const qualityDropdownRef = useRef<HTMLDivElement>(null);
  const renderEngineDropdownRef = useRef<HTMLDivElement>(null);
  const lightingDropdownRef = useRef<HTMLDivElement>(null);
  const inputInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isArchDropdownOpen, setIsArchDropdownOpen] = useState(false);
  const [isRatioDropdownOpen, setIsRatioDropdownOpen] = useState(false);
  const [isCountDropdownOpen, setIsCountDropdownOpen] = useState(false);
  const [isQualityDropdownOpen, setIsQualityDropdownOpen] = useState(false);
  const [isRenderEngineDropdownOpen, setIsRenderEngineDropdownOpen] = useState(false);
  const [isLightingDropdownOpen, setIsLightingDropdownOpen] = useState(false);

  const [lockedRenderCategory, setLockedRenderCategory] = useState<string | null>(null);
  const [lockedLightingCategory, setLockedLightingCategory] = useState<string | null>(null);
  const [lockedArchCategory, setLockedArchCategory] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [draggingItem, setDraggingItem] = useState<any | null>(null);

  useEffect(() => { setCurrentUser(user); }, [user]);
  useEffect(() => { if (!isRenderEngineDropdownOpen) setLockedRenderCategory(null); }, [isRenderEngineDropdownOpen]);
  useEffect(() => { if (!isLightingDropdownOpen) setLockedLightingCategory(null); }, [isLightingDropdownOpen]);
  useEffect(() => { if (!isArchDropdownOpen) setLockedArchCategory(null); }, [isArchDropdownOpen]);

  const estimatedCost = useMemo(() => {
    return calculateGenerationCost({
      quality: selectedQuality,
      imageCount: imageCount || 1, 
      isEdit: false
    });
  }, [selectedQuality, imageCount]);

  useEffect(() => {
    const checkSecurity = () => {
      const securityScript = document.getElementById('x-security-core');
      if (!securityScript) setSecurityTampered(true); 
    };
    checkSecurity();
  }, []);

  const detectDevTools = () => {
      const threshold = 160;
      if (
          window.outerWidth - window.innerWidth > threshold || 
          window.outerHeight - window.innerHeight > threshold
      ) {
          return true;
      }
      return false;
  };

  const punishDevTools = () => {
      document.body.innerHTML = '';
      document.body.style.backgroundColor = 'black';
      setTimeout(() => window.location.reload(), 2000);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) setIsTypeDropdownOpen(false);
      if (archDropdownRef.current && !archDropdownRef.current.contains(event.target as Node)) setIsArchDropdownOpen(false);
      if (ratioDropdownRef.current && !ratioDropdownRef.current.contains(event.target as Node)) setIsRatioDropdownOpen(false);
      if (countDropdownRef.current && !countDropdownRef.current.contains(event.target as Node)) setIsCountDropdownOpen(false);
      if (qualityDropdownRef.current && !qualityDropdownRef.current.contains(event.target as Node)) setIsQualityDropdownOpen(false);
      if (renderEngineDropdownRef.current && !renderEngineDropdownRef.current.contains(event.target as Node)) setIsRenderEngineDropdownOpen(false);
      if (lightingDropdownRef.current && !lightingDropdownRef.current.contains(event.target as Node)) setIsLightingDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => { checkApiKey(); }, []);

   useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (loading) {
      setProgress(0);
      const startTime = Date.now();
      const estimatedDuration = 12000; 
      interval = setInterval(() => {
        const elapsedTime = Date.now() - startTime;
        let newProgress = (elapsedTime / estimatedDuration) * 100;
        if (newProgress > 98) {
           newProgress = 98 + (1 - 1 / (1 + (elapsedTime - estimatedDuration) / 1000));
           if (newProgress > 99) newProgress = 99;
        }
        setProgress(newProgress);
      }, 200); 
    } else {
      setProgress(100);
      const timeout = setTimeout(() => setProgress(0), 500);
      return () => clearTimeout(timeout);
    }
    return () => clearInterval(interval);
  }, [loading]);

    useEffect(() => {
    const hasInput = inputImages.length > 0;
    const hasRef = referenceImages.length > 0;
    const hasImages = hasInput || hasRef;

    if (hasImages) {
      if (hasInput && (!selectedAspectRatio || isRatioAuto)) {
         const img = new Image();
         img.src = inputImages[inputImages.length - 1];
         img.onload = () => {
           const ratio = img.width / img.height;
           let bestMatch = '1:1';
           if (ratio > 1.5) bestMatch = '16:9';
           else if (ratio > 1.1) bestMatch = '4:3';
           else if (ratio > 0.9) bestMatch = '1:1';
           else if (ratio > 0.65) bestMatch = '3:4';
           else bestMatch = '9:16';
           setSelectedAspectRatio((prev) => (!prev || isRatioAuto) ? bestMatch : prev);
           setIsRatioAuto((prev) => (!selectedAspectRatio || isRatioAuto) ? true : prev);
         };
      }
      if (imageCount === 0) { setImageCount(1); setIsCountAuto(true); }
      if (!isQualitySet) { setSelectedQuality(ImageQuality.AUTO); setIsQualitySet(true); setIsQualityAuto(true); }
    } else {
      if (isRatioAuto) { setSelectedAspectRatio(''); setIsRatioAuto(false); }
      if (isCountAuto) { setImageCount(0); setIsCountAuto(false); }
      if (isQualityAuto) { setIsQualitySet(false); setSelectedQuality(ImageQuality.AUTO); setIsQualityAuto(false); }
    }
  }, [inputImages, referenceImages]);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (!e.clipboardData) return;
      const items = e.clipboardData.items;
      const newImages: string[] = [];
      let pendingReads = 0;
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            pendingReads++;
            const reader = new FileReader();
            reader.onload = (event) => {
              if (event.target?.result) newImages.push(event.target.result as string);
              pendingReads--;
              if (pendingReads === 0) {
                if (inputImages.length + newImages.length <= 10) setInputImages(prev => [...prev, ...newImages]);
                else setReferenceImages(prev => [...prev, ...newImages.slice(0, 20 - prev.length)]);
              }
            };
            reader.readAsDataURL(blob);
          }
        }
      }
    };
    const textAreaEl = textAreaRef.current;
    if (textAreaEl) textAreaEl.addEventListener('paste', handlePaste);
    return () => { if (textAreaEl) textAreaEl.removeEventListener('paste', handlePaste); };
  }, [inputImages, referenceImages]);

  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 8000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  const checkApiKey = async () => {
    const envKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;
    if (envKey) { setHasApiKey(true); return; }
    try {
      const win = window as any;
      if (win.aistudio && win.aistudio.hasSelectedApiKey) {
        const hasKey = await win.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      }
    } catch (e) { console.error("Error checking API key:", e); }
  };

  const handleApiKeySelect = async () => {
    const envKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;
    if (envKey) { setHasApiKey(true); return; }
    const win = window as any;
    if (win.aistudio && win.aistudio.openSelectKey) {
      try {
        await win.aistudio.openSelectKey();
        const hasKey = await win.aistudio.hasSelectedApiKey();
        setHasApiKey(hasKey);
      } catch (e) { console.error("Error selecting API key:", e); }
    }
  };

  const processFiles = (files: FileList | null, target: 'input' | 'ref') => {
    if (files && files.length > 0) {
      const currentList = target === 'input' ? inputImages : referenceImages;
      const limit = target === 'input' ? 10 : 20;
      const remainingSlots = limit - currentList.length;
      if (remainingSlots <= 0) return;
      const fileList = Array.from(files).slice(0, remainingSlots);
      const newImages: string[] = [];
      let processedCount = 0;
      fileList.forEach(file => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (reader.result) newImages.push(reader.result as string);
          processedCount++;
          if (processedCount === fileList.length) {
             if (target === 'input') setInputImages(prev => [...prev, ...newImages]);
             else setReferenceImages(prev => [...prev, ...newImages]);
          }
        };
        reader.readAsDataURL(file as any);
      });
    }
  };

  const handleInputUpload = (event: React.ChangeEvent<HTMLInputElement>) => { processFiles(event.target.files, 'input'); if (inputInputRef.current) inputInputRef.current.value = ''; };
  const handleRefUpload = (event: React.ChangeEvent<HTMLInputElement>) => { processFiles(event.target.files, 'ref'); if (refInputRef.current) refInputRef.current.value = ''; };
  const removeImage = (type: 'input' | 'ref', index: number) => { if (type === 'input') setInputImages(prev => prev.filter((_, i) => i !== index)); else setReferenceImages(prev => prev.filter((_, i) => i !== index)); };

  const deleteHistoryItem = (id: string) => {
    const itemToDelete = history.find(item => item.id === id);
    const newHistory = history.filter(item => item.id !== id);
    setHistory(newHistory);
    if (itemToDelete && generatedImages.includes(itemToDelete.url)) {
        if (newHistory.length > 0) setGeneratedImages([newHistory[0].url]);
        else setGeneratedImages([]);
    }
  };
  
  const clearHistory = () => { if (window.confirm("Are you sure you want to clear all history?")) { setHistory([]); setGeneratedImages([]); } };

   const handleDragStart = (e: React.DragEvent, type: any, index: number) => {
    setDraggingItem({ type, index });
    e.dataTransfer.setData("application/json", JSON.stringify({ type, index }));
    e.dataTransfer.effectAllowed = "move";
  };
  const handleDragOver = (e: React.DragEvent) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; };
  const handleDrop = (e: React.DragEvent, targetType: any) => {
    e.preventDefault();
    const data = e.dataTransfer.getData("application/json");
    if (!data) return;
    const source = JSON.parse(data);
    if (source.type === targetType) return; 
    const sourceList = source.type === 'input' ? inputImages : referenceImages;
    const imageToMove = sourceList[source.index];
    const targetList = targetType === 'input' ? inputImages : referenceImages;
    const limit = targetType === 'input' ? 10 : 20;
    if (targetList.length >= limit) { alert(`Cannot move image. ${targetType === 'input' ? 'Input' : 'Reference'} limit reached.`); return; }
    if (source.type === 'input') setInputImages(prev => prev.filter((_, i) => i !== source.index));
    else setReferenceImages(prev => prev.filter((_, i) => i !== source.index));
    if (targetType === 'input') setInputImages(prev => [...prev, imageToMove]);
    else setReferenceImages(prev => [...prev, imageToMove]);
    setDraggingItem(null);
  };

  const handleAutoPrompt = async () => {
    if (detectDevTools()) { punishDevTools(); return; }
    const allContextImages = [...inputImages, ...referenceImages];
    if (allContextImages.length === 0) return;
    if (!hasApiKey) { await handleApiKeySelect(); if (!hasApiKey) return; }
    setIsAutoPrompting(true);
    try {
      let typeForPrompt = selectedType;
      if (selectedType === MediaType.NONE && selectedArchStyle === ArchitectureStyle.NONE) typeForPrompt = MediaType.STANDARD;
      const suggestion = await generatePromptFromImage(allContextImages, typeForPrompt, selectedArchStyle, selectedRenderEngine, selectedLighting);
      setPrompt(suggestion);
    } catch (err) { setError("Could not generate auto-prompt. Check API key."); } 
    finally { setIsAutoPrompting(false); }
  };

  const handleEnhancePrompt = async () => {
    if (detectDevTools()) { punishDevTools(); return; }
    if (!prompt.trim()) return;
    if (!hasApiKey) { await handleApiKeySelect(); if (!hasApiKey) return; }
    setIsEnhancing(true);
    try {
      const enhanced = await enhanceUserPrompt(prompt, selectedType, selectedArchStyle, selectedRenderEngine, selectedLighting);
      setPrompt(enhanced);
    } catch (err) { setError("Could not enhance prompt."); } 
    finally { setIsEnhancing(false); }
  };

  const handleStop = () => { if (abortControllerRef.current) { abortControllerRef.current.abort(); setLoading(false); setError("Generation stopped by user."); setProgress(0); } };

  const handleTriggerEdit = async (maskBase64: string, editPrompt: string, references: string[]) => {
      // 1. Check DevTools
      if (detectDevTools()) {
          punishDevTools();
          return;
      }

      const editCost = calculateGenerationCost({
          quality: selectedQuality,
          imageCount: 1,
          isEdit: true
      });

      // 2. Check credits
      if (currentUser.credits < editCost) {
          setError(`Insufficient credits (${editCost} required) to perform edit.`);
          return;
      }

      setPreviewImage(null); 
      setLoading(true); 
      setError(null);
      setProgress(0);
      setImageCount(1); 
      setGeneratedImages([null]); 
      setIsLastGenEdit(true); 
      
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // 3. Deduct Credits Immediately
      try {
          const tx = await apiService.logTransaction(currentUser.username, "Image Edit", -editCost);
          setCurrentUser(prev => {
             const updated = { ...prev, credits: tx.newBalance };
             saveUserToCookie(updated);
             return updated;
          });
      } catch (e: any) {
          console.error("Edit Transaction Error:", e);
          setLoading(false);
          // Show the actual error message from API service
          setError(`Transaction failed: ${e.message || "Unknown error"}`);
          return;
      }

      try {
          if (!previewImage) throw new Error("Source image lost.");

          const editedUrl = await editCreativeAsset(
              previewImage, 
              maskBase64, 
              editPrompt, 
              selectedQuality,
              controller.signal, 
              references
          );

          if (controller.signal.aborted) return;

          apiService.uploadGeneratedImage(currentUser.username, currentUser.team, editedUrl, editPrompt, true, selectedQuality);

          setGeneratedImages([editedUrl]);
          
          const newRecord: GeneratedImage = {
                id: Date.now().toString(),
                url: editedUrl,
                prompt: editPrompt,
                type: MediaType.STANDARD,
                timestamp: Date.now(),
                isEdit: true
          };
          setHistory(prev => [newRecord, ...prev]);
          
      } catch (err: any) {
          if (err.name === 'AbortError' || err.message === 'Aborted') return;
          console.error(err);
          setError(`Edit failed: ${err.message}`);
          setGeneratedImages([]); 

          // 4. Refund on Failure
          await apiService.logTransaction(currentUser.username, "Refund: Failed Edit", editCost);
          const freshUser = await apiService.getUserProfile(currentUser.username);
          if (freshUser) {
              setCurrentUser(freshUser);
              saveUserToCookie(freshUser);
          }

      } finally {
          if (!abortControllerRef.current?.signal.aborted) setProgress(100);
          setLoading(false);
          abortControllerRef.current = null;
      }
  };

  const handleGenerate = async () => {
    // 1. Check DevTools immediately
    if (detectDevTools()) {
        punishDevTools();
        return;
    }

    if (!hasApiKey) {
      await handleApiKeySelect();
      const envKey = process.env.API_KEY || (import.meta as any).env?.VITE_API_KEY;
      if (!envKey) {
        const win = window as any;
        if (!win.aistudio || !(await win.aistudio.hasSelectedApiKey())) return;
      }
    }

    if (selectedType === MediaType.NONE && selectedArchStyle === ArchitectureStyle.NONE) {
        setError("Please select a Graphic Design Mode or Architecture Render Mode to proceed.");
        return;
    }

    if (!prompt.trim() && inputImages.length === 0 && referenceImages.length === 0) return;
    
    // 2. Check Balance
    if (currentUser.credits < estimatedCost) {
        setError(`Insufficient credits. Required: ${estimatedCost}.`);
        return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError(null);
    setProgress(0);
    setIsLastGenEdit(false); 

    const effectiveAspectRatio = selectedAspectRatio || '1:1';
    const effectiveCount = imageCount || 1;
    if (imageCount === 0) setImageCount(1);
    setGeneratedImages(Array(effectiveCount).fill(null));

    // 3. Deduct Credits Immediately
    try {
        const tx = await apiService.logTransaction(currentUser.username, `Generate ${effectiveCount} Image(s)`, -estimatedCost);
        setCurrentUser(prev => {
             const updated = { ...prev, credits: tx.newBalance };
             saveUserToCookie(updated);
             return updated;
        });
    } catch (e: any) {
        console.error("Generation Transaction Error:", e);
        setLoading(false);
        // Show the specific error message to help debug
        setError(`Transaction failed: ${e.message || "Unknown error"}`);
        return;
    }

    try {
      const imageUrls = await generateCreativeAsset(
          prompt, 
          selectedType, 
          effectiveAspectRatio, 
          effectiveCount, 
          inputImages, 
          referenceImages, 
          selectedArchStyle, 
          selectedQuality, 
          selectedRenderEngine, 
          selectedLighting, 
          controller.signal, 
          (url, index) => {
            setGeneratedImages(prev => {
                const newArr = [...prev];
                newArr[index] = url;
                return newArr;
            });
      });
      if (controller.signal.aborted) return;
      setGeneratedImages(imageUrls);
      
      const newRecords: GeneratedImage[] = imageUrls.map(url => ({
        id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
        url: url,
        prompt: prompt,
        type: selectedType,
        timestamp: Date.now(),
        isEdit: false
      }));
      setHistory(prev => [...newRecords, ...prev]);

      // Upload images
      imageUrls.forEach(url => {
          apiService.uploadGeneratedImage(currentUser.username, currentUser.team, url, prompt, false, selectedQuality);
      });

    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'Aborted') return;
      let msg = `${err.message || "Could not generate images."}`;
      if (err.message && (err.message.includes('503') || err.message.includes('500'))) {
         msg = "System is currently overloaded (503). Credits have been refunded.";
      }
      setError(msg);

      // 4. Refund on Failure
      try {
          await apiService.logTransaction(currentUser.username, "Refund: Failed Generation", estimatedCost);
          const freshUser = await apiService.getUserProfile(currentUser.username);
          if (freshUser) {
              setCurrentUser(freshUser);
              saveUserToCookie(freshUser);
          }
      } catch (refundErr) {
          console.error("Refund failed:", refundErr);
      }

    } finally {
      if (!abortControllerRef.current?.signal.aborted) setProgress(100);
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleDownload = (url: string, specificPrompt?: string, isEdit: boolean = false) => {
    if (url) {
      const prefix = "AstraKAT";
      const resolution = (selectedQuality === ImageQuality.AUTO) ? 'Standard' : selectedQuality;
      
      const d = new Date();
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const dateStr = `${day}${month}${year}`;
      
      let slug = "Creative-Design";
      if (isEdit) {
          slug = "EditMode";
      } else {
          const promptText = specificPrompt || prompt || "";
          if (promptText) {
             const cleanPrompt = promptText.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9\s]/g, "").trim();
             slug = cleanPrompt.split(/\s+/).slice(0, 5).join('-') || "Creative-Design";
          }
      }

      const id = Math.random().toString(36).substr(2, 6).toUpperCase();

      const filename = `${prefix}_${slug}_${resolution}_${dateStr}_${id}.png`;

      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const getTypeIcon = (type: MediaType) => {
    switch (type) {
      case MediaType.STANDARD: return <BoxSelect className="w-4 h-4" />;
      case MediaType.POSTER: return <LayoutTemplate className="w-4 h-4" />;
      case MediaType.KEY_VISUAL: return <MonitorPlay className="w-4 h-4" />;
      case MediaType.SOCIAL_POST: return <Instagram className="w-4 h-4" />;
      case MediaType.WALLPAPER: return <Smartphone className="w-4 h-4" />;
      case MediaType.COVER_ART: return <Disc className="w-4 h-4" />;
      case MediaType.BANNER: return <RectangleHorizontal className="w-4 h-4" />;
      case MediaType.CARD: return <CreditCard className="w-4 h-4" />;
      default: return <ImageIcon className="w-4 h-4" />;
    }
  };

  const handleTypeSelect = (type: MediaType) => { setSelectedType(type); setSelectedArchStyle(ArchitectureStyle.NONE); setIsTypeDropdownOpen(false); };
  const handleArchSelect = (style: ArchitectureStyle) => { setSelectedArchStyle(style); setSelectedType(MediaType.NONE); setIsArchDropdownOpen(false); setLockedArchCategory(null); };

  const isGraphicModeActive = selectedType !== MediaType.NONE;
  const isArchModeActive = selectedArchStyle !== ArchitectureStyle.NONE;
  const isRatioActive = selectedAspectRatio !== '';
  const isCountActive = imageCount !== 0;
  const isQualityActive = isQualitySet; 

  const activeButtonStyle = "bg-[#09232b] border-[#e2b36e]/50 text-[#e2b36e] shadow-[0_0_15px_rgba(226,179,110,0.2)] ring-1 ring-[#e2b36e]/20 font-bold";
  const inactiveButtonStyle = "bg-[#103742]/40 border-[#e2b36e]/10 hover:bg-[#103742]/60 text-[#e2b36e]/70";
  
  if (securityTampered) return <div className="h-screen w-full bg-black flex items-center justify-center text-red-600 font-bold text-3xl">System Integrity Compromised</div>;

  return (
    <div className="min-h-screen w-full relative bg-[#103742] selection:bg-[#e2b36e] selection:text-[#103742] flex flex-col">
      {/* Invisible Beacon to track online presence */}
      <OnlinePresenceBeacon user={currentUser} />

      {previewImage && (
        <FullScreenViewer 
            src={previewImage} 
            onClose={() => setPreviewImage(null)} 
            isGenerated={previewSource === 'generated'}
            isEditableType={previewSource !== 'ref'}
            onValidateAccess={() => true}
            currentPrompt={prompt}
            onDownload={(url, prompt) => handleDownload(url, prompt, isLastGenEdit)} 
            onTriggerEdit={handleTriggerEdit}
            quality={selectedQuality} 
        />
      )}

      {error && (
        <div className="fixed top-24 right-6 z-[100] animate-in slide-in-from-right fade-in duration-500 max-w-sm sm:max-w-md pointer-events-auto">
          <div className="bg-gradient-to-br from-red-500/20 via-red-900/10 to-transparent backdrop-blur-xl border border-red-500/20 text-red-50 px-6 py-4 rounded-xl shadow-[0_0_20px_rgba(220,38,38,0.4)] flex flex-col gap-2">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-red-100 font-bold">
                <X size={18} />
                <span>Error Occurred</span>
              </div>
              <button onClick={() => setError(null)} className="hover:bg-red-500/20 p-1 rounded-md transition-colors text-white">
                <X size={14} />
              </button>
            </div>
            <p className="text-xs sm:text-sm opacity-90 break-words break-all whitespace-pre-wrap font-mono bg-black/40 p-2 rounded border border-red-500/20 max-h-[300px] overflow-y-auto custom-scrollbar text-red-100 shadow-inner">
              {error}
            </p>
          </div>
        </div>
      )}

      <div className="fixed inset-0 overflow-hidden pointer-events-none transform-gpu translate-z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-[#103742] via-[#09232b] to-[#103742] blur-[120px] opacity-40 will-change-transform"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full bg-gradient-to-tl from-[#e2b36e] via-[#b28e67] to-[#103742] blur-[120px] opacity-20 will-change-transform"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-black/40 blur-[80px]"></div>
        <div className="absolute inset-0 backdrop-blur-[60px]"></div>
        <div className="absolute inset-0 z-0 opacity-50 mix-blend-overlay" style={{backgroundImage: `repeating-linear-gradient(90deg,rgba(255,255,255,0) 0px,rgba(255,255,255,0.1) 10px,rgba(255,255,255,0.2) 15px,rgba(255,255,255,0.1) 20px,rgba(255,255,255,0) 30px,rgba(0,0,0,0.2) 40px,rgba(0,0,0,0.5) 45px,rgba(0,0,0,0.2) 50px,rgba(0,0,0,0) 60px)`}}></div>
        <div className="absolute inset-0 opacity-[0.07] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-screen"></div>
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/80"></div>
      </div>

      <header className="flex-none h-24 flex items-center justify-center mb-2 z-20 select-none">
          <div className="w-full max-w-[1920px] mx-auto px-6 md:px-12 lg:px-20 xl:px-28 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                  <div className="relative h-16 w-auto flex-none">
                       <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,255,255,0.15)_0%,_transparent_70%)] blur-xl"></div>
                       <img 
                        src="https://drive.google.com/thumbnail?id=1LgeMCeo2P5G2ex6Vo9ONZMBVgEA9kGGR&sz=w500" 
                        alt="ASTRA Logo"
                        className="h-full w-auto object-contain relative z-10 drop-shadow-[0_0_15px_rgba(255,255,255,0.2)]"
                        onContextMenu={(e) => e.preventDefault()}
                        draggable={false}
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                  </div>
                  <div className="flex flex-col justify-center">
                      <h1 className="text-4xl font-black text-[#e2b36e] tracking-tighter leading-none uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">ASTRA</h1>
                      <p className="text-[0.6rem] font-bold tracking-[0.4em] uppercase text-[#e2b36e] pl-0.5 leading-none mt-1.5">Creatives from the stars</p>
                  </div>
              </div>
              <UserProfile user={currentUser} onSignOut={onSignOut} onPasswordChange={onPasswordChange} />
          </div>
      </header>
      
      <div className="flex-1 w-full max-w-[1920px] mx-auto px-6 md:px-12 lg:px-20 xl:px-28 flex flex-col lg:flex-row gap-16 relative z-10 items-stretch min-h-[calc(100vh-7rem)] pb-24">
          <GlassCard className="w-full lg:w-[360px] xl:w-[420px] shrink-0 flex flex-col p-5 lg:p-6 h-full relative z-50 border-[#e2b36e]/20">
             {/* ... (Rest of content remains the same) ... */}
             <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 flex-none">
                   <div className="relative" ref={typeDropdownRef}>
                    <label className={`block text-xs font-semibold mb-1.5 flex items-center gap-1.5 transition-colors duration-300 ${isGraphicModeActive ? 'text-[#e2b36e] drop-shadow-[0_0_8px_rgba(226,179,110,0.5)]' : 'text-[#e2b36e]/70'}`}><Palette size={12} /> Graphic Design Mode</label>
                    <button onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all duration-300 ${isGraphicModeActive ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate"><span className="truncate text-sm font-medium">{selectedType === MediaType.NONE ? 'Select Type' : selectedType}</span></div><ChevronDown size={14} className={isGraphicModeActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/40'} /></button>
                    {isTypeDropdownOpen && (
                      <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#09232b]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden max-h-60 overflow-y-auto p-1">
                        {Object.values(MediaType).filter(type => type !== MediaType.NONE).map((type) => (<button key={type} onClick={() => handleTypeSelect(type)} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm ${selectedType === type && isGraphicModeActive ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}>{getTypeIcon(type)} <span>{type}</span></button>))}
                      </div>
                    )}
                   </div>
                   <div className="relative" ref={archDropdownRef}>
                    <label className={`block text-xs font-semibold mb-1.5 flex items-center gap-1.5 transition-colors duration-300 ${isArchModeActive ? 'text-[#e2b36e] drop-shadow-[0_0_8px_rgba(226,179,110,0.5)]' : 'text-[#e2b36e]/70'}`}><Building2 size={12} /> Architecture Render Mode</label>
                    <button onClick={() => setIsArchDropdownOpen(!isArchDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all duration-300 ${isArchModeActive ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate"><span className="truncate text-sm font-medium">{selectedArchStyle === ArchitectureStyle.NONE ? 'Select Style' : selectedArchStyle}</span></div><ChevronDown size={14} className={isArchModeActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/40'} /></button>
                    {isArchDropdownOpen && (
                      <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#09232b]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-1 overflow-visible">
                        <button onClick={() => handleArchSelect(ArchitectureStyle.STANDARD)} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm mb-1 ${selectedArchStyle === ArchitectureStyle.STANDARD ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className="font-medium">Standard</span></button>
                        {Object.entries(ARCH_STYLE_GROUPS).map(([category, styles]) => {
                            const isActive = lockedArchCategory === category;
                            return (
                            <div key={category} className="group/item relative">
                                <button onClick={(e) => { e.stopPropagation(); setLockedArchCategory(isActive ? null : category); }} className={`w-full p-2 rounded flex items-center justify-between gap-2 text-left text-sm transition-colors ${isActive ? 'bg-[#e2b36e]/10 text-[#e2b36e]' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className="font-medium flex-1">{category}</span><ChevronRight size={14} className={`transition-transform duration-200 opacity-50 flex-none ${isActive ? 'rotate-90' : ''}`} /></button>
                                <div className={`absolute left-full top-0 ml-2 w-48 bg-[#09232b]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-1 z-[60] ${isActive ? 'block' : 'hidden'}`}>{styles.map((style) => (<button key={style} onClick={() => handleArchSelect(style)} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm ${selectedArchStyle === style ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className={`w-1.5 h-1.5 rounded-full flex-none ${selectedArchStyle === style ? 'bg-[#e2b36e]' : 'bg-white/20'}`} /><span className="font-medium flex-1">{style}</span></button>))}</div>
                            </div>
                        )})}
                        <button onClick={() => handleArchSelect(ArchitectureStyle.OTHERS)} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm mt-1 ${selectedArchStyle === ArchitectureStyle.OTHERS ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className="font-medium">Others</span></button>
                      </div>
                    )}
                   </div>
             </div>

             <div className="grid grid-cols-3 gap-3 mb-6 flex-none">
                  <div className="relative" ref={ratioDropdownRef}>
                     <label className={`block text-[10px] font-semibold mb-1.5 flex items-center gap-1.5 truncate ${isRatioActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/70'}`}><Ratio size={10} /> Ratio</label>
                     <button onClick={() => setIsRatioDropdownOpen(!isRatioDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all ${isRatioActive ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate"><span className="truncate text-sm font-medium">{isRatioActive ? ASPECT_RATIOS.find(r => r.value === selectedAspectRatio)?.label : 'Select'}</span></div><ChevronDown size={14} className={isRatioActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/40'} /></button>
                      {isRatioDropdownOpen && (
                        <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#09232b]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden p-1 min-w-[120px]">{ASPECT_RATIOS.map((ratio) => (<button key={ratio.value} onClick={() => { setSelectedAspectRatio(ratio.value); setIsRatioAuto(false); setIsRatioDropdownOpen(false); }} className={`w-full p-2 rounded flex items-center justify-between gap-2 text-left text-sm ${selectedAspectRatio === ratio.value ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><div className="flex items-center gap-2"><span>{ratio.label}</span></div></button>))}</div>
                      )}
                  </div>
                  <div className="relative" ref={countDropdownRef}>
                     <label className={`block text-[10px] font-semibold mb-1.5 flex items-center gap-1.5 truncate ${isCountActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/70'}`}><Layers size={10} /> Count</label>
                     <button onClick={() => setIsCountDropdownOpen(!isCountDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all ${isCountActive ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate"><span className="truncate text-sm font-medium">{isCountActive ? `${imageCount}` : 'Select'}</span></div><ChevronDown size={14} className={isCountActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/40'} /></button>
                      {isCountDropdownOpen && (
                        <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#09232b]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden p-1 min-w-[100px]">{[1, 2, 4].map((count) => (<button key={count} onClick={() => { setImageCount(count); setIsCountAuto(false); setIsCountDropdownOpen(false); }} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm ${imageCount === count ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className="font-bold">{count}</span><span className="opacity-70">Image{count > 1 ? 's' : ''}</span></button>))}</div>
                      )}
                  </div>
                  <div className="relative" ref={qualityDropdownRef}>
                     <label className={`block text-[10px] font-semibold mb-1.5 flex items-center gap-1.5 truncate ${isQualityActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/70'}`}><Sparkles size={10} /> Quality</label>
                     <button onClick={() => setIsQualityDropdownOpen(!isQualityDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all ${isQualityActive ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate"><span className="truncate text-sm font-medium">{!isQualitySet ? 'Select' : selectedQuality}</span></div><ChevronDown size={14} className={isQualityActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/40'} /></button>
                      {isQualityDropdownOpen && (
                        <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#09232b]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden p-1 min-w-[120px]">{Object.values(ImageQuality).map((q) => (<button key={q} onClick={() => { setSelectedQuality(q); setIsQualitySet(true); setIsQualityAuto(false); setIsQualityDropdownOpen(false); }} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm ${selectedQuality === q ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className="font-medium">{q}</span></button>))}</div>
                      )}
                  </div>
             </div>

             {isArchModeActive && (
                    <div className="grid grid-cols-2 gap-3 mb-6 flex-none animate-in fade-in slide-in-from-top-2 duration-300">
                        <div className="relative" ref={renderEngineDropdownRef}>
                            <label className={`block text-[10px] font-semibold mb-1.5 flex items-center gap-1.5 truncate ${selectedRenderEngine !== RenderEngine.DEFAULT ? 'text-[#e2b36e]' : 'text-[#e2b36e]/70'}`}><Cpu size={10} /> Render Engine</label>
                            <button onClick={() => setIsRenderEngineDropdownOpen(!isRenderEngineDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all ${selectedRenderEngine !== RenderEngine.DEFAULT ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate"><span className="truncate text-sm font-medium">{selectedRenderEngine}</span></div><ChevronDown size={14} className={selectedRenderEngine !== RenderEngine.DEFAULT ? 'text-[#e2b36e]' : 'text-[#e2b36e]/40'} /></button>
                            {isRenderEngineDropdownOpen && (
                                <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#09232b]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-1 overflow-visible">
                                    <button onClick={() => { setSelectedRenderEngine(RenderEngine.DEFAULT); setIsRenderEngineDropdownOpen(false); }} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm mb-1 ${selectedRenderEngine === RenderEngine.DEFAULT ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className="font-medium">Default</span></button>
                                    {Object.entries(ENGINE_GROUPS).map(([category, engines]) => {
                                        const isActive = lockedRenderCategory === category;
                                        return (
                                        <div key={category} className="group/item relative">
                                            <button onClick={(e) => { e.stopPropagation(); setLockedRenderCategory(isActive ? null : category); }} className={`w-full p-2 rounded flex items-center justify-between gap-2 text-left text-sm transition-colors ${isActive ? 'bg-[#e2b36e]/10 text-[#e2b36e]' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className="font-medium flex-1">{category}</span><ChevronRight size={14} className={`transition-transform duration-200 opacity-50 flex-none ${isActive ? 'rotate-90' : ''}`} /></button>
                                            <div className={`absolute left-full top-0 ml-2 w-48 bg-[#09232b]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-1 z-[60] ${isActive ? 'block' : 'hidden'}`}>{engines.map((engine) => (<button key={engine} onClick={() => { setSelectedRenderEngine(engine); setIsRenderEngineDropdownOpen(false); setLockedRenderCategory(null); }} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm ${selectedRenderEngine === engine ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className="font-medium flex-1">{engine}</span></button>))}</div>
                                        </div>
                                    )})}
                                </div>
                            )}
                        </div>
                        <div className="relative" ref={lightingDropdownRef}>
                            <label className={`block text-[10px] font-semibold mb-1.5 flex items-center gap-1.5 truncate ${selectedLighting !== LightingSetting.DEFAULT ? 'text-[#e2b36e]' : 'text-[#e2b36e]/70'}`}><Sun size={10} /> Lighting</label>
                            <button onClick={() => setIsLightingDropdownOpen(!isLightingDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all ${selectedLighting !== LightingSetting.DEFAULT ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate"><span className="truncate text-sm font-medium">{selectedLighting}</span></div><ChevronDown size={14} className={selectedLighting !== LightingSetting.DEFAULT ? 'text-[#e2b36e]' : 'text-[#e2b36e]/40'} /></button>
                            {isLightingDropdownOpen && (
                                <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#09232b]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] p-1 overflow-visible">
                                    <button onClick={() => { setSelectedLighting(LightingSetting.DEFAULT); setIsLightingDropdownOpen(false); }} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm mb-1 ${selectedLighting === LightingSetting.DEFAULT ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className="font-medium">Default</span></button>
                                    {Object.entries(LIGHTING_GROUPS).map(([category, options]) => {
                                        const isActive = lockedLightingCategory === category;
                                        return (
                                        <div key={category} className="group/item relative">
                                            <button onClick={(e) => { e.stopPropagation(); setLockedLightingCategory(isActive ? null : category); }} className={`w-full p-2 rounded flex items-center justify-between gap-2 text-left text-sm transition-colors ${isActive ? 'bg-[#e2b36e]/10 text-[#e2b36e]' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className="font-medium flex-1">{category}</span><ChevronRight size={14} className={`transition-transform duration-200 opacity-50 flex-none ${isActive ? 'rotate-90' : ''}`} /></button>
                                            <div className={`absolute left-full top-0 ml-2 w-48 bg-[#09232b]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.5)] p-1 z-[60] ${isActive ? 'block' : 'hidden'}`}>{options.map((option) => (<button key={option} onClick={() => { setSelectedLighting(option); setIsLightingDropdownOpen(false); setLockedLightingCategory(null); }} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm ${selectedLighting === option ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/70 hover:bg-[#e2b36e]/10 hover:text-[#e2b36e]'}`}><span className="font-medium flex-1">{option}</span></button>))}</div>
                                        </div>
                                    )})}
                                </div>
                            )}
                        </div>
                    </div>
             )}

             <div className="flex flex-col gap-4 mb-6 mt-4 flex-none">
                   {/* References and Input Images Drag & Drop Areas */}
                   <div className={`border border-dashed rounded-lg p-2.5 transition-colors flex flex-col h-32 overflow-hidden ${draggingItem?.type === 'input' ? 'border-[#e2b36e] bg-[#e2b36e]/10' : 'border-[#e2b36e]/30 bg-[#09232b]/40'}`} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, 'reference')}>
                    <div className="flex items-center justify-between mb-1"><label className="text-xs font-bold text-[#e2b36e] flex items-center gap-1.5"><CopyPlus size={12} /> References</label><span className="text-[10px] text-[#e2b36e]/50">{referenceImages.length}/20</span></div>
                    <div className="flex flex-wrap gap-2 overflow-y-auto custom-scrollbar flex-1 content-start p-1 -m-1 pl-2 pt-2 pr-2">
                        <button onClick={() => refInputRef.current?.click()} disabled={referenceImages.length >= 20} className={`h-14 w-14 flex-none rounded border border-dashed flex items-center justify-center transition-all ${referenceImages.length >= 20 ? 'opacity-50 cursor-not-allowed' : 'border-[#e2b36e]/30 text-[#e2b36e] hover:bg-[#e2b36e]/10'}`}><Plus size={20} /></button>
                        <input type="file" ref={refInputRef} className="hidden" onChange={handleRefUpload} accept="image/*" multiple />
                        {referenceImages.map((img, index) => (
                            <div key={`ref-${index}`} className="relative group h-14 w-14 flex-none cursor-move" draggable onDragStart={(e) => handleDragStart(e, 'reference', index)}>
                                <div className="h-full w-full rounded overflow-hidden border border-[#e2b36e]/30 relative">
                                    <img src={img} alt={`Ref ${index}`} className="h-full w-full object-cover select-none" draggable={false} />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { e.stopPropagation(); setPreviewImage(img); setPreviewSource('ref'); }} className="p-1 hover:text-[#e2b36e] text-white transition-colors drop-shadow-md" title="View Fullscreen"><Maximize size={16} /></button>
                                    </div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); removeImage('ref', index); }} className="absolute -top-2 -right-2 p-1 bg-red-500 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 scale-90 hover:scale-100 w-6 h-6 flex items-center justify-center" title="Remove"><X size={14} /></button>
                            </div>
                        ))}
                    </div>
                    <div className="mt-1 text-[10px] text-[#e2b36e]/40 text-center italic select-none">Upload images here to use as Reference</div>
                  </div>
                  <div className={`border border-dashed rounded-lg p-2.5 transition-colors flex flex-col h-32 overflow-hidden ${draggingItem?.type === 'input' ? 'border-[#e2b36e] bg-[#e2b36e]/10' : 'border-[#e2b36e]/30 bg-[#09232b]/40'}`} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, 'input')}>
                    <div className="flex items-center justify-between mb-1"><label className="text-xs font-bold text-[#e2b36e] flex items-center gap-1.5"><ImageIcon size={12} /> {isArchModeActive ? 'Input Images' : 'Input Image'}</label><span className="text-[10px] text-[#e2b36e]/50">{inputImages.length}/10</span></div>
                    <div className="flex flex-wrap gap-2 overflow-y-auto custom-scrollbar flex-1 content-start p-1 -m-1 pl-2 pt-2 pr-2">
                        <button onClick={() => inputInputRef.current?.click()} disabled={inputImages.length >= 10} className={`h-14 w-14 flex-none rounded border border-dashed flex items-center justify-center transition-all ${inputImages.length >= 10 ? 'opacity-50 cursor-not-allowed' : 'border-[#e2b36e]/30 text-[#e2b36e] hover:bg-[#e2b36e]/10'}`}><Plus size={20} /></button>
                        <input type="file" ref={inputInputRef} className="hidden" onChange={handleInputUpload} accept="image/*" multiple />
                        {inputImages.map((img, index) => (
                            <div key={`input-${index}`} className="relative group h-14 w-14 flex-none cursor-move" draggable onDragStart={(e) => handleDragStart(e, 'input', index)}>
                                <div className="h-full w-full rounded overflow-hidden border border-[#e2b36e]/30 relative">
                                    <img src={img} alt={`Input ${index}`} className="h-full w-full object-cover select-none" draggable={false} />
                                    <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity">
                                        <button onClick={(e) => { e.stopPropagation(); setPreviewImage(img); setPreviewSource('input'); }} className="p-1 hover:text-[#e2b36e] text-white transition-colors drop-shadow-md" title="View Fullscreen"><Maximize size={16} /></button>
                                    </div>
                                </div>
                                <button onClick={(e) => { e.stopPropagation(); removeImage('input', index); }} className="absolute -top-2 -right-2 p-1 bg-red-500 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 scale-90 hover:scale-100 w-6 h-6 flex items-center justify-center" title="Remove"><X size={14} /></button>
                            </div>
                        ))}
                    </div>
                    <div className="mt-1 text-[10px] text-[#e2b36e]/40 text-center italic select-none">Upload images here to use as Base</div>
                  </div>
                </div>
                
                <div className="flex-1 flex flex-col gap-2 mb-6 min-h-[150px]">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-[#e2b36e]">Prompt</label>
                    {(inputImages.length > 0 || referenceImages.length > 0) && (
                        <button onClick={handleAutoPrompt} disabled={isAutoPrompting} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-lg border border-[#e2b36e]/30 ${isAutoPrompting ? 'bg-[#09232b] text-[#e2b36e] cursor-wait' : 'bg-[#e2b36e]/10 text-[#e2b36e] hover:bg-[#e2b36e]/20'}`}><Sparkles size={12} className={isAutoPrompting ? "animate-spin" : ""} />{isAutoPrompting ? 'Reading...' : 'Auto Prompt'}</button>
                    )}
                  </div>
                  <div className="relative flex-1 bg-[#09232b]/40 border border-[#e2b36e]/20 rounded-lg hover:bg-[#09232b]/60 focus-within:bg-[#09232b]/60 focus-within:ring-1 focus-within:ring-[#e2b36e]/50 transition-all group overflow-hidden">
                    <textarea ref={textAreaRef} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={isArchModeActive ? "Describe the materials, lighting... Paste images here to upload!" : "Describe your concept... Paste images here directly!"} className="w-full h-full bg-transparent border-none p-4 text-[#e2b36e] placeholder-[#e2b36e]/30 focus:outline-none resize-none text-sm leading-relaxed custom-scrollbar pb-12 rounded-lg" />
                    {prompt.trim() && (
                      <button onClick={handleEnhancePrompt} disabled={isEnhancing} className={`absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 z-10 max-w-full ${isEnhancing ? 'bg-[#09232b] border border-[#e2b36e]/10 text-[#e2b36e]/50 cursor-wait shadow-none' : 'bg-[#09232b] border border-[#e2b36e]/30 text-white shadow-[0_0_15px_rgba(226,179,110,0.2)] hover:shadow-[0_0_25px_rgba(226,179,110,0.4)] hover:bg-[#103742]'}`}><Wand2 size={11} className={isEnhancing ? "animate-spin" : "fill-white/50"} />{isEnhancing ? 'Enhancing...' : 'Enhance'}</button>
                    )}
                  </div>
                </div>

                <div className="flex justify-center flex-none mt-auto">
                    {!hasApiKey ? (
                       <Button onClick={handleApiKeySelect} className="w-full py-4 text-base font-bold tracking-wide"><Key className="w-4 h-4" /> Connect Gemini</Button>
                    ) : (
                      <div className="w-full flex justify-center">
                         <Button
                            onClick={loading ? handleStop : handleGenerate}
                            variant={loading ? "rainbow-stop" : "rainbow"}
                            isLoading={loading}
                            disabled={!loading && (!prompt && inputImages.length === 0 && referenceImages.length === 0)}
                            className="w-[90%] py-2 text-sm xl:text-base font-bold tracking-wide shadow-2xl disabled:opacity-100 disabled:filter-none hover:scale-105 active:scale-95 transition-transform duration-200 whitespace-nowrap"
                         >
                            {loading ? (<><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" className="mr-2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>STOP</>) : (<>
                                <svg width="20" height="20" viewBox="0 0 100 100" className="w-5 h-5 mr-2 text-[#09232b] fill-current"><path d="M 50 0 C 50 35 60 45 100 50 C 60 55 50 65 50 100 C 50 65 40 55 0 50 C 40 45 50 35 50 0 Z" /></svg>
                                {isArchModeActive ? 'Render Architecture' : 'Generate Design'}
                                {isQualitySet && (
                                    <span className="font-normal opacity-80 ml-1 text-xs">({estimatedCost} credits)</span>
                                )}
                            </>)}
                         </Button>
                      </div>
                    )}
                </div>
          </GlassCard>

          <div className="w-full lg:flex-1 h-auto flex flex-col gap-6 min-w-0 relative z-10">
              <GlassCard className="flex-1 w-full flex flex-col relative overflow-hidden min-h-[400px] shrink-0 rounded-2xl border-[#e2b36e]/20">
                  <div className="absolute -top-[1px] -left-[1px] z-20 pointer-events-none mix-blend-plus-lighter opacity-80"><svg width="120" height="120" viewBox="0 0 120 120" fill="none"><defs><radialGradient id="gradTL" cx="0" cy="0" r="120" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#e2b36e" stopOpacity="0.6" /><stop offset="20%" stopColor="#b28e67" stopOpacity="0.4" /><stop offset="100%" stopColor="#103742" stopOpacity="0" /></radialGradient></defs><path d="M 1 118 V 20 Q 1 1 20 1 H 118" stroke="url(#gradTL)" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg></div>
                  <div className="absolute -bottom-[1px] -right-[1px] z-20 pointer-events-none mix-blend-plus-lighter opacity-80"><svg width="120" height="120" viewBox="0 0 120 120" fill="none"><defs><radialGradient id="gradBR" cx="120" cy="120" r="120" gradientUnits="userSpaceOnUse"><stop offset="0%" stopColor="#e2b36e" stopOpacity="0.6" /><stop offset="20%" stopColor="#b28e67" stopOpacity="0.4" /><stop offset="100%" stopColor="#103742" stopOpacity="0" /></radialGradient></defs><path d="M 119 2 V 100 Q 119 119 100 119 H 2" stroke="url(#gradBR)" strokeWidth="1.5" strokeLinecap="round" fill="none"/></svg></div>
                  
                  <div className="absolute inset-6 flex items-center justify-center">
                      {generatedImages.length === 0 && !loading && (
                        <div className="text-center max-w-md mx-auto relative z-10 select-none">
                          <div className="w-20 h-20 bg-white/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#e2b36e]/20"><ImageIcon className="w-10 h-10 text-[#e2b36e]/40" /></div>
                          <h3 className="text-xl font-bold text-[#e2b36e] mb-2 drop-shadow-md">Ready to Design</h3>
                          <p className="text-[#e2b36e]/60 mb-6 text-sm">Upload <strong>Input Images</strong> to transform, or <strong>References</strong> to guide style.</p>
                        </div>
                      )}
                      {(loading || generatedImages.length > 0) && (
                        <div className={`w-full h-full p-2 grid gap-4 relative z-20 ${ (loading ? imageCount : generatedImages.length) === 1 ? 'grid-cols-1' : (loading ? imageCount : generatedImages.length) === 2 ? 'grid-cols-2' : 'grid-cols-2 grid-rows-2' }`}>
                           {Array.from({ length: loading ? imageCount : generatedImages.length }).map((_, i) => {
                             const completedUrl = generatedImages[i];
                             if (completedUrl) {
                               return (
                                <div key={`img-${i}`} className="relative group/img rounded-xl overflow-hidden shadow-2xl w-full h-full border border-[#e2b36e]/20 bg-black/20 animate-in fade-in zoom-in-95 duration-500">
                                  <img src={completedUrl} alt={`Generated ${i}`} className="w-full h-full object-contain cursor-pointer select-none" draggable={false} onClick={() => { setPreviewImage(completedUrl); setPreviewSource('generated'); }} onContextMenu={(e) => e.preventDefault()} />
                                  <div className="absolute top-4 right-4 p-0 opacity-0 group-hover/img:opacity-100 transition-opacity duration-300 pointer-events-none">
                                      <div className="bg-black/40 backdrop-blur-md border border-white/20 rounded-xl p-1.5 flex items-center gap-2 shadow-lg pointer-events-auto">
                                          <button onClick={() => { setPreviewImage(completedUrl); setPreviewSource('generated'); }} className="p-1.5 hover:bg-white/20 rounded-lg text-white transition-colors" title="Edit Image"><Edit3 size={16} /></button>
                                          <div className="w-[1px] h-4 bg-white/20"></div>
                                          <button onClick={() => handleDownload(completedUrl, prompt, isLastGenEdit)} className="p-1.5 hover:bg-white/20 rounded-lg text-white transition-colors" title="Download"><Download size={16} /></button>
                                      </div>
                                  </div>
                                </div>
                               );
                             } else {
                               return (
                                 <div key={`load-${i}`} className="relative bg-[#103742]/40 backdrop-blur-md rounded-2xl border border-[#e2b36e]/20 flex items-center justify-center overflow-hidden">
                                     <div className={`flex flex-col items-center justify-center gap-3 z-10 ${imageCount > 1 ? 'scale-75' : 'scale-100'}`}>
                                        <div className="relative flex items-center justify-center">
                                            <div className="absolute inset-0 bg-[#e2b36e]/20 blur-xl rounded-full animate-pulse"></div>
                                            <svg width="80" height="80" viewBox="0 0 100 100" className="animate-pulse drop-shadow-[0_0_10px_rgba(226,179,110,0.8)]" xmlns="http://www.w3.org/2000/svg">
                                                <defs><linearGradient id="starGradient" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stopColor="#e2b36e" /><stop offset="100%" stopColor="#ffffff" /></linearGradient></defs>
                                                <path d="M 50 0 C 50 35 60 45 100 50 C 60 55 50 65 50 100 C 50 65 40 55 0 50 C 40 45 50 35 50 0 Z" fill="url(#starGradient)" stroke="rgba(255,255,255,0.9)" strokeWidth="1.5" strokeLinejoin="round"/>
                                            </svg>
                                        </div>
                                        <div className="text-center mt-3"><span className="block text-[#e2b36e] font-mono font-bold text-2xl leading-none">{Math.round(progress)}%</span></div>
                                    </div>
                                 </div>
                               );
                             }
                           })}
                        </div>
                      )}
                  </div>
              </GlassCard>

              <GlassCard className="w-full flex-none h-40 min-h-[10rem] shrink-0 p-4 flex flex-col mb-8 lg:mb-0 border-[#e2b36e]/20">
                  <div className="flex-none flex items-center justify-between mb-3">
                     <div className="flex items-center gap-2 text-xs font-semibold text-[#e2b36e]/60 uppercase tracking-widest"><HistoryIcon size={12} /> Recent Generations</div>
                     {history.length > 0 && (<button onClick={clearHistory} className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 hover:underline"><Trash2 size={10} /> Clear All</button>)}
                  </div>
                  <div className="flex-1 flex gap-4 overflow-x-auto custom-scrollbar pb-2 min-h-0">
                    {history.length === 0 ? (<div className="w-full flex items-center justify-center text-[#e2b36e]/30 text-xs italic">No history yet. Start creating!</div>) : (
                        history.map((item) => (
                        <div key={item.id} onClick={() => { setGeneratedImages([item.url]); setLoading(false); setIsLastGenEdit(item.isEdit || false); }} className="relative flex-none h-full aspect-square rounded-lg overflow-hidden border border-[#e2b36e]/20 group hover:border-[#e2b36e] transition-all cursor-pointer select-none" onContextMenu={(e) => e.preventDefault()}>
                            <img src={item.url} alt="History" className="w-full h-full object-cover select-none" draggable={false} />
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); handleDownload(item.url, item.prompt, item.isEdit || false); }} className="absolute top-1 left-1 p-1.5 bg-black/60 hover:bg-black/80 rounded-md text-white backdrop-blur-sm transition-colors" title="Download"><Download size={12}/></button>
                                <button onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.id); }} className="absolute top-1 right-1 p-1.5 bg-red-500/80 hover:bg-red-600 rounded-md text-white backdrop-blur-sm transition-colors" title="Delete"><Trash2 size={12}/></button>
                            </div>
                        </div>))
                    )}
                  </div>
              </GlassCard>
          </div>
      </div>
      <footer className="flex-none w-full text-center py-6 mt-auto text-[#e2b36e]/40 text-sm font-medium uppercase tracking-widest opacity-80 hover:opacity-100 transition-opacity duration-500 select-none flex flex-col items-center gap-3">
          <span className="drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]">Powered by Eric</span>
      </footer>
    </div>
  );
};
