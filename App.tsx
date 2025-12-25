
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
        
        setIsProcessing(true);
        try {
          await sam2Service.setAndEmbedImage(img);
        } catch (err) {
          console.error(err);
        } finally {
          setIsProcessing(false);
        }
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
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-sm">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 10l-2 1m0 0l-2-1m2 1v2.5M20 7l-2 1m2-1l-2-1m2 1v2.5M14 4l-2-1-2 1M4 7l2-1M4 7l2 1M4 7v2.5M12 21l-2-1m2 1l2-1m-2 1v-2.5M6 18l-2-1v-2.5M18 18l2-1v-2.5" />
              </svg>
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              SAM 2.1 Interactive
            </h1>
          </div>
          
          <div className="flex items-center gap-4">
            {modelStatus.loading ? (
              <div className="flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-semibold animate-pulse border border-indigo-100">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                Loading SAM 2.1 {modelStatus.progress}%
              </div>
            ) : modelStatus.error ? (
               <div className="text-xs font-semibold text-red-600 px-3 py-1 bg-red-50 rounded-full border border-red-100">
                  Model Error
               </div>
            ) : (
              <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-700 rounded-full text-xs font-semibold border border-emerald-100">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div>
                SAM 2.1 (Ultralytics) Active
              </div>
            )}
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-1 space-y-6">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Input & Controls</h2>
            
            <div className="space-y-4">
              <label className="block">
                <span className="sr-only">Choose image</span>
                <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all cursor-pointer group">
                  <svg className="w-8 h-8 text-slate-400 group-hover:text-indigo-500 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span className="text-xs font-medium text-slate-500 group-hover:text-indigo-600">Click to upload image</span>
                  <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} />
                </div>
              </label>

              <div className="pt-2">
                <button 
                  onClick={resetAll}
                  disabled={!points.length}
                  className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  Clear Selection
                </button>
              </div>
            </div>
          </section>

          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Instructions</h2>
            <ul className="space-y-3 text-sm text-slate-600">
              <li className="flex gap-3">
                <span className="bg-indigo-100 text-indigo-600 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0">1</span>
                <span>Upload an image.</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-indigo-100 text-indigo-600 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0">2</span>
                <span><b>Left click</b> to select object.</span>
              </li>
              <li className="flex gap-3">
                <span className="bg-indigo-100 text-indigo-600 w-5 h-5 flex items-center justify-center rounded-full text-[10px] font-bold shrink-0">3</span>
                <span><b>Right click</b> to exclude area.</span>
              </li>
            </ul>
          </section>

          {segmentation && (
            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 p-6 rounded-2xl text-white shadow-lg shadow-indigo-200">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold uppercase tracking-widest opacity-80">Confidence</span>
                <span className="text-lg font-bold">{(segmentation.score * 100).toFixed(1)}%</span>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200 h-full flex flex-col">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></div>
                <h2 className="text-lg font-bold text-slate-800">Workspace (SAM 2.1 Hiera)</h2>
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
        <div className="fixed inset-0 z-[100] bg-white/95 backdrop-blur-md flex items-center justify-center p-6">
          <div className="max-w-md w-full text-center space-y-8">
            <div className="space-y-3">
              <h2 className="text-2xl font-bold text-slate-900">Downloading SAM 2.1 Engine</h2>
              <p className="text-slate-500 leading-relaxed">
                Fetching latest Ultralytics-compatible weights for in-browser inference.
              </p>
            </div>
            <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
              <div 
                className="bg-indigo-600 h-full transition-all duration-300" 
                style={{ width: `${modelStatus.progress}%` }}
              />
            </div>
          </div>
        </div>
      )}

      {modelStatus.error && (
        <div className="fixed bottom-6 right-6 z-[101] max-w-sm bg-red-600 text-white p-4 rounded-2xl shadow-2xl">
          <p className="font-bold">Error</p>
          <p className="text-sm opacity-90">{modelStatus.error}</p>
        </div>
      )}
    </div>
  );
};

export default App;
