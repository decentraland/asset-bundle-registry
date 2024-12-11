import { AppComponents, EntityStatusAnalyzerComponent, Registry } from '../types'

export function createEntityStatusAnalyzerComponent({
  catalyst
}: Pick<AppComponents, 'catalyst'>): EntityStatusAnalyzerComponent {
  async function checkIfAvailableOnCatalyst(id: string): Promise<boolean> {
    const entity = await catalyst.getEntityById(id)
    return !!entity
  }

  async function getEntityStatus(registry: Registry.DbEntity): Promise<Registry.EntityStatus> {
    const catalyst = Registry.StatusValues.COMPLETE // if there is a registry, it was already uploaded to catalyst
    const assetBundles = {
      mac: registry.bundles.mac || Registry.StatusValues.PENDING,
      windows: registry.bundles.windows || Registry.StatusValues.PENDING
    }
    const lods = {
      // TODO: Unmock
      mac: Registry.StatusValues.COMPLETE,
      windows: Registry.StatusValues.COMPLETE
    }

    return {
      complete:
        [...Object.values(assetBundles), ...Object.values(lods)].filter(
          (value: Registry.StatusValues) => value !== Registry.StatusValues.COMPLETE
        ).length === 0,
      assetBundles,
      lods,
      catalyst
    }
  }

  function isOwnedBy(registry: Registry.DbEntity | null, userAddress: string): boolean {
    return !!registry && registry.deployer.toLocaleLowerCase() === userAddress.toLocaleLowerCase()
  }

  return { checkIfAvailableOnCatalyst, getEntityStatus, isOwnedBy }
}
