export function sliceArray<T>(array: T[], n: number): T[][] {
  const batches: T[][] = []

  for (let i = 0; i < array.length; i += n) {
    batches.push(array.slice(i, i + n))
  }

  return batches
}
