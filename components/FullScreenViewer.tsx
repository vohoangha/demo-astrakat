
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GlassCard } from './GlassCard';
import { Button } from './Button';
import { MediaType, ArchitectureStyle, ImageQuality } from '../types';
import { generatePromptFromImage, enhanceUserPrompt, editCreativeAsset } from '../services/geminiService';
import { calculateGenerationCost } from '../utils/pricing';
import { 
  Hand, Brush, Eraser, Square as SquareIcon, Circle as CircleIcon, 
  Trash2, ZoomIn, ZoomOut, Maximize, Check, Edit3, Download, X, 
  CopyPlus, Plus, Sparkles, Wand2 
} from 'lucide-react';

interface ShapeObject {
    id: string;
    type: 'rect' | 'circle';
    x: number;
    y: number;
    width: number;
    height: number;
}

interface FullScreenViewerProps {
    src: string;
    onClose: () => void;
    onTriggerEdit: (maskBase64: string, prompt: string, references: string[]) => void;
    isEditableType: boolean;
    isGenerated: boolean;
    onValidateAccess: () => boolean;
    currentPrompt?: string;
    onDownload: (url: string, prompt?: string) => void;
    quality?: ImageQuality; 
}

export const FullScreenViewer: React.FC<FullScreenViewerProps> = ({ 
    src, onClose, onTriggerEdit, isEditableType, isGenerated, onValidateAccess, currentPrompt, onDownload, quality
}) => {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isMiddlePanning, setIsMiddlePanning] = useState(false);
  
  // EDIT MODE STATES
  const [isEditMode, setIsEditMode] = useState(false);
  const [editTool, setEditTool] = useState<'brush' | 'rect' | 'circle' | 'move' | 'eraser'>('brush');
  const [brushSize, setBrushSize] = useState(30);
  const [eraserSize, setEraserSize] = useState(30); 
  const [editPrompt, setEditPrompt] = useState('');
  const [editAutoLoading, setEditAutoLoading] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isEditingLoading, setIsEditingLoading] = useState(false);
  
  // EDIT REFERENCES
  const [editReferenceImages, setEditReferenceImages] = useState<string[]>([]);
  const editRefInputRef = useRef<HTMLInputElement>(null);

  // SHAPE MANAGEMENT
  const [shapes, setShapes] = useState<ShapeObject[]>([]);
  const [selectedShapeId, setSelectedShapeId] = useState<string | null>(null);
  
  // Interaction State
  const [interactionState, setInteractionState] = useState<'NONE' | 'DRAWING_SHAPE' | 'DRAGGING_SHAPE' | 'RESIZING_SHAPE' | 'PAINTING' | 'PANNING'>('NONE');
  
  const dragStartRef = useRef({ x: 0, y: 0 }); 
  const actionStartRef = useRef({ x: 0, y: 0 }); 
  const initialShapeRef = useRef<Partial<ShapeObject>>({}); 

  const imgRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // CANVAS REFS
  const visualCanvasRef = useRef<HTMLCanvasElement>(null); 
  const paintCanvasRef = useRef<HTMLCanvasElement | null>(null); 

  // CALCULATE EDIT COST (Fixed Rate for Edit Mode)
  const editCost = useMemo(() => {
    return calculateGenerationCost({
        quality: ImageQuality.AUTO, 
        imageCount: 1,
        isEdit: true 
    });
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

  // PASTE HANDLER FOR EDIT MODE
  useEffect(() => {
    if (!isEditMode) return;

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
                        if (event.target?.result) {
                            newImages.push(event.target.result as string);
                        }
                        pendingReads--;
                        if (pendingReads === 0) {
                            setEditReferenceImages(prev => {
                                const combined = [...prev, ...newImages];
                                // Enforce limit 5
                                return combined.slice(0, 5); 
                            });
                        }
                    };
                    reader.readAsDataURL(blob);
                }
            }
        }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isEditMode]);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      const activeTag = document.activeElement?.tagName.toLowerCase();
      const isTyping = activeTag === 'input' || activeTag === 'textarea';

      if (!isTyping && (e.key === 'Delete' || e.key === 'Backspace') && selectedShapeId) {
          setShapes(prev => prev.filter(s => s.id !== selectedShapeId));
          setSelectedShapeId(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = 'unset';
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, selectedShapeId]);

  const initCanvases = () => {
    const img = imgRef.current;
    const canvas = visualCanvasRef.current;
    if (img && canvas) {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      if (!paintCanvasRef.current || paintCanvasRef.current.width !== img.naturalWidth) {
          const pc = document.createElement('canvas');
          pc.width = img.naturalWidth;
          pc.height = img.naturalHeight;
          paintCanvasRef.current = pc;
      }
      renderCanvas();
    }
  };

  useEffect(() => {
    if (isEditMode) setTimeout(initCanvases, 50);
  }, [isEditMode, src]);

  useEffect(() => {
      if (isEditMode) renderCanvas();
  }, [shapes, selectedShapeId, isEditMode]);

  const renderCanvas = () => {
      const canvas = visualCanvasRef.current;
      const paintCanvas = paintCanvasRef.current;
      if (!canvas || !paintCanvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.shadowColor = 'rgba(0, 0, 0, 0.9)'; 
      ctx.shadowBlur = 2; 
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.drawImage(paintCanvas, 0, 0);
      ctx.restore();
      shapes.forEach(shape => {
          ctx.save();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
          ctx.lineWidth = 5;
          ctx.strokeStyle = '#000000';
          if (shape.type === 'rect') {
              ctx.fillRect(shape.x, shape.y, shape.width, shape.height);
              ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
          } else if (shape.type === 'circle') {
              ctx.beginPath();
              const radiusX = Math.abs(shape.width) / 2;
              const radiusY = Math.abs(shape.height) / 2;
              const centerX = shape.x + shape.width / 2;
              const centerY = shape.y + shape.height / 2;
              ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
              ctx.fill();
              ctx.stroke();
          }
          ctx.restore();
          if (selectedShapeId === shape.id) {
              drawSelectionUI(ctx, shape);
          }
      });
  };

  const drawSelectionUI = (ctx: CanvasRenderingContext2D, shape: ShapeObject) => {
      const { x, y, width, height } = shape;
      const uiScale = 1 / scale; 
      const handleSize = 45 * uiScale; 
      const delSize = 45 * uiScale;    
      const centerSize = 12 * uiScale; 
      const padding = 2 * uiScale;

      ctx.save();
      // Changed to Gold color for theme consistency
      ctx.strokeStyle = '#e2b36e';
      ctx.lineWidth = 2 * uiScale;
      ctx.setLineDash([6 * uiScale, 4 * uiScale]);
      ctx.strokeRect(x - padding, y - padding, width + padding*2, height + padding*2);
      
      const centerX = x + width / 2;
      const centerY = y + height / 2;
      ctx.setLineDash([]);
      ctx.fillStyle = '#e2b36e';
      ctx.beginPath();
      ctx.arc(centerX, centerY, centerSize, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = '#09232b';
      ctx.lineWidth = 2 * uiScale;
      ctx.stroke();

      const handleX = x + width;
      const handleY = y + height;
      ctx.fillStyle = '#e2b36e';
      ctx.strokeStyle = '#09232b';
      ctx.lineWidth = 2 * uiScale;
      ctx.beginPath();
      ctx.arc(handleX, handleY, handleSize / 2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.stroke();
      
      ctx.strokeStyle = '#09232b';
      ctx.lineWidth = 4 * uiScale; 
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      const arrowR = handleSize / 3.5;
      ctx.beginPath();
      ctx.moveTo(handleX - arrowR, handleY - arrowR);
      ctx.lineTo(handleX + arrowR, handleY + arrowR);
      ctx.moveTo(handleX + arrowR, handleY + arrowR);
      ctx.lineTo(handleX + arrowR - arrowR/1.2, handleY + arrowR);
      ctx.moveTo(handleX + arrowR, handleY + arrowR);
      ctx.lineTo(handleX + arrowR, handleY + arrowR - arrowR/1.2);
      ctx.moveTo(handleX - arrowR, handleY - arrowR);
      ctx.lineTo(handleX - arrowR + arrowR/1.2, handleY - arrowR);
      ctx.moveTo(handleX - arrowR, handleY - arrowR);
      ctx.lineTo(handleX - arrowR, handleY - arrowR + arrowR/1.2);
      ctx.stroke();

      const delX = x + width;
      const delY = y;
      ctx.fillStyle = '#ef4444'; 
      ctx.beginPath();
      ctx.arc(delX, delY, delSize / 2, 0, 2 * Math.PI);
      ctx.fill();
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 4 * uiScale; 
      const xPad = delSize / 4;
      ctx.beginPath();
      ctx.moveTo(delX - xPad, delY - xPad);
      ctx.lineTo(delX + xPad, delY + xPad);
      ctx.moveTo(delX + xPad, delY - xPad);
      ctx.lineTo(delX - xPad, delY + xPad);
      ctx.stroke();
      ctx.restore();
  };

  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = visualCanvasRef.current;
    const img = imgRef.current;
    if (!canvas || !img) return { x: 0, y: 0 };
    const rect = img.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  };

  const checkHit = (x: number, y: number): { type: 'body' | 'resize' | 'delete' | 'none', id: string | null } => {
      if (selectedShapeId) {
          const shape = shapes.find(s => s.id === selectedShapeId);
          if (shape) {
              const handleHitThreshold = 50 * (1 / scale); 
              const resX = shape.x + shape.width;
              const resY = shape.y + shape.height;
              if (Math.hypot(x - resX, y - resY) < handleHitThreshold) return { type: 'resize', id: shape.id };
              const delX = shape.x + shape.width;
              const delY = shape.y;
              if (Math.hypot(x - delX, y - delY) < handleHitThreshold) return { type: 'delete', id: shape.id };
          }
      }
      for (let i = shapes.length - 1; i >= 0; i--) {
          const s = shapes[i];
          if (x >= s.x && x <= s.x + s.width && y >= s.y && y <= s.y + s.height) return { type: 'body', id: s.id };
      }
      return { type: 'none', id: null };
  };

  const handleMouseDown = (e: React.MouseEvent | React.TouchEvent) => {
    const isMiddleClick = 'button' in e && (e as React.MouseEvent).button === 1;
    if (isMiddleClick) {
        e.preventDefault();
        setIsMiddlePanning(true);
        setInteractionState('PANNING');
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        dragStartRef.current = { x: clientX - position.x, y: clientY - position.y };
        return; 
    }
    if (!isEditMode) {
        if (scale > 1) {
            setInteractionState('PANNING');
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
            dragStartRef.current = { x: clientX - position.x, y: clientY - position.y };
        }
        return;
    }
    const { x, y } = getCanvasCoordinates(e);
    actionStartRef.current = { x, y };

    if (editTool === 'move' || editTool === 'rect' || editTool === 'circle') {
        const hit = checkHit(x, y);
        if (hit.type === 'delete' && hit.id) {
            setShapes(prev => prev.filter(s => s.id !== hit.id));
            setSelectedShapeId(null);
            setInteractionState('NONE');
            return;
        }
        if (hit.type === 'resize' && hit.id) {
            setInteractionState('RESIZING_SHAPE');
            setSelectedShapeId(hit.id);
            const s = shapes.find(sh => sh.id === hit.id);
            if (s) initialShapeRef.current = { ...s };
            return;
        }
        if (hit.type === 'body' && hit.id) {
            setSelectedShapeId(hit.id);
            setInteractionState('DRAGGING_SHAPE');
            const s = shapes.find(sh => sh.id === hit.id);
            if (s) initialShapeRef.current = { ...s };
            return;
        }
        if (editTool === 'rect' || editTool === 'circle') {
            setSelectedShapeId(null); 
            setInteractionState('DRAWING_SHAPE');
            const newId = Date.now().toString();
            const newShape: ShapeObject = { id: newId, type: editTool, x: x, y: y, width: 0, height: 0 };
            setShapes(prev => [...prev, newShape]);
            setSelectedShapeId(newId);
            initialShapeRef.current = { x, y };
            return;
        }
        if (editTool === 'move' && scale > 1) {
             setInteractionState('PANNING');
             const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
             const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
             dragStartRef.current = { x: clientX - position.x, y: clientY - position.y };
             return;
        }
    } else if (editTool === 'brush' || editTool === 'eraser') {
        setInteractionState('PAINTING');
        paint(x, y, true);
    }
  };

  const handleMouseMove = (e: React.MouseEvent | React.TouchEvent) => {
    if (interactionState === 'PANNING' || isMiddlePanning) {
        e.preventDefault();
        const clientX = 'touches' in e ? e.touches[0].clientX : (e as React.MouseEvent).clientX;
        const clientY = 'touches' in e ? e.touches[0].clientY : (e as React.MouseEvent).clientY;
        requestAnimationFrame(() => {
            setPosition({ x: clientX - dragStartRef.current.x, y: clientY - dragStartRef.current.y });
        });
        return;
    }
    const { x, y } = getCanvasCoordinates(e);
    if (interactionState === 'NONE') {
        if (!containerRef.current) return;
        const hit = checkHit(x, y);
        if (hit.type === 'delete' || hit.type === 'resize') containerRef.current.style.cursor = 'pointer';
        else if (hit.type === 'body') containerRef.current.style.cursor = 'move';
        else {
            if (editTool === 'move') containerRef.current.style.cursor = scale > 1 ? 'grab' : 'default';
            else if (editTool === 'brush' || editTool === 'eraser') containerRef.current.style.cursor = 'crosshair';
            else containerRef.current.style.cursor = 'crosshair';
        }
        return;
    }
    if (interactionState === 'PAINTING') paint(x, y, false);
    else if (interactionState === 'DRAWING_SHAPE') {
        const originX = initialShapeRef.current.x || 0;
        const originY = initialShapeRef.current.y || 0;
        setShapes(prev => prev.map(s => {
            if (s.id === selectedShapeId) {
                let width = x - originX;
                let height = y - originY;
                if (e.shiftKey && s.type === 'rect') {
                    const max = Math.max(Math.abs(width), Math.abs(height));
                    width = width < 0 ? -max : max;
                    height = height < 0 ? -max : max;
                }
                if (s.type === 'circle' && e.shiftKey) {
                     const max = Math.max(Math.abs(width), Math.abs(height));
                     width = width < 0 ? -max : max;
                     height = height < 0 ? -max : max;
                }
                return { ...s, width, height };
            }
            return s;
        }));
    } else if (interactionState === 'DRAGGING_SHAPE') {
        const dx = x - actionStartRef.current.x;
        const dy = y - actionStartRef.current.y;
        setShapes(prev => prev.map(s => {
            if (s.id === selectedShapeId) {
                return { ...s, x: (initialShapeRef.current.x || 0) + dx, y: (initialShapeRef.current.y || 0) + dy };
            }
            return s;
        }));
    } else if (interactionState === 'RESIZING_SHAPE') {
        const s = initialShapeRef.current;
        if (!s) return;
        const newWidth = x - (s.x || 0);
        const newHeight = y - (s.y || 0);
        setShapes(prev => prev.map(curr => {
            if (curr.id === selectedShapeId) return { ...curr, width: newWidth, height: newHeight };
            return curr;
        }));
    }
  };

  const handleMouseUp = () => {
    setIsMiddlePanning(false);
    setInteractionState('NONE');
    const ctx = paintCanvasRef.current?.getContext('2d');
    if (ctx) ctx.beginPath(); 
  };

  const paint = (x: number, y: number, isStart: boolean) => {
      const ctx = paintCanvasRef.current?.getContext('2d');
      if (!ctx) return;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      if (editTool === 'eraser') {
          ctx.globalCompositeOperation = 'destination-out';
          ctx.lineWidth = eraserSize; 
      } else {
          ctx.globalCompositeOperation = 'source-over';
          ctx.lineWidth = brushSize;
          ctx.strokeStyle = 'rgba(255, 255, 255, 1)'; 
      }
      if (isStart) {
          ctx.beginPath();
          ctx.moveTo(x, y);
      } else {
          ctx.lineTo(x, y);
          ctx.stroke();
      }
      renderCanvas(); 
  };

  const clearMask = () => {
      setShapes([]);
      const ctx = paintCanvasRef.current?.getContext('2d');
      if (ctx && paintCanvasRef.current) {
          ctx.clearRect(0, 0, paintCanvasRef.current.width, paintCanvasRef.current.height);
      }
      renderCanvas();
  };

  const handleEditRefUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
      if (event.target.files && event.target.files.length > 0) {
          const files = Array.from(event.target.files);
          const remainingSlots = 5 - editReferenceImages.length;
          if (remainingSlots <= 0) {
              alert("Max 5 reference images allowed in Edit Mode.");
              return;
          }
          const fileList = files.slice(0, remainingSlots);
          const newImages: string[] = [];
          let processed = 0;
          fileList.forEach(file => {
              const reader = new FileReader();
              reader.onloadend = () => {
                  if (reader.result) newImages.push(reader.result as string);
                  processed++;
                  if (processed === fileList.length) {
                      setEditReferenceImages(prev => [...prev, ...newImages]);
                  }
              };
              reader.readAsDataURL(file as any);
          });
          if (editRefInputRef.current) editRefInputRef.current.value = '';
      }
  };

  const removeEditRefImage = (index: number) => {
      setEditReferenceImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleEditGenerate = async () => {
    if (detectDevTools()) { punishDevTools(); return; }
    if (!editPrompt.trim()) return;
    const imgCanvas = visualCanvasRef.current;
    if (!imgCanvas) return;
    setIsEditingLoading(true);
    try {
      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = imgCanvas.width;
      maskCanvas.height = imgCanvas.height;
      const mCtx = maskCanvas.getContext('2d');
      if (!mCtx) throw new Error("Canvas Error");
      mCtx.fillStyle = '#000000';
      mCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
      if (paintCanvasRef.current) {
          mCtx.drawImage(paintCanvasRef.current, 0, 0);
      }
      mCtx.fillStyle = '#ffffff';
      shapes.forEach(shape => {
          mCtx.beginPath();
          if (shape.type === 'rect') {
              mCtx.rect(shape.x, shape.y, shape.width, shape.height);
          } else if (shape.type === 'circle') {
              const radiusX = Math.abs(shape.width) / 2;
              const radiusY = Math.abs(shape.height) / 2;
              const centerX = shape.x + shape.width / 2;
              const centerY = shape.y + shape.height / 2;
              mCtx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
          }
          mCtx.fill();
      });
      const maskBase64 = maskCanvas.toDataURL('image/png');
      onTriggerEdit(maskBase64, editPrompt, editReferenceImages);
      onClose(); 
    } catch (e: any) {
      console.error(e);
      alert("Preparation failed. Please try again.");
      setIsEditingLoading(false);
    } 
  };

  const handleStopEdit = () => onClose();

  const handleEditAutoPrompt = async () => {
    if (detectDevTools()) { punishDevTools(); return; }
    setEditAutoLoading(true);
    try {
        const prompt = await generatePromptFromImage([src], MediaType.STANDARD, ArchitectureStyle.NONE);
        setEditPrompt(prompt);
    } catch(e) { console.error(e); }
    finally { setEditAutoLoading(false); }
  };
  
  const handleEditEnhancePrompt = async () => {
      if (detectDevTools()) { punishDevTools(); return; }
      if(!editPrompt) return;
      setIsEnhancing(true);
      try {
          const enhanced = await enhanceUserPrompt(editPrompt, MediaType.STANDARD, ArchitectureStyle.NONE);
          setEditPrompt(enhanced);
      } catch(e) { console.error(e); }
      finally { setIsEnhancing(false); }
  };

  const handleZoom = (delta: number) => {
    setScale(prev => {
      const newScale = Math.min(Math.max(1, prev + delta), 5);
      if (newScale === 1) setPosition({ x: 0, y: 0 });
      return newScale;
    });
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.stopPropagation();
    const delta = e.deltaY > 0 ? -0.2 : 0.2;
    handleZoom(delta);
  };

  return (
    <div 
      className="fixed inset-0 z-[100] bg-[#103742]/95 flex flex-col animate-in fade-in duration-300"
      onWheel={handleWheel}
      onClick={(e) => { if (e.target === e.currentTarget && !isEditMode) onClose(); }} 
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex-none h-16 w-full px-6 flex justify-between items-center z-50 bg-gradient-to-b from-[#103742] to-transparent pointer-events-none">
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
             {isEditableType && (
                 <button 
                    onClick={() => {
                        if (isEditMode) {
                            setIsEditMode(false);
                            setEditTool('brush'); 
                        } else {
                            if (onValidateAccess()) {
                                setIsEditMode(true);
                            }
                        }
                    }}
                    className={`p-2 rounded-full transition-all duration-300 border ${isEditMode ? 'bg-[#e2b36e] text-[#09232b] border-[#e2b36e] shadow-[0_0_15px_rgba(226,179,110,0.5)]' : 'bg-[#09232b]/50 text-[#e2b36e] border-[#e2b36e]/20 hover:bg-[#e2b36e]/20'}`}
                    title={isEditMode ? "Exit Edit Mode" : "Edit Image"}
                 >
                    {isEditMode ? <Check className="w-6 h-6" /> : <Edit3 className="w-6 h-6" />}
                 </button>
             )}
             
             {isGenerated && (
                 <button 
                    onClick={() => onDownload(src, currentPrompt)}
                    className="p-2 bg-[#09232b]/50 hover:bg-[#e2b36e]/20 rounded-full text-[#e2b36e] transition-colors border border-[#e2b36e]/20 hover:border-[#e2b36e]/40"
                    title="Download Result"
                 >
                    <Download className="w-6 h-6" />
                </button>
             )}

             <button 
                onClick={onClose}
                className="p-2 bg-[#09232b]/50 hover:bg-[#e2b36e]/20 rounded-full text-[#e2b36e] transition-colors border border-[#e2b36e]/20 hover:border-[#e2b36e]/40"
            >
                <X className="w-6 h-6" />
            </button>
        </div>
      </div>

      {isEditMode && (
          <div className="absolute left-6 top-1/2 -translate-y-1/2 flex flex-col gap-3 z-50 pointer-events-auto animate-in slide-in-from-left fade-in duration-300">
             <GlassCard className="p-3 flex flex-col gap-3 border-[#e2b36e]/20 bg-[#09232b]/80">
                 <button onClick={() => { setEditTool('move'); setSelectedShapeId(null); }} className={`p-2 rounded-lg transition-all relative group ${editTool === 'move' ? 'bg-[#e2b36e] text-[#09232b]' : 'text-[#e2b36e] hover:bg-[#e2b36e]/10'}`} title="Move/Select"><Hand size={20} /></button>
                 <div className="h-[1px] w-full bg-[#e2b36e]/20 my-1"></div>
                 <button onClick={() => { setEditTool('brush'); setSelectedShapeId(null); }} className={`p-2 rounded-lg transition-all relative group ${editTool === 'brush' ? 'bg-[#e2b36e] text-[#09232b]' : 'text-[#e2b36e] hover:bg-[#e2b36e]/10'}`} title="Brush"><Brush size={20} /></button>
                 {editTool === 'brush' && (
                     <div className="absolute left-full top-16 ml-3 bg-[#09232b]/95 backdrop-blur-md border border-[#e2b36e]/20 rounded-lg p-3 w-32 shadow-xl animate-in slide-in-from-left-2 fade-in z-50">
                        <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-[#e2b36e] uppercase font-bold">Brush Size</span><span className="text-[10px] text-[#e2b36e] font-mono">{brushSize}px</span></div>
                        <input type="range" min="5" max="500" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value))} className="w-full h-1.5 bg-[#e2b36e]/20 rounded-lg appearance-none cursor-pointer accent-[#e2b36e]" />
                     </div>
                 )}
                 <button onClick={() => { setEditTool('eraser'); setSelectedShapeId(null); }} className={`p-2 rounded-lg transition-all relative group ${editTool === 'eraser' ? 'bg-[#e2b36e] text-[#09232b]' : 'text-[#e2b36e] hover:bg-[#e2b36e]/10'}`} title="Eraser Brush"><Eraser size={20} /></button>
                 {editTool === 'eraser' && (
                     <div className="absolute left-full top-28 ml-3 bg-[#09232b]/95 backdrop-blur-md border border-[#e2b36e]/20 rounded-lg p-3 w-32 shadow-xl animate-in slide-in-from-left-2 fade-in z-50">
                        <div className="flex items-center justify-between mb-1"><span className="text-[10px] text-[#e2b36e] uppercase font-bold">Eraser Size</span><span className="text-[10px] text-[#e2b36e] font-mono">{eraserSize}px</span></div>
                        <input type="range" min="5" max="500" value={eraserSize} onChange={(e) => setEraserSize(parseInt(e.target.value))} className="w-full h-1.5 bg-[#e2b36e]/20 rounded-lg appearance-none cursor-pointer accent-[#e2b36e]" />
                     </div>
                 )}
                 <div className="h-[1px] w-full bg-[#e2b36e]/20 my-1"></div>
                 <button onClick={() => { setEditTool('rect'); setSelectedShapeId(null); }} className={`p-2 rounded-lg transition-all ${editTool === 'rect' ? 'bg-[#e2b36e] text-[#09232b]' : 'text-[#e2b36e] hover:bg-[#e2b36e]/10'}`} title="Rectangle"><SquareIcon size={20} /></button>
                 <button onClick={() => { setEditTool('circle'); setSelectedShapeId(null); }} className={`p-2 rounded-lg transition-all ${editTool === 'circle' ? 'bg-[#e2b36e] text-[#09232b]' : 'text-[#e2b36e] hover:bg-[#e2b36e]/10'}`} title="Circle"><CircleIcon size={20} /></button>
                 <div className="h-[1px] w-full bg-[#e2b36e]/20 my-1"></div>
                 <button onClick={clearMask} className="p-2 rounded-lg text-red-400 hover:bg-red-500/10 transition-colors" title="Clear Mask"><Trash2 size={20} /></button>
             </GlassCard>
          </div>
      )}

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
        <img ref={imgRef} src={src} alt="Full Screen Preview" style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`, transition: (interactionState !== 'NONE' || isMiddlePanning) ? 'none' : 'transform 0.2s ease-out', maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} className="select-none pointer-events-auto will-change-transform shadow-2xl" draggable={false} />
        <canvas ref={visualCanvasRef} className={`absolute pointer-events-none will-change-transform ${!isEditMode && 'hidden'}`} style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`, width: imgRef.current?.getBoundingClientRect().width || 'auto', height: imgRef.current?.getBoundingClientRect().height || 'auto', transition: (interactionState !== 'NONE' || isMiddlePanning) ? 'none' : 'transform 0.2s ease-out' }} />
      </div>

      <div className="flex-none w-full flex justify-center pb-6 pt-2 bg-gradient-to-t from-[#103742] via-[#103742] to-transparent z-50 pointer-events-auto" onClick={(e) => e.stopPropagation()}>
         {!isEditMode ? (
            <div className="flex items-center gap-4 bg-[#09232b]/80 backdrop-blur-md px-6 py-3 rounded-2xl border border-[#e2b36e]/20 shadow-[0_0_20px_rgba(226,179,110,0.1)]">
                <button onClick={() => handleZoom(-0.5)} className="p-2 hover:bg-[#e2b36e]/10 rounded-lg text-[#e2b36e] disabled:opacity-30" disabled={scale <= 1}><ZoomOut className="w-5 h-5" /></button>
                <span className="text-[#e2b36e] font-mono min-w-[3ch] text-center font-bold">{Math.round(scale * 100)}%</span>
                <button onClick={() => handleZoom(0.5)} className="p-2 hover:bg-[#e2b36e]/10 rounded-lg text-[#e2b36e] disabled:opacity-30" disabled={scale >= 5}><ZoomIn className="w-5 h-5" /></button>
            </div>
         ) : (
             <GlassCard className="p-0 flex flex-col gap-0 w-[800px] max-w-[95vw] animate-in slide-in-from-bottom fade-in duration-300 relative overflow-hidden shadow-[0_0_30px_rgba(0,0,0,0.5)] border-[#e2b36e]/20">
                  <div className="w-full px-1 pt-1 pb-1">
                      <div className="border border-dashed border-[#e2b36e]/30 bg-[#09232b]/40 rounded-xl p-2.5 flex flex-col gap-2">
                          <div className="flex justify-between items-center px-1">
                              <label className="text-[10px] font-bold text-[#e2b36e]/60 flex items-center gap-1.5 uppercase tracking-wider"><CopyPlus size={10} /> References</label>
                              <span className="text-[10px] text-[#e2b36e]/40 font-mono">{editReferenceImages.length}/5</span>
                          </div>
                          <div className="flex gap-2 overflow-x-auto custom-scrollbar p-2">
                              <button onClick={() => editRefInputRef.current?.click()} disabled={editReferenceImages.length >= 5} className={`h-12 w-12 flex-none rounded-lg border border-dashed flex items-center justify-center transition-all ${editReferenceImages.length >= 5 ? 'opacity-50 cursor-not-allowed border-[#e2b36e]/20 text-[#e2b36e]/20' : 'border-[#e2b36e]/30 text-[#e2b36e] hover:bg-[#e2b36e]/10'}`} title="Add Reference Image or Paste (Ctrl+V)"><Plus size={18} /></button>
                              <input type="file" ref={editRefInputRef} className="hidden" onChange={handleEditRefUpload} accept="image/*" multiple />
                              {editReferenceImages.length === 0 && (<div className="flex items-center text-[10px] text-[#e2b36e]/30 italic select-none px-2">Upload or Paste (Ctrl+V) images here to guide the AI</div>)}
                              {editReferenceImages.map((img, idx) => (<div key={idx} className="relative h-12 w-12 flex-none group"><img src={img} alt={`Ref ${idx}`} className="h-full w-full object-cover rounded-lg border border-[#e2b36e]/20" /><button onClick={() => removeEditRefImage(idx)} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm scale-75 hover:scale-100 z-10"><X size={10} /></button></div>))}
                          </div>
                      </div>
                  </div>
                  <div className="relative w-full h-32">
                      <div className="relative flex-1 bg-[#09232b]/40 hover:bg-[#09232b]/60 focus-within:bg-[#09232b]/60 transition-colors h-full">
                        <textarea value={editPrompt} onChange={(e) => setEditPrompt(e.target.value)} placeholder="Describe what to change in the highlighted area..." className="w-full h-full bg-transparent border-none px-4 py-3 text-sm text-[#e2b36e] placeholder-[#e2b36e]/40 focus:outline-none resize-none custom-scrollbar pb-12" onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleEditGenerate(); }}} />
                      </div>
                      <div className="absolute left-3 bottom-3 flex gap-2 z-10">
                          {!editPrompt.trim() ? (
                              <button onClick={handleEditAutoPrompt} disabled={editAutoLoading} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all shadow-lg border border-[#e2b36e]/30 ${editAutoLoading ? 'bg-[#09232b] text-[#e2b36e] cursor-wait' : 'bg-[#e2b36e]/10 text-[#e2b36e] hover:bg-[#e2b36e]/20'}`}><Sparkles size={12} className={editAutoLoading ? "animate-spin" : ""} />{editAutoLoading ? 'Reading...' : 'Auto Prompt'}</button>
                          ) : (
                              <button onClick={handleEditEnhancePrompt} disabled={isEnhancing} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${isEnhancing ? 'bg-[#09232b] border border-[#e2b36e]/10 text-[#e2b36e]/30 cursor-wait' : 'bg-[#09232b] border border-[#e2b36e]/30 text-[#e2b36e] shadow-[0_0_15px_rgba(226,179,110,0.2)] hover:shadow-[0_0_25px_rgba(226,179,110,0.4)] hover:bg-[#103742]'}`}><Wand2 size={12} className={isEnhancing ? "animate-spin" : "fill-[#e2b36e]/50"} />{isEnhancing ? 'Enhancing...' : 'Enhance'}</button>
                          )}
                      </div>
                      <div className="absolute right-3 bottom-3 z-10 flex items-center gap-2">
                           <Button onClick={isEditingLoading ? handleStopEdit : handleEditGenerate} isLoading={isEditingLoading} variant={isEditingLoading ? "rainbow-stop" : "rainbow"} className="py-2 px-6 text-xs font-bold flex items-center gap-2 min-w-[120px] hover:scale-105 active:scale-95 transition-transform duration-200">
                                {isEditingLoading ? (<><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" className="mr-2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>STOP</>) : (<>
                                    <svg width="16" height="16" viewBox="0 0 100 100" className="fill-current text-[#09232b] mr-1"><path d="M 50 0 C 50 35 60 45 100 50 C 60 55 50 65 50 100 C 50 65 40 55 0 50 C 40 45 50 35 50 0 Z" /></svg>
                                    Generate
                                    {/* Format cost to remove trailing zeros */}
                                    <span className="font-normal opacity-80 ml-1 text-[10px] lowercase">(-{editCost} credits)</span>
                                </>)}
                            </Button>
                      </div>
                  </div>
             </GlassCard>
         )}
      </div>
    </div>
  );
};
