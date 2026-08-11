import type { AssetDto } from "./dto.js";
import type { AssetRepository } from "./repository.js";
import { mapAssetToDto } from "./mapper.js";

export class AssetService {

  constructor(
    private readonly repository:
      AssetRepository
  ) {}

  async listAssets(): Promise<AssetDto[]> {
    const assets =
      await this.repository.findAll();

    const metrics =
      await this.repository.findMetrics(
        assets.map(asset => asset.id)
      );

    return assets.map(
      asset =>
        mapAssetToDto(
          asset,
          metrics.filter(
            metric =>
              metric.asset_id === asset.id
          )
        )
    );
  }

  async getAsset(
    id: string
  ): Promise<AssetDto | null> {

    const asset =
      await this.repository.findById(id);

    if (!asset) {
      return null;
    }

    const metrics =
      await this.repository.findMetrics(
        [asset.id]
      );

    return mapAssetToDto(
      asset,
      metrics
    );
  }
}
