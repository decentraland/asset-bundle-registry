export function splitPointersInBatchOfN(pointers: string[], n: number): string[][] {
  const batches = []

  for (let i = 0; i < pointers.length; i += n) {
    batches.push(pointers.slice(i, i + n))
  }

  return batches
}
