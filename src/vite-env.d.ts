/// <reference types="vite/client" />
import type { DeveloperUtilityApi } from "../electron/types";
declare global {
  interface Window {
    developerUtility: DeveloperUtilityApi;
  }
}
