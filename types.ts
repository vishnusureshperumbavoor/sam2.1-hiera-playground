
export interface Point {
  x: number;
  y: number;
  label: number; // 1 for positive, 0 for negative
}

export interface Box {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ModelStatus {
  encoderLoaded: boolean;
  decoderLoaded: boolean;
  loading: boolean;
  error: string | null;
  progress: number;
}

export interface SegmentationResult {
  mask: Uint8Array | null;
  score: number;
  width: number;
  height: number;
}

export enum ModelScale {
  TINY = 'tiny',
  SMALL = 'small',
  BASE_PLUS = 'base+',
  LARGE = 'large'
}
