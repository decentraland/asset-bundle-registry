import { promises as fs } from 'fs'

/**
 * Reads a CSV file from the given path and parses its content.
 * @param filePath - The path to the CSV file.
 * @returns A promise that resolves to an array of objects representing the CSV data.
 */
export async function readCSV(filePath: string): Promise<Record<string, string>[]> {
  try {
    const data = await fs.readFile(filePath, 'utf8')
    const lines = data.split('\n').filter((line) => line.trim())

    const headers = lines[0].split(',').map((header) => header.trim())

    const result = lines.slice(1).map((line) => {
      const values = line.split(',').map((value) => value.trim())
      return headers.reduce<Record<string, string>>((obj, header, index) => {
        obj[header] = values[index]
        return obj
      }, {})
    })

    return result
  } catch (error: any) {
    throw new Error('Could not read or parse the CSV file.')
  }
}
