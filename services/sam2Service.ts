
import * as ort from 'onnxruntime-web';
import { Point, SegmentationResult } from '../types';

// Set WASM paths for ONNX Runtime
ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.20.1/dist/';
ort.env.logLevel = 'error';

class SAM2Service {
  private encoderSession: ort.InferenceSession | null = null;
  private decoderSession: ort.InferenceSession | null = null;
  
  private imageEmbeddings: ort.Tensor | null = null;
  private highResFeats0: ort.Tensor | null = null;
  private highResFeats1: ort.Tensor | null = null;
  
  private originalImageSize: { width: number; height: number } | null = null;

  // Using the stable public URLs from the provided research/article
  private MODEL_URLS = {
    encoder: 'https://storage.googleapis.com/lb-artifacts-testing-public/sam2/sam2_hiera_tiny.encoder.ort',
    decoder: 'https://storage.googleapis.com/lb-artifacts-testing-public/sam2/sam2_hiera_tiny.decoder.onnx'
  };

  async loadModels(onProgress?: (progress: number) => void) {
    try {
      if (this.encoderSession && this.decoderSession) {
        onProgress?.(100);
        return;
      }

      const options: ort.InferenceSession.SessionOptions = {
        executionProviders: ['wasm'],
        graphOptimizationLevel: 'all',
      };

      const fetchAndLoad = async (url: string, start: number, end: number) => {
        // We use standard fetch; these GCS buckets are public and CORS-enabled
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch model from ${url} (HTTP ${response.status})`);
        }
        
        const buffer = await response.arrayBuffer();
        onProgress?.(Math.floor(start + (end - start) * 0.8));
        
        const session = await ort.InferenceSession.create(buffer, options);
        onProgress?.(end);
        return session;
      };

      console.log('Fetching SAM2 Encoder...');
      this.encoderSession = await fetchAndLoad(this.MODEL_URLS.encoder, 0, 60);
      
      console.log('Fetching SAM2 Decoder...');
      this.decoderSession = await fetchAndLoad(this.MODEL_URLS.decoder, 60, 100);
      
      console.log('SAM2 Pipeline Ready.');
    } catch (error: any) {
      console.error('SAM2 Init Error:', error);
      throw new Error(`Inference Error: ${error.message}. Please check your internet connection.`);
    }
  }

  async setAndEmbedImage(image: HTMLImageElement): Promise<void> {
    if (!this.encoderSession) throw new Error('Encoder session not initialized');

    this.originalImageSize = { width: image.width, height: image.height };
    
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(image, 0, 0, 1024, 1024);
    
    const imageData = ctx.getImageData(0, 0, 1024, 1024).data;
    const float32Data = new Float32Array(1 * 3 * 1024 * 1024);
    
    // As per the article, SAM2 Tiny often uses [-1, 1] normalization
    for (let i = 0; i < 1024 * 1024; i++) {
      float32Data[i] = (imageData[i * 4] / 255.0) * 2 - 1;                   // R
      float32Data[i + 1024 * 1024] = (imageData[i * 4 + 1] / 255.0) * 2 - 1; // G
      float32Data[i + 2 * 1024 * 1024] = (imageData[i * 4 + 2] / 255.0) * 2 - 1; // B
    }

    const inputTensor = new ort.Tensor('float32', float32Data, [1, 3, 1024, 1024]);
    
    // Note: Input name is often 'image' for these specific .ort exports
    const results = await this.encoderSession.run({ image: inputTensor });
    
    // The outputs are named slightly differently in this export format
    this.imageEmbeddings = results.image_embed || results.image_embeddings;
    
    // Prepare fallback high-res features if not provided by this specific encoder export
    this.highResFeats0 = results.high_res_feats_0 || new ort.Tensor('float32', new Float32Array(1 * 32 * 256 * 256), [1, 32, 256, 256]);
    this.highResFeats1 = results.high_res_feats_1 || new ort.Tensor('float32', new Float32Array(1 * 64 * 128 * 128), [1, 64, 128, 128]);

    if (!this.imageEmbeddings) throw new Error('Encoder failed to produce embeddings');
  }

  async segment(points: Point[]): Promise<SegmentationResult> {
    if (!this.decoderSession || !this.imageEmbeddings || !this.originalImageSize) {
      throw new Error('Inference pipeline not ready');
    }

    const numPoints = points.length;
    const coords = new Float32Array(numPoints * 2);
    const labels = new Float32Array(numPoints);

    points.forEach((p, i) => {
      // Normalize points to 1024x1024 space
      coords[i * 2] = (p.x / this.originalImageSize!.width) * 1024;
      coords[i * 2 + 1] = (p.y / this.originalImageSize!.height) * 1024;
      labels[i] = p.label;
    });

    const inputs = {
      image_embed: this.imageEmbeddings,
      point_coords: new ort.Tensor('float32', coords, [1, numPoints, 2]),
      point_labels: new ort.Tensor('float32', labels, [1, numPoints]),
      mask_input: new ort.Tensor('float32', new Float32Array(256 * 256), [1, 1, 256, 256]),
      has_mask_input: new ort.Tensor('float32', new Float32Array([0]), [1]),
      high_res_feats_0: this.highResFeats0!,
      high_res_feats_1: this.highResFeats1!
    };

    const results = await this.decoderSession.run(inputs);
    
    const masks = results.masks.data as Float32Array;
    const iouPredictions = results.iou_predictions || results.iou_scores;
    const scores = iouPredictions.data as Float32Array;
    
    let bestIdx = 0;
    for (let i = 1; i < scores.length; i++) {
      if (scores[i] > scores[bestIdx]) bestIdx = i;
    }

    const mask256 = masks.slice(bestIdx * 256 * 256, (bestIdx + 1) * 256 * 256);
    const finalMask = this.upscaleMask(mask256, 256, 256, this.originalImageSize.width, this.originalImageSize.height);

    return {
      mask: finalMask,
      score: scores[bestIdx],
      width: this.originalImageSize.width,
      height: this.originalImageSize.height
    };
  }

  private upscaleMask(data: Float32Array, sw: number, sh: number, dw: number, dh: number): Uint8Array {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = sw;
    tempCanvas.height = sh;
    const tempCtx = tempCanvas.getContext('2d')!;
    const tempImageData = tempCtx.createImageData(sw, sh);
    
    for (let i = 0; i < data.length; i++) {
      const val = data[i] > 0 ? 255 : 0;
      const idx = i * 4;
      tempImageData.data[idx] = val;
      tempImageData.data[idx+1] = val;
      tempImageData.data[idx+2] = val;
      tempImageData.data[idx+3] = 255;
    }
    tempCtx.putImageData(tempImageData, 0, 0);
    
    const destCanvas = document.createElement('canvas');
    destCanvas.width = dw;
    destCanvas.height = dh;
    const destCtx = destCanvas.getContext('2d')!;
    destCtx.imageSmoothingEnabled = false; 
    destCtx.drawImage(tempCanvas, 0, 0, dw, dh);
    
    const finalData = destCtx.getImageData(0, 0, dw, dh).data;
    const result = new Uint8Array(dw * dh);
    for (let i = 0; i < dw * dh; i++) {
      result[i] = finalData[i * 4];
    }
    return result;
  }
}

export const sam2Service = new SAM2Service();
