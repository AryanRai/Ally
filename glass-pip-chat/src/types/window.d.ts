import { PipAPI } from './electron';

declare global {
  interface Window {
    pip: PipAPI;
  }
}

export {};