export function getMostUpdatedRegistryByPointers<T extends { pointers: string[] }>(entities: T[]): T[] {
  const groupByWholePointers = entities.reduce(
    (acc, entity) => {
      const key = entity.pointers.join(',')
      if (!acc[key]) {
        acc[key] = []
      }
      acc[key].push(entity)
      return acc
    },
    {} as Record<string, T[]>
  )

  return Object.values(groupByWholePointers)
    .map((group) => (group.length ? group[0] : undefined))
    .filter(Boolean) as T[]
}
