
import React, { useRef, useEffect, useState } from 'react';
import { Point, Box, SegmentationResult } from '../types';

type SegmentMode = 'point' | 'box';

interface ImageCanvasProps {
  image: HTMLImageElement | null;
  points: Point[];
  box: Box | null;
  onAddPoint: (point: Point) => void;
  onBoxComplete: (box: Box) => void;
  segmentation: SegmentationResult | null;
  isLoading: boolean;
  isEmbeddingReady: boolean;
  mode: SegmentMode;
}

const ImageCanvas: React.FC<ImageCanvasProps> = ({ image, points, box, onAddPoint, onBoxComplete, segmentation, isLoading, isEmbeddingReady, mode }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);
  const [isDrawing, setIsDrawing] = useState(false);
  const [tempBox, setTempBox] = useState<Box | null>(null);

  useEffect(() => {
    if (!image || !canvasRef.current) return;

    const updateCanvasSize = () => {
      if (!containerRef.current || !canvasRef.current || !maskCanvasRef.current) return;
      
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      const imgWidth = image.width;
      const imgHeight = image.height;
      
      const s = Math.min(containerWidth / imgWidth, containerHeight / imgHeight);
      setScale(s);

      canvasRef.current.width = imgWidth;
      canvasRef.current.height = imgHeight;
      maskCanvasRef.current.width = imgWidth;
      maskCanvasRef.current.height = imgHeight;

      const ctx = canvasRef.current.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, imgWidth, imgHeight);
        ctx.drawImage(image, 0, 0);
      }
    };

    updateCanvasSize();
    window.addEventListener('resize', updateCanvasSize);
    return () => window.removeEventListener('resize', updateCanvasSize);
  }, [image]);

  useEffect(() => {
    if (!segmentation || !segmentation.mask || !maskCanvasRef.current) {
        const ctx = maskCanvasRef.current?.getContext('2d');
        ctx?.clearRect(0, 0, maskCanvasRef.current?.width || 0, maskCanvasRef.current?.height || 0);
        return;
    }

    const { mask, width, height } = segmentation;
    const ctx = maskCanvasRef.current.getContext('2d');
    if (!ctx) return;

    // Create image data for the mask
    const imageData = ctx.createImageData(width, height);
    
    // Helper to check if a pixel is on the edge
    const isEdge = (x: number, y: number): boolean => {
      const idx = y * width + x;
      if (mask[idx] === 0) return false;
      
      // Check 8 neighboring pixels
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            const nidx = ny * width + nx;
            if (mask[nidx] === 0) return true; // Edge detected
          }
        }
      }
      return false;
    };

    // First pass: fill mask with semi-transparent color
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const idx = i * 4;
        const val = mask[i];
        
        if (val > 0) {
          // Vibrant neon blue for dark theme
          imageData.data[idx] = 99;   // R
          imageData.data[idx + 1] = 102; // G
          imageData.data[idx + 2] = 241; // B
          imageData.data[idx + 3] = 180; // Alpha
        } else {
          imageData.data[idx + 3] = 0;
        }
      }
    }

    // Second pass: draw thicker border around edges
    const borderThickness = 1; // Reduced for smoother appearance with improved upscaling
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (isEdge(x, y)) {
          // Draw a thicker border by setting surrounding pixels
          for (let dy = -borderThickness; dy <= borderThickness; dy++) {
            for (let dx = -borderThickness; dx <= borderThickness; dx++) {
              const nx = x + dx;
              const ny = y + dy;
              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const i = ny * width + nx;
                const idx = i * 4;
                // Bright white/indigo border
                imageData.data[idx] = 255;   // R
                imageData.data[idx + 1] = 255; // G
                imageData.data[idx + 2] = 255; // B
                imageData.data[idx + 3] = 255; // Full opacity
              }
            }
          }
        }
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }, [segmentation]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!image || !canvasRef.current || isLoading || !isEmbeddingReady) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    if (mode === 'point') {
      // Left click = Positive (1), Right click = Negative (0)
      const label = e.button === 0 ? 1 : 0;
      onAddPoint({ x, y, label });
    } else if (mode === 'box' && e.button === 0) {
      // Start drawing box
      setIsDrawing(true);
      setTempBox({ x1: x, y1: y, x2: x, y2: y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!image || !canvasRef.current || !isDrawing || mode !== 'box') return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    if (tempBox) {
      setTempBox({ ...tempBox, x2: x, y2: y });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!image || !isDrawing || mode !== 'box' || !tempBox) return;

    setIsDrawing(false);
    
    // Ensure box has minimum size
    const width = Math.abs(tempBox.x2 - tempBox.x1);
    const height = Math.abs(tempBox.y2 - tempBox.y1);
    
    if (width > 5 && height > 5) {
      // Normalize box coordinates (ensure x1 < x2, y1 < y2)
      const normalizedBox = {
        x1: Math.min(tempBox.x1, tempBox.x2),
        y1: Math.min(tempBox.y1, tempBox.y2),
        x2: Math.max(tempBox.x1, tempBox.x2),
        y2: Math.max(tempBox.y1, tempBox.y2)
      };
      onBoxComplete(normalizedBox);
    }
    
    setTempBox(null);
  };

  return (
    <div 
      ref={containerRef} 
      className="relative w-full flex-1 flex justify-center items-center overflow-hidden bg-slate-950 rounded-xl shadow-inner border border-slate-800"
    >
      <div 
        className={`relative transition-all duration-300 ease-out ${
          !isEmbeddingReady ? 'cursor-wait' : 'cursor-crosshair'
        }`}
        style={{ width: (image?.width || 0) * scale, height: (image?.height || 0) * scale }}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full pointer-events-none rounded-sm"
        />
        <canvas 
          ref={maskCanvasRef} 
          className="absolute inset-0 w-full h-full pointer-events-none mix-blend-screen"
        />
        
        {/* Render Points */}
        {mode === 'point' && points.map((p, i) => (
          <div 
            key={i}
            className={`absolute w-3.5 h-3.5 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 shadow-[0_0_12px_rgba(255,255,255,0.4)] z-10 animate-in fade-in zoom-in duration-300 ${
              p.label === 1 ? 'bg-indigo-500' : 'bg-rose-500'
            }`}
            style={{ left: p.x * scale, top: p.y * scale }}
          />
        ))}

        {/* Render Bounding Box */}
        {mode === 'box' && (tempBox || box) && (() => {
          const displayBox = tempBox || box!;
          const x = Math.min(displayBox.x1, displayBox.x2) * scale;
          const y = Math.min(displayBox.y1, displayBox.y2) * scale;
          const width = Math.abs(displayBox.x2 - displayBox.x1) * scale;
          const height = Math.abs(displayBox.y2 - displayBox.y1) * scale;
          
          return (
            <div
              className="absolute border-3 border-indigo-500 bg-indigo-500/10 z-10 pointer-events-none"
              style={{
                left: x,
                top: y,
                width: width,
                height: height,
                boxShadow: '0 0 20px rgba(99, 102, 241, 0.5), inset 0 0 20px rgba(99, 102, 241, 0.1)'
              }}
            >
              {/* Corner handles */}
              <div className="absolute -top-1 -left-1 w-2 h-2 bg-white rounded-full shadow-lg"></div>
              <div className="absolute -top-1 -right-1 w-2 h-2 bg-white rounded-full shadow-lg"></div>
              <div className="absolute -bottom-1 -left-1 w-2 h-2 bg-white rounded-full shadow-lg"></div>
              <div className="absolute -bottom-1 -right-1 w-2 h-2 bg-white rounded-full shadow-lg"></div>
            </div>
          );
        })()}

        {isLoading && (
          <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-[2px] flex items-center justify-center z-20">
             <div className="flex flex-col items-center gap-4">
                <div className="relative">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-indigo-500/20 border-t-indigo-500"></div>
                  <div className="absolute inset-0 rounded-full shadow-[0_0_20px_rgba(99,102,241,0.3)]"></div>
                </div>
                <span className="text-indigo-100 font-semibold text-sm tracking-wide">Refining mask...</span>
             </div>
          </div>
        )}

        {!image && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-700 gap-6">
            <div className="bg-slate-900/50 p-8 rounded-full border border-slate-800/50 shadow-2xl">
              <svg className="w-20 h-20 opacity-40 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div className="text-center space-y-2">
              <p className="text-lg font-bold text-slate-500">Workspace Empty</p>
              <p className="text-sm text-slate-600">Drop or upload an image to begin segmentation</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageCanvas;
