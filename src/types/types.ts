export type Registry = {
  entityId: string
  pointer: string
  assetBundles: {
    version: string
    mac: string[]
    windows: string[]
    timestamp: number
  }[]
}
