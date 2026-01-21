import React, { useState, useRef, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getDatabase, ref, onValue, onDisconnect, set, push, serverTimestamp } from 'firebase/database';
import { GlassCard } from './components/GlassCard';
import { Button } from './components/Button';
import { MediaType, ASPECT_RATIOS, GeneratedImage, ArchitectureStyle, ImageQuality } from './types';
import { generateCreativeAsset, generatePromptFromImage, enhanceUserPrompt, editCreativeAsset } from './services/geminiService';
import { 
  Wand2, 
  Download, 
  Image as ImageIcon, 
  Sparkles,
  LayoutTemplate,
  MonitorPlay,
  Instagram,
  ChevronDown,
  Smartphone,
  Disc,
  CreditCard,
  RectangleHorizontal,
  Plus,
  X,
  Key,
  Maximize,
  ZoomIn,
  ZoomOut,
  CopyPlus,
  Palette,
  Building2,
  BoxSelect,
  Ratio,
  Layers,
  History as HistoryIcon,
  Trash2,
  ShieldCheck,
  Users,
  Brush, 
  Circle as CircleIcon,
  Square as SquareIcon,
  Eraser,
  Undo2,
  Check,
  Edit3,
  Send,
  Hand // Added Hand icon
} from 'lucide-react';

// ==========================================
// *** CẤU HÌNH FIREBASE REALTIME COUNTER ***
const firebaseConfig = {
  apiKey: "AIzaSyAEE8kkji3B4h2DQ2cO1tq4G6HjmIOLdOg",
  authDomain: "astra-kat-couter.firebaseapp.com",
  databaseURL: "https://astra-kat-couter-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "astra-kat-couter",
  storageBucket: "astra-kat-couter.firebasestorage.app",
  messagingSenderId: "46973775395",
  appId: "1:46973775395:web:e6b6859b97b63232274b96"
};

// Khởi tạo Firebase
const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// ==========================================
// *** CẤU HÌNH DRIVE (QUAN TRỌNG) ***
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbyKC7UigaUPX3kzhR3JSVA1-vxjC1wGlyDoCCELiE5f_xmmSu3-VTPD41tjPIUIRabNNA/exec'; 
// ==========================================


// --- SECURITY HELPER ---
const verifyAccess = async (key: string): Promise<boolean> => {
  if (!key) return false;
  return key.trim() === 'KAT777';
};

// --- REALTIME ONLINE COUNTER COMPONENT ---
const OnlineUserCounter: React.FC = () => {
  const [count, setCount] = useState<number>(0);

  useEffect(() => {
    const listRef = ref(db, 'online_users');
    const userRef = push(listRef);

    onDisconnect(userRef).remove();
    
    set(userRef, {
      timestamp: serverTimestamp()
    });

    const unsubscribe = onValue(listRef, (snapshot) => {
      setCount(snapshot.size || 0);
    });

    return () => {
      unsubscribe();
      set(userRef, null);
    };
  }, []);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#e2b36e]/10 border border-[#e2b36e]/30 backdrop-blur-md shadow-[0_0_15px_rgba(226,179,110,0.1)] select-none cursor-default transition-transform duration-300 hover:scale-105">
      <div className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#e2b36e] opacity-75 duration-1000"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-[#e2b36e] shadow-[0_0_5px_#e2b36e]"></span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-[#e2b36e] tracking-widest tabular-nums drop-shadow-[0_0_2px_rgba(226,179,110,0.5)]">
          {count} Online Now
        </span>
      </div>
    </div>
  );
};

