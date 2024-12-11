import { AppComponents, EntityStatusAnalyzerComponent, Registry } from '../types'

export function createEntityStatusAnalyzerComponent({
  catalyst
}: Pick<AppComponents, 'catalyst'>): EntityStatusAnalyzerComponent {
  async function checkIfAvailableOnCatalyst(id: string): Promise<boolean> {
    const entity = await catalyst.getEntityById(id)
    return !!entity
  }

  async function getEntityStatus(registry: Registry.DbEntity): Promise<Registry.EntityStatus> {
    const catalyst = Registry.EntityStatusValues.COMPLETE // if there is a registry, it was already uploaded to catalyst
    const assetBundles = {
      mac: registry.bundles.mac || Registry.BundleStatusValues.PENDING,
      windows: registry.bundles.windows || Registry.BundleStatusValues.PENDING
    }
    const lods = {
      // TODO: Unmock
      mac: Registry.EntityStatusValues.COMPLETE,
      windows: Registry.EntityStatusValues.COMPLETE
    }

    return {
      complete:
        [...Object.values(assetBundles), ...Object.values(lods)].filter(
          (value: Registry.BundleStatusValues) => value !== Registry.BundleStatusValues.OPTMIZED
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
