export {};

declare global {
  interface Window {
    THREE: any;
  }

  interface Navigator {
    gpu?: any;
  }

  /** WebGPU usage flags (ambient for TS compile in browser env) */
  const GPUBufferUsage: any;
}