// --- SUB-COMPONENT: FULL SCREEN VIEWER & EDITOR ---
const FullScreenViewer: React.FC<{ 
    src: string; 
    onClose: () => void; 
    onSaveEdit?: (newUrl: string) => void;
    isEditableType: boolean; // Controls VISIBILITY of the button (Input/Generated vs Ref)
    isGenerated: boolean; // NEW: To control Download button visibility
    onValidateAccess: () => boolean; // Callback to check auth when clicked
}> = ({ src, onClose, onSaveEdit, isEditableType, isGenerated, onValidateAccess }) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [isMiddlePanning, setIsMiddlePanning] = useState(false); // NEW STATE FOR MIDDLE MOUSE
  
  // EDIT MODE STATES
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTool, setEditTool] = useState<'brush' | 'rect' | 'circle' | 'move'>('brush'); // Added 'move' tool
  const [brushSize, setBrushSize] = useState(30); // Default larger brush
  const [editPrompt, setEditPrompt] = useState('');
  const [isEditingLoading, setIsEditingLoading] = useState(false);
  const [editAutoLoading, setEditAutoLoading] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  
  const dragStartRef = useRef({ x: 0, y: 0 });
  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // CANVAS REFS
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const snapshotRef = useRef<ImageData | null>(null);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // --- CANVAS LOGIC ---
  const initCanvas = () => {
    const img = imgRef.current;
    const canvas = canvasRef.current;
    if (img && canvas) {
      // Set canvas resolution to match natural image size for high quality
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    }
  };

  useEffect(() => {
    if (isEditMode) {
      // Removed auto-reset of zoom to allow user to keep zoom level if desired
      // if (scale !== 1) setScale(1); 
      // if (position.x !== 0 || position.y !== 0) setPosition({ x: 0, y: 0 });
      setTimeout(initCanvas, 50);
    }
  }, [isEditMode, src]);

  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return { x: 0, y: 0 };

    const rect = img.getBoundingClientRect(); // Use image rect because canvas sits exactly on top
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    setIsDrawing(true);
    const { x, y } = getCanvasCoordinates(e);
    startPosRef.current = { x, y };
    
    // Save snapshot for shape tools to avoid trails
    snapshotRef.current = ctx.getImageData(0, 0, canvas.width, canvas.height);

    if (editTool === 'brush') {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)'; // Soft white transparency for visual
      // Scale brush size relative to image display size vs actual size
      ctx.lineWidth = brushSize * (canvas.width / imgRef.current!.offsetWidth); 
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !isEditMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x, y } = getCanvasCoordinates(e);

    if (editTool === 'brush') {
      ctx.lineTo(x, y);
      ctx.stroke();
    } else if (editTool === 'rect') {
      if (snapshotRef.current) ctx.putImageData(snapshotRef.current, 0, 0);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      const width = x - startPosRef.current.x;
      const height = y - startPosRef.current.y;
      ctx.fillRect(startPosRef.current.x, startPosRef.current.y, width, height);
    } else if (editTool === 'circle') {
      if (snapshotRef.current) ctx.putImageData(snapshotRef.current, 0, 0);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.beginPath();
      const radius = Math.sqrt(Math.pow(x - startPosRef.current.x, 2) + Math.pow(y - startPosRef.current.y, 2));
      ctx.arc(startPosRef.current.x, startPosRef.current.y, radius, 0, 2 * Math.PI);
      ctx.fill();
    }
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    // Don't clear context here, we want to keep the drawing
  };

  const clearMask = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
      snapshotRef.current = null; // Also clear snapshot
    }
  };

  // --- EDIT API LOGIC ---
  const handleEditGenerate = async () => {
    if (!editPrompt.trim()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    setIsEditingLoading(true);
    try {
      // 1. Create a binary mask (Black Background, White Foreground)
      // The visual canvas is white transparent, we need a clean mask for the API
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) throw new Error("Canvas Error");

      // Fill black
      maskCtx.fillStyle = '#000000';
      maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);

      // Draw the user's drawing onto this new canvas, enforcing solid white
      const visualData = canvas.getContext('2d')?.getImageData(0, 0, canvas.width, canvas.height);
      if (visualData) {
         // Loop pixels: if alpha > 0, make it white. Else keep black.
         const data = visualData.data;
         const maskImgData = maskCtx.createImageData(canvas.width, canvas.height);
         const maskData = maskImgData.data;
         
         for(let i=0; i < data.length; i+=4) {
             const alpha = data[i+3];
             if (alpha > 10) { // If drew something (even faint)
                 maskData[i] = 255;   // R
                 maskData[i+1] = 255; // G
                 maskData[i+2] = 255; // B
                 maskData[i+3] = 255; // Alpha
             } else {
                 maskData[i] = 0;
                 maskData[i+1] = 0;
                 maskData[i+2] = 0;
                 maskData[i+3] = 255; // Opaque Black
             }
         }
         maskCtx.putImageData(maskImgData, 0, 0);
      }
      
      const maskBase64 = maskCanvas.toDataURL('image/png');

      // 2. Call API
      const editedUrl = await editCreativeAsset(src, maskBase64, editPrompt);
      if (onSaveEdit && editedUrl) {
        onSaveEdit(editedUrl);
        // Clean up UI for sequential editing
        clearMask(); // Clear the red/white drawing
        setEditPrompt(''); // Clear the prompt
      }
    } catch (e) {
      console.error(e);
      alert("Edit failed. Please try again.");
    } finally {
      setIsEditingLoading(false);
    }
  };

  const handleEditAutoPrompt = async () => {
    setEditAutoLoading(true);
    try {
        const prompt = await generatePromptFromImage([src], MediaType.STANDARD, ArchitectureStyle.NONE);
        setEditPrompt(prompt);
    } catch(e) { console.error(e); }
    finally { setEditAutoLoading(false); }
  };
  
  const handleEditEnhancePrompt = async () => {
      if(!editPrompt) return;
      setIsEnhancing(true);
      try {
          const enhanced = await enhanceUserPrompt(editPrompt, MediaType.STANDARD, ArchitectureStyle.NONE);
          setEditPrompt(enhanced);
      } catch(e) { console.error(e); }
      finally { setIsEnhancing(false); }
  };

  const handleDownload = (url: string) => {
    if (url) {
        const link = document.createElement('a');
        link.href = url;
        link.download = `astra-edit-${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  };

  // --- VIEW ZOOM LOGIC ---
  const handleZoom = (delta: number) => {
    // Zoom allowed in edit mode now
    setScale(prev => {
      const newScale = Math.min(Math.max(1, prev + delta), 5);
      if (newScale === 1) setPosition({ x: 0, y: 0 });
      return newScale;
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    // Enable zoomwheel in both modes
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    handleZoom(delta);
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    // MIDDLE MOUSE PAN SUPPORT (Button 1)
    const isMiddleClick = 'button' in e && (e as React.MouseEvent).button === 1;

    if (isMiddleClick) {
        e.preventDefault();
        setIsMiddlePanning(true);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        dragStartRef.current = { x: clientX - position.x, y: clientY - position.y };
        return; 
    }

    if (isEditMode) {
        // If 'move' tool is active, treat as panning
        if (editTool === 'move') {
            if (scale > 1) {
                setIsDragging(true);
                const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
                const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
                dragStartRef.current = { x: clientX - position.x, y: clientY - position.y };
            }
        } else {
            // Otherwise draw
            startDrawing(e);
        }
    } else {
        if (scale > 1) {
            setIsDragging(true);
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
            dragStartRef.current = { x: clientX - position.x, y: clientY - position.y };
        }
    }
  };

  const animationFrameRef = useRef<number | null>(null);

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    // PRIORITIZE MIDDLE PANNING
    if (isMiddlePanning) {
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        animationFrameRef.current = requestAnimationFrame(() => {
            setPosition({
                x: clientX - dragStartRef.current.x,
                y: clientY - dragStartRef.current.y
            });
        });
        return;
    }

    if (isEditMode && editTool !== 'move') {
        draw(e);
    } else {
        // Handling dragging for View Mode OR Edit Mode (Move Tool)
        if (isDragging && scale > 1) {
            if (e.cancelable) e.preventDefault();
            if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
            
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;

            animationFrameRef.current = requestAnimationFrame(() => {
                setPosition({
                    x: clientX - dragStartRef.current.x,
                    y: clientY - dragStartRef.current.y
                });
            });
        }
    }
  };

  const handleMouseUp = () => {
    setIsMiddlePanning(false); // Stop middle panning
    
    if (isEditMode && editTool !== 'move') {
        stopDrawing();
    } else {
        setIsDragging(false);
        if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
    }
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-[#002830]/95 flex flex-col animate-in fade-in duration-300"
      onWheel={handleWheel}
      // Only close on click if not interacting with UI
      onClick={(e) => { if (e.target === e.currentTarget && !isEditMode) onClose(); }} 
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* HEADER BAR */}
      <div className="flex-none h-16 w-full px-6 flex justify-between items-center z-50 bg-gradient-to-b from-[#002830] to-[#002830]/0 pointer-events-none">
        <div className="text-[#e2b36e]/80 text-sm flex gap-4 pointer-events-auto items-center">
            {isEditMode ? (
                <div className="flex items-center gap-2 bg-[#e2b36e]/10 px-3 py-1.5 rounded-full border border-[#e2b36e]/20 backdrop-blur-md">
                     <span className="animate-pulse w-2 h-2 rounded-full bg-red-500"></span>
                     <span className="font-bold text-[#e2b36e] tracking-wider text-xs uppercase">Edit Mode Active</span>
                </div>
            ) : (
                <>
                    <span>Scroll to Zoom</span>
                    <span>Middle Click to Pan</span>
                    <span className="hidden sm:inline opacity-50">| Press ESC to Close</span>
                </>
            )}
        </div>
        <div className="flex items-center gap-2 pointer-events-auto">
             {/* EDIT BUTTON: Visible for correct types, Checks access on Click */}
             {isEditableType && (
                 <button 
                    onClick={() => {
                        if (isEditMode) {
                            setIsEditMode(false);
                            setEditTool('brush'); // Reset to brush
                        } else {
                            // Validate access before enabling edit mode
                            if (onValidateAccess()) {
                                setIsEditMode(true);
                            }
                        }
                    }}
                    className={`p-2 rounded-full transition-all duration-300 border ${isEditMode ? 'bg-[#e2b36e] text-[#002830] border-[#e2b36e] shadow-[0_0_15px_#e2b36e]' : 'bg-[#e2b36e]/10 text-[#e2b36e] border-[#e2b36e]/20 hover:bg-[#e2b36e]/20'}`}
                    title={isEditMode ? "Exit Edit Mode" : "Edit Image"}
                 >
                    {isEditMode ? <Check className="w-6 h-6" /> : <Edit3 className="w-6 h-6" />}
                 </button>
             )}
             
             {/* CONDITIONAL DOWNLOAD BUTTON IN VIEWER */}
             {isGenerated && (
                 <button 
                    onClick={() => handleDownload(src)}
                    className="p-2 bg-[#e2b36e]/10 hover:bg-[#e2b36e]/20 rounded-full text-[#e2b36e] transition-colors border border-transparent hover:border-[#e2b36e]/30"
                    title="Download Result"
                 >
                    <Download className="w-6 h-6" />
                </button>
             )}

             <button 
                onClick={onClose}
                className="p-2 bg-[#e2b36e]/10 hover:bg-[#e2b36e]/20 rounded-full text-[#e2b36e] transition-colors border border-transparent hover:border-[#e2b36e]/30"
            >
                <X className="w-6 h-6" />
            </button>
        </div>
      </div>

      {/* EDIT TOOLBAR (FLOATING LEFT) - ONLY IF EDIT MODE ACTIVE */}
      {isEditMode && (
          <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-50 pointer-events-auto animate-in slide-in-from-left fade-in duration-300">
             <GlassCard className="p-3 flex flex-col gap-3">
                 <button onClick={() => setEditTool('move')} className={`p-2 rounded-lg transition-all relative group ${editTool === 'move' ? 'bg-[#e2b36e] text-[#002830]' : 'text-[#e2b36e] hover:bg-[#e2b36e]/10'}`} title="Move/Pan">
                    <Hand size={20} />
                 </button>
                 <div className="h-[1px] w-full bg-[#e2b36e]/20 my-1"></div>
                 <button onClick={() => setEditTool('brush')} className={`p-2 rounded-lg transition-all relative group ${editTool === 'brush' ? 'bg-[#e2b36e] text-[#002830]' : 'text-[#e2b36e] hover:bg-[#e2b36e]/10'}`} title="Brush">
                    <Brush size={20} />
                 </button>
                 
                 {/* SLIDER POPUP FOR BRUSH SIZE */}
                 {editTool === 'brush' && (
                     <div className="absolute left-full top-0 ml-3 bg-[#005060]/90 backdrop-blur-md border border-[#e2b36e]/20 rounded-lg p-3 w-32 shadow-xl animate-in slide-in-from-left-2 fade-in">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] text-[#e2b36e] uppercase font-bold">Size</span>
                            <span className="text-[10px] text-white font-mono">{brushSize}px</span>
                        </div>
                        <input 
                            type="range" 
                            min="5" 
                            max="100" 
                            value={brushSize} 
                            onChange={(e) => setBrushSize(parseInt(e.target.value))}
                            className="w-full h-1.5 bg-[#e2b36e]/20 rounded-lg appearance-none cursor-pointer accent-[#e2b36e]"
                        />
                     </div>
                 )}

                 <button onClick={() => setEditTool('rect')} className={`p-2 rounded-lg transition-all ${editTool === 'rect' ? 'bg-[#e2b36e] text-[#002830]' : 'text-[#e2b36e] hover:bg-[#e2b36e]/10'}`} title="Rectangle"><SquareIcon size={20} /></button>
                 <button onClick={() => setEditTool('circle')} className={`p-2 rounded-lg transition-all ${editTool === 'circle' ? 'bg-[#e2b36e] text-[#002830]' : 'text-[#e2b36e] hover:bg-[#e2b36e]/10'}`} title="Circle"><CircleIcon size={20} /></button>
                 <div className="h-[1px] w-full bg-[#e2b36e]/20 my-1"></div>
                 <button onClick={clearMask} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors" title="Clear Mask"><Eraser size={20} /></button>
             </GlassCard>
          </div>
      )}

      {/* MAIN CONTENT AREA - FLEX-1 TO TAKE AVAILABLE SPACE */}
      <div 
        ref={containerRef}
        className={`flex-1 w-full relative overflow-hidden flex items-center justify-center p-6 sm:p-10 ${isEditMode ? (editTool === 'move' ? 'cursor-grab active:cursor-grabbing' : 'cursor-crosshair') : 'cursor-move'}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleMouseDown}
        onTouchMove={handleMouseMove}
        onTouchEnd={handleMouseUp}
        onClick={(e) => e.stopPropagation()} 
      >
        <img 
          ref={imgRef}
          src={src} 
          alt="Full Screen Preview"
          style={{ 
            transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`, 
            transition: (isDragging || isDrawing || isMiddlePanning) ? 'none' : 'transform 0.2s ease-out',
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain'
          }}
          className="select-none pointer-events-auto will-change-transform shadow-2xl"
          draggable={false}
        />
        {/* CANVAS OVERLAY FOR MASKING */}
        <canvas 
            ref={canvasRef}
            className={`absolute pointer-events-none will-change-transform ${!isEditMode && 'hidden'}`}
            style={{
                transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
                width: imgRef.current?.getBoundingClientRect().width || 'auto',
                height: imgRef.current?.getBoundingClientRect().height || 'auto',
                transition: (isDragging || isDrawing || isMiddlePanning) ? 'none' : 'transform 0.2s ease-out',
            }}
        />
      </div>

      {/* BOTTOM CONTROLS (ZOOM OR PROMPT) - FIXED AT BOTTOM, NO OVERLAP */}
      <div className="flex-none w-full flex justify-center pb-6 pt-2 bg-gradient-to-t from-[#002830] via-[#002830] to-transparent z-50 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
         {!isEditMode ? (
            /* VIEW MODE CONTROLS */
            <div className="flex items-center gap-4 bg-[#005060]/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-[#e2b36e]/20 shadow-[0_0_20px_rgba(226,179,110,0.1)]">
                <button onClick={() => handleZoom(-0.5)} className="p-2 hover:bg-[#e2b36e]/10 rounded-lg text-[#e2b36e] disabled:opacity-30" disabled={scale <= 1}><ZoomOut className="w-5 h-5" /></button>
                <span className="text-[#e2b36e] font-mono min-w-[3ch] text-center font-bold">{Math.round(scale * 100)}%</span>
                <button onClick={() => handleZoom(0.5)} className="p-2 hover:bg-[#e2b36e]/10 rounded-lg text-[#e2b36e] disabled:opacity-30" disabled={scale >= 5}><ZoomIn className="w-5 h-5" /></button>
            </div>
         ) : (
             /* EDIT MODE PROMPT BAR */
             <GlassCard className="p-0 flex flex-col gap-0 w-[800px] max-w-[95vw] animate-in slide-in-from-bottom fade-in duration-300 relative overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)]">
                  <div className="relative w-full h-32">
                      <textarea 
                        value={editPrompt}
                        onChange={(e) => setEditPrompt(e.target.value)}
                        placeholder="Describe what to change in the highlighted area..."
                        className="w-full h-full bg-[#e2b36e]/5 hover:bg-[#e2b36e]/10 focus:bg-[#e2b36e]/10 transition-colors border-none rounded-t-xl px-4 py-3 text-sm text-[#e2b36e] placeholder-[#e2b36e]/40 focus:outline-none resize-none custom-scrollbar"
                        onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditGenerate(); }}}
                      />
                      {/* CONDITIONAL BUTTONS: AUTO or ENHANCE */}
                      <div className="absolute left-3 bottom-3 flex gap-2 z-10">
                          {!editPrompt.trim() ? (
                              <button 
                                onClick={handleEditAutoPrompt} 
                                disabled={editAutoLoading} 
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-lg border border-[#e2b36e]/30 ${editAutoLoading ? 'bg-[#005060] text-[#e2b36e] cursor-wait' : 'bg-[#e2b36e]/20 text-[#e2b36e] hover:bg-[#e2b36e]/30'}`}
                              >
                                  <Sparkles size={12} className={editAutoLoading ? "animate-spin" : ""} />
                                  {editAutoLoading ? 'Reading...' : 'Auto Prompt'}
                              </button>
                          ) : (
                              <button 
                                onClick={handleEditEnhancePrompt} 
                                disabled={isEnhancing} 
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${isEnhancing ? 'bg-slate-900 border border-white/10 text-white/30 cursor-wait' : 'bg-[#005060] border border-[#e2b36e]/30 text-[#e2b36e] shadow-[0_0_15px_rgba(226,179,110,0.2)] hover:shadow-[0_0_25px_rgba(226,179,110,0.4)] hover:bg-[#003b46]'}`}
                              >
                                  <Wand2 size={12} className={isEnhancing ? "animate-spin" : "fill-[#e2b36e]/50"} />
                                  {isEnhancing ? 'Enhancing...' : 'Enhance'}
                              </button>
                          )}
                      </div>
                      
                      {/* GENERATE BUTTON - STAR ICON */}
                      <div className="absolute right-3 bottom-3 z-10">
                           <Button 
                                onClick={handleEditGenerate} 
                                isLoading={isEditingLoading}
                                variant="rainbow"
                                className="py-2 px-6 text-xs font-bold flex items-center gap-2"
                            >
                                {/* 4-Pointed Star Icon Inline - Updated to Katinat Gold */}
                                <svg width="16" height="16" viewBox="0 0 100 100" className="fill-current text-[#e2b36e]">
                                   <path d="M 50 0 C 50 35 60 45 100 50 C 60 55 50 65 50 100 C 50 65 40 55 0 50 C 40 45 50 35 50 0 Z" />
                                </svg>
                                {isEditingLoading ? "..." : "Generate"}
                            </Button>
                      </div>
                  </div>
             </GlassCard>
         )}
      </div>

      {/* SUB-COMPONENT DEFINITIONS FOR APP */}
    </div>
  );
};

// --- SUB-COMPONENTS: RatioIcon & AILoader ---

const RatioIcon: React.FC<{ ratio: string }> = ({ ratio }) => {
  let width = 14;
  let height = 14;

  switch(ratio) {
      case '16:9': width = 18; height = 10; break;
      case '9:16': width = 10; height = 18; break;
      case '4:3': width = 16; height = 12; break;
      case '3:4': width = 12; height = 16; break;
      case '1:1': width = 14; height = 14; break;
  }

  return (
    <div className="w-5 h-5 flex items-center justify-center opacity-80">
       <div 
         className="border border-current"
         style={{ width: `${width}px`, height: `${height}px` }}
       />
    </div>
  );
};

const AILoader: React.FC<{ progress: number; small?: boolean }> = ({ progress, small }) => {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 z-10 ${small ? 'scale-75' : 'scale-100'}`}>
      <div className="relative flex items-center justify-center">
         {/* Glow Effect - Gold/Brown */}
         <div className="absolute inset-0 bg-[#e2b36e]/40 blur-xl rounded-full animate-pulse"></div>
         
         {/* 4-Pointed Star SVG - ASTRA Theme - Increased size to 80x80 */}
         <svg 
            width="80" 
            height="80" 
            viewBox="0 0 100 100" 
            className="animate-pulse drop-shadow-[0_0_10px_rgba(226,179,110,0.8)]"
            xmlns="http://www.w3.org/2000/svg"
         >
             <defs>
                <linearGradient id="starGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#b28e67" /> {/* Dark Gold/Brown */}
                    <stop offset="100%" stopColor="#ffebcd" /> {/* Light Gold/White */}
                </linearGradient>
            </defs>
            <path 
                d="M 50 0 C 50 35 60 45 100 50 C 60 55 50 65 50 100 C 50 65 40 55 0 50 C 40 45 50 35 50 0 Z" 
                fill="url(#starGradient)" 
                stroke="rgba(255,255,255,0.9)"
                strokeWidth="1.5"
                strokeLinejoin="round"
            />
         </svg>
      </div>
      
      {/* Percentage - Increased to text-2xl */}
      <div className="text-center mt-3">
          <span className="block text-[#e2b36e] font-mono font-bold text-2xl leading-none">{Math.round(progress)}%</span>
      </div>
    </div>
  );
};

