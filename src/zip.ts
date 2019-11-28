import { loadAsync } from 'jszip'
import { inflate } from 'pako'

/**
 * Decompress a '.zip' archive given as a buffer.
 * @param archive The archive as a buffer.
 * @param paths The absolute paths of files in the archive to decompress.
 * @returns {Promise<Map<string, string>>} A map of path name to decompressed file content.
 */
export async function unzip(archive: ArrayBuffer, ...paths: string[]): Promise<Map<string, string>> {
  const allowed = new Set(paths)
  const zip = await loadAsync(archive)
  const original = Object.entries(zip.files)
  const result = new Map()

  for(const [path, file] of original) {
    if(file.dir || path.startsWith('.')) continue
    if(allowed.size > 0 && !allowed.has(path)) continue

    const compressed = (<any>file)._data.compressedContent
    const uncompressed = await inflate(compressed, { raw: true, to: 'string' })

    result.set(path, uncompressed)
  }

  return result
}
