import { AppComponents, EntityStatusAnalyzerComponent, Registry } from '../types'

export function createEntityStatusAnalyzerComponent({
  catalyst
}: Pick<AppComponents, 'catalyst'>): EntityStatusAnalyzerComponent {
  async function checkIfAvailableOnCatalyst(id: string): Promise<boolean> {
    const entity = await catalyst.getEntityById(id)
    return !!entity
  }

  async function getEntityStatus(registry: Registry.DbEntity): Promise<Registry.EntityStatus> {
    const catalyst = Registry.Status.COMPLETE // if there is a registry, it was already uploaded to catalyst
    const assetBundles = {
      mac: registry.bundles.assets.mac || Registry.Status.PENDING,
      windows: registry.bundles.assets.windows || Registry.Status.PENDING
    }
    const lods = {
      mac: registry.bundles.lods.mac || Registry.Status.PENDING,
      windows: registry.bundles.lods.windows || Registry.Status.PENDING
    }

    /* criteria:
     * - mac and windows asset bundles must be complete
     * - mac and windows lods must be complete
     */
    const isComplete =
      [...Object.values(assetBundles), ...Object.values(lods)].filter(
        (value: Registry.Status) => value !== Registry.Status.COMPLETE
      ).length === 0

    return {
      complete: isComplete,
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
