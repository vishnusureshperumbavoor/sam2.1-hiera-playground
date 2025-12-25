
import React, { useState, useEffect, useCallback } from 'react';
import { sam2Service } from './services/sam2Service';
import ImageCanvas from './components/ImageCanvas';
import { Point, SegmentationResult, ModelStatus } from './types';

const App: React.FC = () => {
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [points, setPoints] = useState<Point[]>([]);
  const [segmentation, setSegmentation] = useState<SegmentationResult | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [modelStatus, setModelStatus] = useState<ModelStatus>({
    encoderLoaded: false,
    decoderLoaded: false,
    loading: false,
    error: null,
    progress: 0
  });

  // Load models on mount
  useEffect(() => {
    const init = async () => {
      setModelStatus(prev => ({ ...prev, loading: true }));
      try {
        await sam2Service.loadModels((progress) => {
          setModelStatus(prev => ({ ...prev, progress }));
        });
        setModelStatus(prev => ({ ...prev, loading: false, encoderLoaded: true, decoderLoaded: true }));
      } catch (err: any) {
        setModelStatus(prev => ({ 
          ...prev, 
          loading: false, 
          error: err.message || 'Failed to load SAM 2.1 models.' 
        }));
      }
    };
    init();
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        setImage(img);
        setPoints([]);
        setSegmentation(null);
        
        setTimeout(async () => {
          setIsProcessing(true);
          try {
            await sam2Service.setAndEmbedImage(img);
          } catch (err) {
            console.error(err);
          } finally {
            setIsProcessing(false);
          }
        }, 300);
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const addPoint = useCallback(async (newPoint: Point) => {
    const updatedPoints = [...points, newPoint];
    setPoints(updatedPoints);
    
    setIsProcessing(true);
    try {
      const result = await sam2Service.segment(updatedPoints);
      setSegmentation(result);
    } catch (err) {
      console.error('Segmentation failed:', err);
    } finally {
      setIsProcessing(false);
    }
  }, [points]);

  const resetAll = () => {
    setPoints([]);
    setSegmentation(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* Navbar */}
      <nav className="bg-slate-900/80 backdrop-blur-md border-b border-slate-800 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-lg">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
              </svg>
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-violet-400">
              SAM 2.1 Hiera
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {modelStatus.loading ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-indigo-500/10 text-indigo-400 rounded-full text-xs font-semibold animate-pulse border border-indigo-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-400"></div>
                Loading Engine {modelStatus.progress}%
              </div>
            ) : modelStatus.error ? (
               <div className="text-xs font-semibold text-red-400 px-3 py-1 bg-red-500/10 rounded-full border border-red-500/20">
                  Model Error
               </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 text-emerald-400 rounded-full text-xs font-semibold border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400"></div>
                Engine Active
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Input & Controls</h2>
            
            <div className="space-y-4">
              <label className="block">
                <span className="sr-only">Choose image</span>
                <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-700 rounded-xl hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all cursor-pointer group">
                  <svg className="w-8 h-8 text-slate-600 group-hover:text-indigo-400 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="text-xs font-medium text-slate-500 group-hover:text-indigo-300">Click to upload image</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </div>
              </label>

              <div className="pt-2">
                <button 
                  onClick={resetAll}
                  disabled={!points.length}
                  className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl transition-colors disabled:opacity-30 flex items-center justify-center gap-2 border border-slate-700"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </section>

          <section className="bg-slate-900 p-6 rounded-2xl shadow-xl border border-slate-800">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">Instructions</h2>
            <ul className="space-y-3 text-sm text-slate-400">
              <li className="flex gap-3 items-start">
                <span className="bg-indigo-500/20 text-indigo-400 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 mt-0.5 border border-indigo-500/20">1</span>
                <span>Upload a source image to the workspace.</span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="bg-indigo-500/20 text-indigo-400 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 mt-0.5 border border-indigo-500/20">2</span>
                <span><b className="text-slate-200">Left click</b> to select an object or part.</span>
              </li>
              <li className="flex gap-3 items-start">
                <span className="bg-indigo-500/20 text-indigo-400 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0 mt-0.5 border border-indigo-500/20">3</span>
                <span><b className="text-slate-200">Right click</b> to exclude specific areas.</span>
              </li>
            </ul>
          </section>

          {segmentation && (
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-2xl text-white shadow-2xl shadow-indigo-900/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-widest opacity-80">Confidence</span>
                <span className="text-lg font-bold">{(segmentation.score * 100).toFixed(1)}%</span>
              </div>
              <div className="w-full bg-white/20 h-1.5 rounded-full overflow-hidden mt-3">
                <div 
                  className="bg-white h-full transition-all duration-500" 
                  style={{ width: `${segmentation.score * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="bg-slate-900 p-4 rounded-2xl shadow-xl border border-slate-800 h-full flex flex-col min-h-[600px]">
            <div className="flex items-center justify-between mb-4 px-2">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]"></div>
                <h2 className="text-lg font-bold text-slate-200">SAM2.1 Hiera Workspace</h2>
              </div>
              <div className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                SAM 2.1 Hiera
              </div>
            </div>
            
            <ImageCanvas 
              image={image}
              points={points}
              onAddPoint={addPoint}
              segmentation={segmentation}
              isLoading={isProcessing}
            />
          </div>
        </div>
      </main>

      {modelStatus.loading && modelStatus.progress < 100 && (
        <div className="fixed inset-0 z-[100] bg-slate-950/95 backdrop-blur-xl flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-8">
            <div className="space-y-3">
              <div className="bg-indigo-600 w-16 h-16 rounded-2xl mx-auto flex items-center justify-center shadow-2xl shadow-indigo-600/30 mb-6">
                <svg className="w-8 h-8 text-white animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-slate-100">Initializing Engine</h2>
              <p className="text-slate-400 leading-relaxed">
                Downloading latest SAM 2.1 weights for local execution...
              </p>
            </div>
            <div className="space-y-2">
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div 
                  className="bg-indigo-500 h-full transition-all duration-300 shadow-[0_0_12px_rgba(99,102,241,0.5)]" 
                  style={{ width: `${modelStatus.progress}%` }}
                />
              </div>
              <div className="text-xs font-bold text-indigo-400 uppercase tracking-widest">
                {modelStatus.progress}% Complete
              </div>
            </div>
          </div>
        </div>
      )}

      {modelStatus.error && (
        <div className="fixed bottom-6 right-6 z-[101] max-w-sm bg-red-600 text-white p-5 rounded-2xl shadow-2xl border border-red-500/50">
          <div className="flex gap-3">
             <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
             </svg>
             <div>
                <p className="font-bold mb-1 leading-none">Initialization Error</p>
                <p className="text-sm opacity-90 leading-snug">{modelStatus.error}</p>
             </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
