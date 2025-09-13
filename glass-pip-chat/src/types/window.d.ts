import { PipAPI } from '../../electron/preload';

declare global {
  interface Window {
    pip: PipAPI;
  }
}

export {};