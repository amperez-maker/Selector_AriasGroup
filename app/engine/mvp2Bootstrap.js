// app/engine/mvp2Bootstrap.js
// MVP2 Step 2: single-init bootstrap for SystemIntegration + SystemMetadataGenerator
// Usage (ESM):
//   import { getMVP2Integration } from "./mvp2Bootstrap.js";
//   getMVP2Integration().catch(console.error);
//
// Then in Step 3:
//   const integration = await getMVP2Integration();
//   const meta = await integration.getSystemForEngine(systemId);

import { SystemMetadataGenerator } from "./systemMetadataGenerator.js";
import { SystemIntegration } from "./systemIntegration.js";

let __mvp2Integration = null;
let __mvp2InitPromise = null;

/**
 * Returns a singleton instance of SystemIntegration (catalog loaded once).
 * Safe to call multiple times.
 */
export async function getMVP2Integration() {
  if (__mvp2Integration) return __mvp2Integration;
  if (__mvp2InitPromise) return __mvp2InitPromise;

  __mvp2InitPromise = (async () => {
    const generator = new SystemMetadataGenerator();
    const integration = new SystemIntegration(generator);
    await integration.initialize();
    __mvp2Integration = integration;
    return __mvp2Integration;
  })();

  return __mvp2InitPromise;
}