// --- MAIN APP COMPONENT ---
const App: React.FC = () => {
  const [prompt, setPrompt] = useState('');
  const [accessKey, setAccessKey] = useState(''); // Hidden Access Key state
  
  // Use the global constant
  const [driveScriptUrl] = useState(GOOGLE_SCRIPT_URL);

  const [selectedType, setSelectedType] = useState<MediaType>(MediaType.NONE);
  const [selectedArchStyle, setSelectedArchStyle] = useState<ArchitectureStyle>(ArchitectureStyle.NONE);
  
  const [selectedAspectRatio, setSelectedAspectRatio] = useState<string>(''); 
  const [imageCount, setImageCount] = useState<number>(0);
  const [selectedQuality, setSelectedQuality] = useState<ImageQuality>(ImageQuality.AUTO);
  const [isQualitySet, setIsQualitySet] = useState(false); 

  // --- AUTO-SELECT STATE TRACKING ---
  const [isRatioAuto, setIsRatioAuto] = useState(false);
  const [isCountAuto, setIsCountAuto] = useState(false);
  const [isQualityAuto, setIsQualityAuto] = useState(false);
  
  const [generatedImages, setGeneratedImages] = useState<(string | null)[]>([]);
  
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

  // Dropdown Refs
  const typeDropdownRef = useRef<HTMLDivElement>(null);
  const archDropdownRef = useRef<HTMLDivElement>(null);
  const ratioDropdownRef = useRef<HTMLDivElement>(null);
  const countDropdownRef = useRef<HTMLDivElement>(null);
  const qualityDropdownRef = useRef<HTMLDivElement>(null);
  const inputInputRef = useRef<HTMLInputElement>(null);
  const refInputRef = useRef<HTMLInputElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  
  // Dropdown States
  const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
  const [isArchDropdownOpen, setIsArchDropdownOpen] = useState(false);
  const [isRatioDropdownOpen, setIsRatioDropdownOpen] = useState(false);
  const [isCountDropdownOpen, setIsCountDropdownOpen] = useState(false);
  const [isQualityDropdownOpen, setIsQualityDropdownOpen] = useState(false);

  const abortControllerRef = useRef<AbortController | null>(null);
  const [draggingItem, setDraggingItem] = useState<any | null>(null);

  // --- SECURITY: REACT INTEGRITY CHECK ---
  useEffect(() => {
    const checkSecurity = () => {
      const securityScript = document.getElementById('x-security-core');
      if (!securityScript) {
        setSecurityTampered(true); 
      }
    };
    checkSecurity();
  }, []);

  if (securityTampered) {
    return <div className="h-screen w-full bg-black flex items-center justify-center text-red-600 font-bold text-3xl">System Integrity Compromised</div>;
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (typeDropdownRef.current && !typeDropdownRef.current.contains(event.target as Node)) setIsTypeDropdownOpen(false);
      if (archDropdownRef.current && !archDropdownRef.current.contains(event.target as Node)) setIsArchDropdownOpen(false);
      if (ratioDropdownRef.current && !ratioDropdownRef.current.contains(event.target as Node)) setIsRatioDropdownOpen(false);
      if (countDropdownRef.current && !countDropdownRef.current.contains(event.target as Node)) setIsCountDropdownOpen(false);
      if (qualityDropdownRef.current && !qualityDropdownRef.current.contains(event.target as Node)) setIsQualityDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    checkApiKey();
  }, []);

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
      const timer = setTimeout(() => setError(null), 5000);
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
        reader.readAsDataURL(file as Blob);
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
    const allContextImages = [...inputImages, ...referenceImages];
    if (allContextImages.length === 0) return;
    if (!hasApiKey) { await handleApiKeySelect(); if (!hasApiKey) return; }
    setIsAutoPrompting(true);
    try {
      let typeForPrompt = selectedType;
      if (selectedType === MediaType.NONE && selectedArchStyle === ArchitectureStyle.NONE) typeForPrompt = MediaType.STANDARD;
      const suggestion = await generatePromptFromImage(allContextImages, typeForPrompt, selectedArchStyle);
      setPrompt(suggestion);
    } catch (err) { setError("Could not generate auto-prompt. Check API key."); } 
    finally { setIsAutoPrompting(false); }
  };

  const handleEnhancePrompt = async () => {
    if (!prompt.trim()) return;
    if (!hasApiKey) { await handleApiKeySelect(); if (!hasApiKey) return; }
    setIsEnhancing(true);
    try {
      const enhanced = await enhanceUserPrompt(prompt, selectedType, selectedArchStyle);
      setPrompt(enhanced);
    } catch (err) { setError("Could not enhance prompt."); } 
    finally { setIsEnhancing(false); }
  };

  const handleStop = () => { if (abortControllerRef.current) { abortControllerRef.current.abort(); setLoading(false); setError("Generation stopped by user."); setProgress(0); } };

  // --- REAL BACKGROUND DRIVE UPLOAD (Using Apps Script) ---
  const uploadToDrive = async (base64Image: string, promptText: string) => {
    if (!driveScriptUrl) return; // Silent exit if no script url provided
    
    // We use 'no-cors' mode to trigger the request fire-and-forget style
    // The Apps Script must be deployed as "Web App" -> "Execute as: Me" -> "Who has access: Anyone"
    try {
       const cleanBase64 = base64Image.split(',')[1]; // Remove data:image/png;base64 prefix
       const filename = `Astra_${Date.now()}_${promptText.substring(0, 10).replace(/[^a-z0-9]/gi, '_')}.png`;

       // SILENT UPLOAD: No console logs, fire and forget
       await fetch(driveScriptUrl, {
           method: "POST",
           mode: "no-cors", 
           headers: {
               "Content-Type": "text/plain" // Apps Script deals better with plain text body in simple POSTs
           },
           body: JSON.stringify({
               image: cleanBase64,
               filename: filename,
               // Folder date logic is handled by the script
           })
       });
    } catch (e) {
       // Silent failure - do not alert user
    }
  };

  const handleGenerate = async () => {
    // REAL HASH CHECK LOGIC UPDATE
    
    // 1. Check if Key exists
    if (!accessKey || !accessKey.trim()) {
        setError("Access Denied: Please enter System Node Key");
        return;
    }

    // 2. Validate Key
    const isAccessValid = await verifyAccess(accessKey);
    
    if (!isAccessValid) {
      setError("Invalid Access Code");
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
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setLoading(true);
    setError(null);
    setProgress(0);

    const effectiveAspectRatio = selectedAspectRatio || '1:1';
    const effectiveCount = imageCount || 1;
    if (imageCount === 0) setImageCount(1);
    setGeneratedImages(Array(effectiveCount).fill(null));

    try {
      const imageUrls = await generateCreativeAsset(prompt, selectedType, effectiveAspectRatio, effectiveCount, inputImages, referenceImages, selectedArchStyle, selectedQuality, controller.signal, (url, index) => {
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
        timestamp: Date.now()
      }));
      setHistory(prev => [...newRecords, ...prev]);

      // --- TRIGGER REAL BACKGROUND UPLOAD ---
      // We iterate through all generated URLs and upload them
      imageUrls.forEach(url => {
          uploadToDrive(url, prompt);
      });

    } catch (err: any) {
      if (err.name === 'AbortError' || err.message === 'Aborted') return;
      let msg = `${err.message || "Could not generate images."}`;
      if (err.message && (err.message.includes('503') || err.message.includes('500'))) {
         msg = "System is currently overloaded (503). Retrying automatically failed. Please try again in a moment.";
      }
      setError(msg);
    } finally {
      if (!abortControllerRef.current?.signal.aborted) setProgress(100);
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleDownload = (url: string) => {
    if (url) {
      const link = document.createElement('a');
      link.href = url;
      link.download = `astra-design-${Date.now()}.png`;
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
  const handleArchSelect = (style: ArchitectureStyle) => { setSelectedArchStyle(style); setSelectedType(MediaType.NONE); setIsArchDropdownOpen(false); };

  const isGraphicModeActive = selectedType !== MediaType.NONE;
  const isArchModeActive = selectedArchStyle !== ArchitectureStyle.NONE;
  const isRatioActive = selectedAspectRatio !== '';
  const isCountActive = imageCount !== 0;
  const isQualityActive = isQualitySet; 

  // Updated Active Style to Teal/Gold
  const activeButtonStyle = "bg-[#005060]/30 border-[#e2b36e] text-[#e2b36e] shadow-[0_0_15px_rgba(226,179,110,0.2)] ring-1 ring-[#e2b36e]/40";
  const inactiveButtonStyle = "bg-[#e2b36e]/5 border-[#e2b36e]/10 hover:bg-[#e2b36e]/10 text-[#e2b36e]/60";
  
  // --- NEW SECURITY HANDLER FOR EDIT BUTTON CLICK ---
  const handleValidateAccess = (): boolean => {
    if (!accessKey.trim()) {
        setError("Access Denied: Please enter System Node Key");
        return false;
    }
    if (accessKey.trim() !== 'KAT777') {
        setError("Invalid Access Code");
        return false;
    }
    return true;
  };

  return (
    <div className="min-h-screen w-full relative bg-[#005060] selection:bg-[#e2b36e] selection:text-[#005060] flex flex-col">
      {previewImage && (
        <FullScreenViewer 
            src={previewImage} 
            onClose={() => setPreviewImage(null)} 
            // Pass generated state correctly for download button
            isGenerated={previewSource === 'generated'}
            // Only show edit button if NOT a reference.
            isEditableType={previewSource !== 'ref'}
            onValidateAccess={handleValidateAccess}
            onSaveEdit={(newUrl) => {
                setPreviewImage(newUrl); 
                setPreviewSource('generated'); 
                setGeneratedImages(prev => [...prev, newUrl]); 
                const newRecord: GeneratedImage = {
                    id: Date.now().toString(),
                    url: newUrl,
                    prompt: "Edited Image",
                    type: MediaType.STANDARD,
                    timestamp: Date.now()
                };
                setHistory(prev => [newRecord, ...prev]);
                uploadToDrive(newUrl, "Edited_Image");
            }}
        />
      )}

      {/* ERROR TOAST */}
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

      {/* BACKGROUND UPDATE - KATINAT COLORS */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none transform-gpu translate-z-0">
        <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-[#125d6e] via-[#005060] to-[#003b46] blur-[120px] opacity-40 will-change-transform"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[70%] h-[70%] rounded-full bg-gradient-to-tl from-[#e2b36e] via-[#b28e67] to-[#005060] blur-[120px] opacity-20 will-change-transform"></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-full bg-black/40 blur-[80px]"></div>
        <div className="absolute inset-0 backdrop-blur-[60px]"></div>
        <div className="absolute inset-0 z-0 opacity-50 mix-blend-overlay" style={{backgroundImage: `repeating-linear-gradient(90deg,rgba(255,255,255,0) 0px,rgba(255,255,255,0.1) 10px,rgba(255,255,255,0.2) 15px,rgba(255,255,255,0.1) 20px,rgba(255,255,255,0) 30px,rgba(0,0,0,0.2) 40px,rgba(0,0,0,0.5) 45px,rgba(0,0,0,0.2) 50px,rgba(0,0,0,0) 60px)`}}></div>
        <div className="absolute inset-0 opacity-[0.07] bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] mix-blend-screen"></div>
        <div className="absolute inset-0 bg-radial-gradient from-transparent via-transparent to-black/80"></div>
      </div>

      <header className="flex-none h-24 flex items-center justify-center mb-0 z-20 select-none">
          {/* Reduced side padding to make content wider */}
          <div className="w-full max-w-[1920px] mx-auto px-6 md:px-12 lg:px-20 xl:px-28 flex items-center gap-3">
              <div className="relative h-16 w-auto flex-none">
                   <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(226,179,10,0.15)_0%,_transparent_70%)] blur-xl"></div>
                   <img 
                    src="https://drive.google.com/thumbnail?id=1LgeMCeo2P5G2ex6Vo9ONZMBVgEA9kGGR&sz=w500" 
                    alt="ASTRA Logo"
                    className="h-full w-auto object-contain relative z-10 drop-shadow-[0_0_15px_rgba(226,179,110,0.2)]"
                    onContextMenu={(e) => e.preventDefault()}
                    draggable={false}
                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                  />
              </div>
              <div className="flex flex-col justify-center">
                  <h1 className="text-4xl font-black text-white tracking-tighter leading-none uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]">ASTRA</h1>
                  <p className="text-[0.6rem] font-bold tracking-[0.4em] uppercase text-white/50 pl-0.5 leading-none mt-1.5">Creatives from the stars</p>
              </div>
          </div>
      </header>

      {/* MAIN CONTAINER: Decreased padding to reduce empty space on sides */}
      {/* New padding: px-6 md:px-12 lg:px-20 xl:px-28 */}
      <div className="flex-1 w-full max-w-[1920px] mx-auto px-6 md:px-12 lg:px-20 xl:px-28 flex flex-col lg:flex-row gap-16 relative z-10 h-auto">
          
          {/* LEFT TOOL COLUMN: Reduced min-h to 80vh */}
          <GlassCard className="w-full lg:w-[360px] xl:w-[420px] shrink-0 flex-none flex flex-col p-5 lg:p-6 min-h-[80vh]">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6 flex-none">
                   <div className="relative" ref={typeDropdownRef}>
                    <label className={`block text-xs font-semibold mb-1.5 flex items-center gap-1.5 transition-colors duration-300 ${isGraphicModeActive ? 'text-[#e2b36e] drop-shadow-[0_0_8px_rgba(226,179,110,0.5)]' : 'text-[#e2b36e]/60'}`}><Palette size={12} /> Graphic Design Mode</label>
                    <button onClick={() => setIsTypeDropdownOpen(!isTypeDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all duration-300 ${isGraphicModeActive ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate"><span className="truncate text-sm font-medium">{selectedType === MediaType.NONE ? 'Select Type' : selectedType}</span></div><ChevronDown size={14} className={isGraphicModeActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/30'} /></button>
                    {isTypeDropdownOpen && (
                      <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#003b46]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden max-h-60 overflow-y-auto p-1">
                        {Object.values(MediaType).filter(type => type !== MediaType.NONE).map((type) => (<button key={type} onClick={() => handleTypeSelect(type)} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm ${selectedType === type && isGraphicModeActive ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/60 hover:bg-[#e2b36e]/10'}`}>{getTypeIcon(type)} <span>{type}</span></button>))}
                      </div>
                    )}
                   </div>
                   <div className="relative" ref={archDropdownRef}>
                    <label className={`block text-xs font-semibold mb-1.5 flex items-center gap-1.5 transition-colors duration-300 ${isArchModeActive ? 'text-[#e2b36e] drop-shadow-[0_0_8px_rgba(226,179,110,0.5)]' : 'text-[#e2b36e]/60'}`}><Building2 size={12} /> Architecture Render Mode</label>
                    <button onClick={() => setIsArchDropdownOpen(!isArchDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all duration-300 ${isArchModeActive ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate"><span className="truncate text-sm font-medium">{selectedArchStyle === ArchitectureStyle.NONE ? 'Select Style' : selectedArchStyle}</span></div><ChevronDown size={14} className={isArchModeActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/30'} /></button>
                    {isArchDropdownOpen && (
                      <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#003b46]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden max-h-60 overflow-y-auto p-1">
                        {Object.values(ArchitectureStyle).filter(style => style !== ArchitectureStyle.NONE).map((style) => (<button key={style} onClick={() => handleArchSelect(style)} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm ${selectedArchStyle === style ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/60 hover:bg-[#e2b36e]/10'}`}><span className={`w-1.5 h-1.5 rounded-full ${selectedArchStyle === style ? 'bg-[#e2b36e]' : 'bg-[#e2b36e]/20'}`} /> <span className="truncate">{style}</span></button>))}
                      </div>
                    )}
                   </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mb-6 flex-none">
                  <div className="relative" ref={ratioDropdownRef}>
                     <label className={`block text-[10px] font-semibold mb-1.5 flex items-center gap-1.5 truncate ${isRatioActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/60'}`}><Ratio size={10} /> Ratio</label>
                     <button onClick={() => setIsRatioDropdownOpen(!isRatioDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all ${isRatioActive ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate">{isRatioActive && <RatioIcon ratio={selectedAspectRatio} />}<span className="truncate text-sm font-medium">{isRatioActive ? ASPECT_RATIOS.find(r => r.value === selectedAspectRatio)?.label : 'Select'}</span></div><ChevronDown size={14} className={isRatioActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/30'} /></button>
                      {isRatioDropdownOpen && (
                        <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#003b46]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden p-1 min-w-[120px]">{ASPECT_RATIOS.map((ratio) => (<button key={ratio.value} onClick={() => { setSelectedAspectRatio(ratio.value); setIsRatioAuto(false); setIsRatioDropdownOpen(false); }} className={`w-full p-2 rounded flex items-center justify-between gap-2 text-left text-sm ${selectedAspectRatio === ratio.value ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/60 hover:bg-[#e2b36e]/10'}`}><div className="flex items-center gap-2"><RatioIcon ratio={ratio.value} /><span>{ratio.label}</span></div></button>))}</div>
                      )}
                  </div>
                  <div className="relative" ref={countDropdownRef}>
                     <label className={`block text-[10px] font-semibold mb-1.5 flex items-center gap-1.5 truncate ${isCountActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/60'}`}><Layers size={10} /> Count</label>
                     <button onClick={() => setIsCountDropdownOpen(!isCountDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all ${isCountActive ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate"><span className="truncate text-sm font-medium">{isCountActive ? `${imageCount}` : 'Select'}</span></div><ChevronDown size={14} className={isCountActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/30'} /></button>
                      {isCountDropdownOpen && (
                        <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#003b46]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden p-1 min-w-[100px]">{[1, 2, 4].map((count) => (<button key={count} onClick={() => { setImageCount(count); setIsCountAuto(false); setIsCountDropdownOpen(false); }} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm ${imageCount === count ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/60 hover:bg-[#e2b36e]/10'}`}><span className="font-bold">{count}</span><span className="opacity-70">Image{count > 1 ? 's' : ''}</span></button>))}</div>
                      )}
                  </div>
                  <div className="relative" ref={qualityDropdownRef}>
                     <label className={`block text-[10px] font-semibold mb-1.5 flex items-center gap-1.5 truncate ${isQualityActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/60'}`}><Sparkles size={10} /> Quality</label>
                     <button onClick={() => setIsQualityDropdownOpen(!isQualityDropdownOpen)} className={`w-full p-3 rounded-lg flex items-center justify-between border transition-all ${isQualityActive ? activeButtonStyle : inactiveButtonStyle}`}><div className="flex items-center gap-2 truncate"><span className="truncate text-sm font-medium">{!isQualitySet ? 'Select' : selectedQuality}</span></div><ChevronDown size={14} className={isQualityActive ? 'text-[#e2b36e]' : 'text-[#e2b36e]/30'} /></button>
                      {isQualityDropdownOpen && (
                        <div className="absolute top-full left-0 w-full mt-1 z-50 bg-[#003b46]/95 backdrop-blur-xl border border-[#e2b36e]/20 rounded-lg shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden p-1 min-w-[120px]">{Object.values(ImageQuality).map((q) => (<button key={q} onClick={() => { setSelectedQuality(q); setIsQualitySet(true); setIsQualityAuto(false); setIsQualityDropdownOpen(false); }} className={`w-full p-2 rounded flex items-center gap-2 text-left text-sm ${selectedQuality === q ? 'bg-[#e2b36e]/20 text-[#e2b36e] font-bold' : 'text-[#e2b36e]/60 hover:bg-[#e2b36e]/10'}`}><span className="font-medium">{q}</span></button>))}</div>
                      )}
                  </div>
                </div>

                <div className="flex flex-col gap-4 mb-6 mt-4 flex-none">
                   <div className={`border border-dashed rounded-lg p-2.5 transition-colors flex flex-col h-32 overflow-hidden ${draggingItem?.type === 'input' ? 'border-[#e2b36e] bg-[#e2b36e]/10' : 'border-[#e2b36e]/20 bg-[#e2b36e]/5'}`} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, 'reference')}>
                    <div className="flex items-center justify-between mb-1"><label className="text-xs font-medium text-[#e2b36e] flex items-center gap-1.5"><CopyPlus size={12} /> References</label><span className="text-[10px] text-[#e2b36e]/50">{referenceImages.length}/20</span></div>
                    <div className="flex flex-wrap gap-2 overflow-y-auto custom-scrollbar flex-1 content-start p-1 -m-1 pl-2 pt-2 pr-2"><button onClick={() => refInputRef.current?.click()} disabled={referenceImages.length >= 20} className={`h-14 w-14 flex-none rounded border border-dashed flex items-center justify-center transition-all ${referenceImages.length >= 20 ? 'opacity-50 cursor-not-allowed' : 'border-[#e2b36e]/30 text-[#e2b36e] hover:bg-[#e2b36e]/10'}`}><Plus size={20} /></button><input type="file" ref={refInputRef} className="hidden" onChange={handleRefUpload} accept="image/*" multiple />{referenceImages.map((img, index) => (<div key={`ref-${index}`} className="relative group h-14 w-14 flex-none cursor-move" draggable onDragStart={(e) => handleDragStart(e, 'reference', index)}><div className="h-full w-full rounded overflow-hidden border border-[#e2b36e]/30 relative"><img src={img} alt={`Ref ${index}`} className="h-full w-full object-cover select-none" draggable={false} /><div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); setPreviewImage(img); setPreviewSource('ref'); }} className="p-1 hover:text-[#e2b36e] text-white transition-colors drop-shadow-md" title="View Fullscreen"><Maximize size={16} /></button></div></div><button onClick={(e) => { e.stopPropagation(); removeImage('ref', index); }} className="absolute -top-2 -right-2 p-1 bg-red-500 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 scale-90 hover:scale-100 w-6 h-6 flex items-center justify-center" title="Remove"><X size={14} /></button></div>))}</div>
                    <div className="mt-1 text-[10px] text-[#e2b36e]/40 text-center italic select-none">Drag Input Images here to use as Reference</div>
                  </div>
                  <div className={`border border-dashed rounded-lg p-2.5 transition-colors flex flex-col h-32 overflow-hidden ${draggingItem?.type === 'input' ? 'border-[#e2b36e] bg-[#e2b36e]/10' : 'border-[#e2b36e]/20 bg-[#e2b36e]/5'}`} onDragOver={handleDragOver} onDrop={(e) => handleDrop(e, 'input')}>
                    <div className="flex items-center justify-between mb-1"><label className="text-xs font-medium text-[#e2b36e] flex items-center gap-1.5"><ImageIcon size={12} /> {isArchModeActive ? 'Input Sketch' : 'Input Image'}</label><span className="text-[10px] text-[#e2b36e]/50">{inputImages.length}/10</span></div>
                    <div className="flex flex-wrap gap-2 overflow-y-auto custom-scrollbar flex-1 content-start p-1 -m-1 pl-2 pt-2 pr-2"><button onClick={() => inputInputRef.current?.click()} disabled={inputImages.length >= 10} className={`h-14 w-14 flex-none rounded border border-dashed flex items-center justify-center transition-all ${inputImages.length >= 10 ? 'opacity-50 cursor-not-allowed' : 'border-[#e2b36e]/30 text-[#e2b36e] hover:bg-[#e2b36e]/10'}`}><Plus size={20} /></button><input type="file" ref={inputInputRef} className="hidden" onChange={handleInputUpload} accept="image/*" multiple />{inputImages.map((img, index) => (<div key={`input-${index}`} className="relative group h-14 w-14 flex-none cursor-move" draggable onDragStart={(e) => handleDragStart(e, 'input', index)}><div className="h-full w-full rounded overflow-hidden border border-[#e2b36e]/30 relative"><img src={img} alt={`Input ${index}`} className="h-full w-full object-cover select-none" draggable={false} /><div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={(e) => { e.stopPropagation(); setPreviewImage(img); setPreviewSource('input'); }} className="p-1 hover:text-[#e2b36e] text-white transition-colors drop-shadow-md" title="View Fullscreen"><Maximize size={16} /></button></div></div><button onClick={(e) => { e.stopPropagation(); removeImage('input', index); }} className="absolute -top-2 -right-2 p-1 bg-red-500 hover:bg-red-600 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity shadow-sm z-10 scale-90 hover:scale-100 w-6 h-6 flex items-center justify-center" title="Remove"><X size={14} /></button></div>))}</div>
                    <div className="mt-1 text-[10px] text-[#e2b36e]/40 text-center italic select-none">Drag Refs here to use as Base</div>
                  </div>
                </div>

                <div className="flex-1 flex flex-col gap-2 mb-6 min-h-[120px] mt-auto">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-semibold text-[#e2b36e]">Prompt</label>
                    {(inputImages.length > 0 || referenceImages.length > 0) && (
                        <button onClick={handleAutoPrompt} disabled={isAutoPrompting} className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all shadow-lg ${isAutoPrompting ? 'bg-[#005060] text-[#e2b36e] cursor-wait' : 'bg-[#e2b36e]/20 text-[#e2b36e] border border-[#e2b36e]/30 hover:bg-[#e2b36e]/30'}`}><Sparkles size={10} className={isAutoPrompting ? "animate-spin" : ""} />{isAutoPrompting ? 'Reading...' : 'Auto Prompt'}</button>
                    )}
                  </div>
                  <div className="relative flex-1">
                    <textarea ref={textAreaRef} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={isArchModeActive ? "Describe the materials, lighting... Paste images here to upload!" : "Describe your concept... Paste images here directly!"} className="w-full h-full bg-[#e2b36e]/5 border border-[#e2b36e]/10 rounded-lg p-3 text-[#e2b36e] placeholder-[#e2b36e]/30 focus:outline-none focus:ring-2 focus:ring-[#e2b36e]/50 resize-none text-sm leading-relaxed custom-scrollbar pb-8" />
                    {prompt.trim() && (
                      <button onClick={handleEnhancePrompt} disabled={isEnhancing} className={`absolute bottom-3 right-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 z-10 ${isEnhancing ? 'bg-slate-900 border border-white/10 text-white/30 cursor-wait shadow-none' : 'bg-[#005060] border border-[#e2b36e]/30 text-[#e2b36e] shadow-[0_0_15px_rgba(226,179,110,0.2)] hover:shadow-[0_0_25px_rgba(226,179,110,0.4)] hover:bg-[#003b46]'}`}><Wand2 size={11} className={isEnhancing ? "animate-spin" : "fill-[#e2b36e]/50"} />{isEnhancing ? 'Enhancing...' : 'Enhance'}</button>
                    )}
                  </div>
                </div>

                {/* HIDDEN ACCESS KEY & DRIVE CONFIG */}
                <div className="flex-none mb-6">
                    <div className="flex items-center gap-2 mb-1.5">
                       <ShieldCheck size={11} className="text-[#e2b36e]/40" />
                       <span className="text-[10px] font-bold uppercase tracking-widest text-[#e2b36e]/40">System Node Access</span>
                    </div>
                    <div className="flex flex-col gap-2">
                        <input 
                          type="password" 
                          value={accessKey}
                          onChange={(e) => setAccessKey(e.target.value)}
                          placeholder="••••••••••"
                          className="w-full bg-[#e2b36e]/5 border border-[#e2b36e]/10 rounded-lg px-3 py-2 text-sm text-[#e2b36e] focus:outline-none focus:border-[#e2b36e]/30 transition-colors placeholder-[#e2b36e]/10"
                        />
                    </div>
                </div>
              
                <div className="flex justify-center flex-none">
                    {!hasApiKey ? (
                       <Button onClick={handleApiKeySelect} className="w-full py-4 text-base font-bold tracking-wide"><Key className="w-4 h-4" /> Connect Gemini</Button>
                    ) : (
                      <div className="w-full flex justify-center">
                         <Button
                            onClick={loading ? handleStop : handleGenerate}
                            variant={loading ? "rainbow-stop" : "rainbow"}
                            isLoading={loading}
                            disabled={!loading && (!prompt && inputImages.length === 0 && referenceImages.length === 0)}
                            className="w-[90%] py-3 text-sm xl:text-base font-bold tracking-wide shadow-2xl disabled:opacity-100 disabled:filter-none hover:scale-105 active:scale-95 transition-transform duration-200 whitespace-nowrap"
                         >
                            {loading ? (<><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" className="mr-2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>STOP</>) : (<>
                                {/* REPLACED SVG WITH 4-POINTED STAR */}
                                <svg width="20" height="20" viewBox="0 0 100 100" className="w-5 h-5 mr-2 text-[#e2b36e] fill-current">
                                   <path d="M 50 0 C 50 35 60 45 100 50 C 60 55 50 65 50 100 C 50 65 40 55 0 50 C 40 45 50 35 50 0 Z" />
                                </svg>
                                {isArchModeActive ? 'Render Architecture' : 'Generate Design'}
                            </>)}
                         </Button>
                      </div>
                    )}
                </div>
          </GlassCard>

          <div className="w-full lg:flex-1 h-auto flex flex-col gap-6 min-w-0">
              {/* RESULT AREA: Reduced min-h to 60vh */}
              <GlassCard className="flex-1 w-full flex flex-col relative overflow-hidden min-h-[60vh] shrink-0">
                  <div className="absolute top-0 left-0 w-40 h-40 pointer-events-none rounded-tl-2xl border-t-[1px] border-l-[1px] border-[#e2b36e]/40 shadow-[0_0_30px_rgba(226,179,110,0.2)]" style={{maskImage: 'radial-gradient(circle at top left, black 0%, transparent 80%)', WebkitMaskImage: 'radial-gradient(circle at top left, black 0%, transparent 80%)'}}></div>
                  <div className="absolute bottom-0 right-0 w-40 h-40 pointer-events-none rounded-br-2xl border-b-[1px] border-r-[1px] border-[#e2b36e]/40 shadow-[0_0_30px_rgba(226,179,110,0.2)]" style={{maskImage: 'radial-gradient(circle at bottom right, black 0%, transparent 80%)', WebkitMaskImage: 'radial-gradient(circle at bottom right, black 0%, transparent 80%)'}}></div>
                  <div className="absolute inset-6 flex items-center justify-center">
                      {generatedImages.length === 0 && !loading && (
                        <div className="text-center max-w-md mx-auto relative z-10 select-none">
                          <div className="w-20 h-20 bg-[#e2b36e]/5 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#e2b36e]/20"><ImageIcon className="w-10 h-10 text-[#e2b36e]/40" /></div>
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
                                      <div className="bg-black/40 backdrop-blur-md border border-[#e2b36e]/20 rounded-xl p-1.5 flex items-center gap-2 shadow-lg pointer-events-auto">
                                          <button onClick={(e) => { e.stopPropagation(); setPreviewImage(completedUrl); setPreviewSource('generated'); }} className="p-1.5 hover:bg-[#e2b36e]/20 rounded-lg text-[#e2b36e] transition-colors" title="Edit Image"><Edit3 size={16} /></button>
                                          <div className="w-[1px] h-4 bg-[#e2b36e]/20"></div>
                                          <button onClick={(e) => { e.stopPropagation(); handleDownload(completedUrl); }} className="p-1.5 hover:bg-[#e2b36e]/20 rounded-lg text-[#e2b36e] transition-colors" title="Download"><Download size={16} /></button>
                                      </div>
                                  </div>
                                </div>
                               );
                             } else {
                               return (
                                 <div key={`load-${i}`} className="relative bg-[#005060]/40 backdrop-blur-md rounded-2xl border border-[#e2b36e]/20 flex items-center justify-center overflow-hidden"><AILoader progress={progress} small={imageCount > 1} /></div>
                               );
                             }
                           })}
                        </div>
                      )}
                  </div>
              </GlassCard>

              <GlassCard className="w-full flex-none h-44 min-h-[11rem] shrink-0 p-4 flex flex-col mb-8 lg:mb-0">
                  <div className="flex-none flex items-center justify-between mb-3">
                     <div className="flex items-center gap-2 text-xs font-semibold text-[#e2b36e]/60 uppercase tracking-widest"><HistoryIcon size={12} /> Recent Generations</div>
                     {history.length > 0 && (<button onClick={clearHistory} className="flex items-center gap-1 text-[10px] text-red-400 hover:text-red-300 hover:underline"><Trash2 size={10} /> Clear All</button>)}
                  </div>
                  <div className="flex-1 flex gap-4 overflow-x-auto custom-scrollbar pb-2 min-h-0">
                    {history.length === 0 ? (<div className="w-full flex items-center justify-center text-[#e2b36e]/30 text-xs italic">No history yet. Start creating!</div>) : (
                        history.map((item) => (
                        <div key={item.id} onClick={() => { setGeneratedImages([item.url]); setLoading(false); }} className="relative flex-none h-full aspect-square rounded-lg overflow-hidden border border-[#e2b36e]/20 group hover:border-[#e2b36e] transition-all cursor-pointer select-none" onContextMenu={(e) => e.preventDefault()}>
                            <img src={item.url} alt="History" className="w-full h-full object-cover select-none" draggable={false} />
                            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={(e) => { e.stopPropagation(); handleDownload(item.url); }} className="absolute top-1 left-1 p-1.5 bg-black/60 hover:bg-black/80 rounded-md text-[#e2b36e] backdrop-blur-sm transition-colors" title="Download"><Download size={12}/></button>
                                <button onClick={(e) => { e.stopPropagation(); deleteHistoryItem(item.id); }} className="absolute top-1 right-1 p-1.5 bg-red-500/80 hover:bg-red-600 rounded-md text-white backdrop-blur-sm transition-colors" title="Delete"><Trash2 size={12}/></button>
                            </div>
                        </div>))
                    )}
                  </div>
              </GlassCard>
          </div>
      </div>
        
      {/* FOOTER: Added mt-16 and pb-8 to push down 3 lines worth */}
      <footer className="flex-none w-full text-center py-4 text-[#e2b36e]/40 text-sm font-medium uppercase tracking-widest opacity-80 hover:opacity-100 transition-opacity duration-500 select-none mt-16 pb-8 flex flex-col items-center gap-3">
          {/* ONLINE USER BADGE */}
          <div className="scale-90 opacity-80 mb-1">
             <OnlineUserCounter />
          </div>
          <span className="drop-shadow-[0_0_10px_rgba(226,179,110,0.1)]">Powered by Eric</span>
      </footer>
    </div>
  );
};

export default App;
