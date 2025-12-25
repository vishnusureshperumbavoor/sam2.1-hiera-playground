
import React, { useRef, useEffect, useState } from 'react';
import { Point, SegmentationResult } from '../types';

interface ImageCanvasProps {
  image: HTMLImageElement | null;
  points: Point[];
  onAddPoint: (point: Point) => void;
  segmentation: SegmentationResult | null;
  isLoading: boolean;
}

const ImageCanvas: React.FC<ImageCanvasProps> = ({ image, points, onAddPoint, segmentation, isLoading }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (!image || !canvasRef.current) return;

    const updateCanvasSize = () => {
      if (!containerRef.current || !canvasRef.current || !maskCanvasRef.current) return;
      
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = window.innerHeight * 0.7; // Fixed responsive height
      
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

    const imageData = ctx.createImageData(width, height);
    for (let i = 0; i < mask.length; i++) {
      const val = mask[i];
      const idx = i * 4;
      if (val > 0) {
        imageData.data[idx] = 63;   // R
        imageData.data[idx + 1] = 131; // G
        imageData.data[idx + 2] = 248; // B
        imageData.data[idx + 3] = 160; // Alpha
      } else {
        imageData.data[idx + 3] = 0;
      }
    }
    ctx.putImageData(imageData, 0, 0);
  }, [segmentation]);

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!image || !canvasRef.current || isLoading) return;

    const rect = canvasRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    // Left click = Positive (1), Right click = Negative (0)
    const label = e.button === 0 ? 1 : 0;
    onAddPoint({ x, y, label });
  };

  return (
    <div 
      ref={containerRef} 
      className="relative w-full flex justify-center items-center overflow-hidden bg-slate-900 rounded-xl shadow-inner border border-slate-800"
      style={{ minHeight: '400px', height: '70vh' }}
    >
      <div 
        className="relative cursor-crosshair transition-transform duration-200"
        style={{ width: (image?.width || 0) * scale, height: (image?.height || 0) * scale }}
        onMouseDown={handleMouseDown}
        onContextMenu={(e) => e.preventDefault()}
      >
        <canvas 
          ref={canvasRef} 
          className="absolute inset-0 w-full h-full pointer-events-none"
        />
        <canvas 
          ref={maskCanvasRef} 
          className="absolute inset-0 w-full h-full pointer-events-none opacity-80"
        />
        
        {/* Render Points */}
        {points.map((p, i) => (
          <div 
            key={i}
            className={`absolute w-3 h-3 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 shadow-lg z-10 ${
              p.label === 1 ? 'bg-blue-500' : 'bg-red-500'
            }`}
            style={{ left: p.x * scale, top: p.y * scale }}
          />
        ))}

        {isLoading && (
          <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[1px] flex items-center justify-center z-20">
             <div className="flex flex-col items-center gap-3">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-blue-500 border-t-transparent"></div>
                <span className="text-white font-medium text-sm drop-shadow-md">Processing segment...</span>
             </div>
          </div>
        )}

        {!image && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 gap-4">
            <svg className="w-16 h-16 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <p className="text-sm font-medium">Upload an image to start segmenting</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageCanvas;
