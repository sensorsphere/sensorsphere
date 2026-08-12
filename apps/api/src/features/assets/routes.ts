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

  app.post(
    "/assets",
    options.controller.createAsset
  );

  app.get(
    "/assets/:id",
    options.controller.getAsset
  );

  app.patch(
    "/assets/:id",
    options.controller.updateAsset
  );

  app.patch(
    "/assets/:id/location",
    options.controller.assignAssetLocation
  );

  app.delete(
    "/assets/:id",
    options.controller.deleteAsset
  );
}
