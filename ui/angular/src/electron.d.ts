// ui/angular/src/electron.d.ts
export {};

declare global {
  interface ElectronApi {
    ping: () => Promise<{ message: string; core: string }>;
  }

  interface Window {
    electron?: ElectronApi;
  }
}
