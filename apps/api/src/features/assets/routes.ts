import type {
  FastifyInstance
} from "fastify";

import type {
  AssetController
} from "./controller.js";

export interface AssetRoutesOptions {
  controller: AssetController;
}

export async function registerAssetRoutes(
  app: FastifyInstance,
  options: AssetRoutesOptions
): Promise<void> {

  app.get(
    "/assets",
    options.controller.listAssets
  );

  app.get(
    "/assets/:id",
    options.controller.getAsset
  );
}
