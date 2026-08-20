import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, extname, resolve as resolvePath, sep } from 'node:path'
import type { UserConfig } from 'tsdown'
import { clientBundle } from '../tsdown.client.ts'

const DATA_URL_QUERY = '?dataurl'
const DATA_URL_VIRTUAL_PREFIX = '\0persona-data-url:'

const MIME_BY_EXTENSION: Readonly<Record<string, string>> = Object.freeze({
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
})

/** Resolve an emitted lib/types asset import back to this package's source tree. */
function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolvePath(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = `${sep}lib${sep}types${sep}`
  const boundary = emitted.indexOf(marker)
  if (boundary < 0) return emitted
  return resolvePath(emitted.slice(0, boundary), 'src', emitted.slice(boundary + marker.length))
}

const baseConfig = clientBundle(
  '@deepseek-ai/dsh-client-ui-persona-runtime',
  ['lib/types/index.js', 'lib/types/invariant.js'],
  { hostPhase: true },
)

/**
 * Persona visual assets are data URLs inside the browser bundle for M2.1.
 * This keeps linked/profile installs self-contained and avoids a separate
 * static-asset route while the public Persona Pack format is still deferred.
 */
export default (inlineConfig: Pick<UserConfig, 'env'>): UserConfig[] => {
  const configs = baseConfig(inlineConfig)
  return configs.map((config) => {
    if (config.platform !== 'browser') return config
    return {
      ...config,
      plugins: [
        ...(config.plugins ?? []),
        {
          name: 'persona-data-url-assets',
          resolveId(source: string, importer: string | undefined) {
            if (!source.endsWith(DATA_URL_QUERY)) return null
            const bareSource = source.slice(0, -DATA_URL_QUERY.length)
            const fileId = importer === undefined
              ? bareSource
              : sourceAssetPath(bareSource, importer)
            return DATA_URL_VIRTUAL_PREFIX + fileId
          },
          async load(virtualId: string) {
            if (!virtualId.startsWith(DATA_URL_VIRTUAL_PREFIX)) return null
            const fileId = virtualId.slice(DATA_URL_VIRTUAL_PREFIX.length)
            this.addWatchFile(fileId)
            const mime = MIME_BY_EXTENSION[extname(fileId).toLowerCase()]
            if (mime === undefined) {
              throw new Error(`persona asset type is not supported: ${fileId}`)
            }
            const bytes = await readFile(fileId)
            const dataUrl = `data:${mime};base64,${bytes.toString('base64')}`
            return `export default ${JSON.stringify(dataUrl)};`
          },
        },
      ],
    }
  })
}
