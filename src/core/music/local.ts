import { saveLyric, saveMusicUrl } from '@/utils/data'
import { updateListMusics } from '@/core/list'
import {
  buildLyricInfo,
  getCachedLyricInfo,
  getOnlineOtherSourceLyricByLocal,
  getOnlineOtherSourceLyricInfo,
  getOnlineOtherSourceMusicUrl,
  getOnlineOtherSourceMusicUrlByLocal,
  getOnlineOtherSourcePicByLocal,
  getOnlineOtherSourcePicUrl,
  getOtherSource,
} from './utils'
import { getLocalFilePath } from '@/utils/music'
import { readLyric, readPic } from '@/utils/localMediaMetadata'
import { stat, existsFile, mkdir, writeFile } from '@/utils/fs'
import settingState from '@/store/setting/state'
import { btoa } from 'react-native-quick-base64'
import playerState from '@/store/player/state'

let webDAVModule: typeof import('@/core/webdavMusic/drive') | null = null
let webDAVLog: {
  info: (...args: unknown[]) => void
  warn: (...args: unknown[]) => void
  error: (...args: unknown[]) => void
} | null = null

const loadWebDAVModule = async () => {
  if (!webDAVModule) {
    webDAVModule = await import('@/core/webdavMusic/drive')
    const logger = await import('@/core/webdavMusic/logger')
    webDAVLog = logger.webDAVLog
  }
  return webDAVModule
}

const getOtherSourceByLocal = async <T>(
  musicInfo: LX.Music.MusicInfoLocal,
  handler: (infos: LX.Music.MusicInfoOnline[]) => Promise<T>
) => {
  let result: LX.Music.MusicInfoOnline[] = []
  result = await getOtherSource(musicInfo)
  if (result.length)
    try {
      return await handler(result)
    } catch {}
  if (musicInfo.name.includes('-')) {
    const [name, singer] = musicInfo.name.split('-').map((val) => val.trim())
    result = await getOtherSource(
      {
        ...musicInfo,
        name,
        singer,
      },
      true
    )
    if (result.length)
      try {
        return await handler(result)
      } catch {}
    result = await getOtherSource(
      {
        ...musicInfo,
        name: singer,
        singer: name,
      },
      true
    )
    if (result.length)
      try {
        return await handler(result)
      } catch {}
  }
  let fileName =
    (await stat(musicInfo.meta.filePath).catch(() => ({ name: null }))).name ??
    musicInfo.meta.filePath.split(/\/|\\/).at(-1)
  if (fileName) {
    fileName = fileName.substring(0, fileName.lastIndexOf('.'))
    if (fileName != musicInfo.name) {
      if (fileName.includes('-')) {
        const [name, singer] = fileName.split('-').map((val) => val.trim())
        result = await getOtherSource(
          {
            ...musicInfo,
            name,
            singer,
          },
          true
        )
        if (result.length)
          try {
            return await handler(result)
          } catch {}
        result = await getOtherSource(
          {
            ...musicInfo,
            name: singer,
            singer: name,
          },
          true
        )
      } else {
        result = await getOtherSource(
          {
            ...musicInfo,
            name: fileName,
            singer: '',
          },
          true
        )
      }
      if (result.length)
        try {
          return await handler(result)
        } catch {}
    }
  }

  throw new Error('source not found')
}

const downloadWebDAVMusic = async (musicInfo: LX.WebDAV.MusicInfo): Promise<string> => {
  const module = await loadWebDAVModule()
  const { getWebDAVDownloadUrl, updateWebDAVMusicMeta } = module
  const { downloadFile } = await import('@/utils/fs')
  
  const downloadUrl = getWebDAVDownloadUrl(musicInfo)
  const downloadDir = settingState.setting['download.path'] || '/storage/emulated/0/Music/LX-N Music'
  const fileName = musicInfo.meta.fileName
  const filePath = `${downloadDir}/${fileName}`

  if (downloadPromises.has(filePath)) {
    webDAVLog?.info('downloadWebDAVMusic: waiting for existing download', { filePath })
    return downloadPromises.get(filePath)!
  }

  webDAVLog?.info('downloadWebDAVMusic called', { musicId: musicInfo.id, fileName, filePath })

  if (await existsFile(filePath)) {
    webDAVLog?.info('downloadWebDAVMusic: file exists locally', { filePath })
    return filePath
  }

  webDAVLog?.info('downloadWebDAVMusic: starting new download', { filePath })
  const downloadPromise = (async () => {
    try {
      await mkdir(downloadDir)
      webDAVLog?.info('downloadWebDAVMusic: download directory created', { downloadDir })

      const username = settingState.setting['sync.webdav.username']
      const password = settingState.setting['sync.webdav.password']
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Mobile Safari/537.36',
      }
      if (username && password) {
        headers['Authorization'] = 'Basic ' + btoa(`${username}:${password}`)
      }

      webDAVLog?.info('downloadWebDAVMusic: fetching file', { downloadUrl, filePath })
      await downloadFile(downloadUrl, filePath, { headers }).promise

      webDAVLog?.info('downloadWebDAVMusic: download completed successfully', { filePath })
      await readEmbeddedCoverAndSave(musicInfo, filePath, updateWebDAVMusicMeta)

      return filePath
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      const errorStack = error instanceof Error ? error.stack : ''
      webDAVLog?.error('downloadWebDAVMusic: error occurred', {
        message: errorMessage,
        stack: errorStack,
        errorType: error?.constructor?.name,
        errorString: String(error)
      })
      throw error
    } finally {
      downloadPromises.delete(filePath)
    }
  })()

  downloadPromises.set(filePath, downloadPromise)
  return downloadPromise
}

const downloadPromises = new Map<string, Promise<string>>()

const readEmbeddedCoverAndSave = async (
  musicInfo: LX.WebDAV.MusicInfo,
  filePath: string,
  updateWebDAVMetaFn: typeof import('@/core/webdavMusic/drive').updateWebDAVMusicMeta
) => {
  try {
    webDAVLog?.info('readEmbeddedCoverAndSave: reading embedded cover', { musicId: musicInfo.id, filePath })
    const picPath = await readPic(filePath)
    if (picPath) {
      webDAVLog?.info('readEmbeddedCoverAndSave: found embedded cover', { picPath })
      const updatedPicUrl = picPath.startsWith('/') ? `file://${picPath}` : picPath
      await updateWebDAVMetaFn(musicInfo.id, { picUrl: updatedPicUrl })
      webDAVLog?.info('readEmbeddedCoverAndSave: saved cover to meta', { picUrl: updatedPicUrl })

      if (playerState.playMusicInfo.musicInfo?.id === musicInfo.id) {
        webDAVLog?.info('readEmbeddedCoverAndSave: triggering pic update for current playing song')
        global.app_event.picUpdated()
      }
    } else {
      webDAVLog?.info('readEmbeddedCoverAndSave: no embedded cover found, will use online source')
    }
  } catch (error) {
    webDAVLog?.warn('readEmbeddedCoverAndSave: failed to read embedded cover', { error })
  }
}

export const getMusicUrl = async ({
  musicInfo,
  isRefresh,
  allowToggleSource = true,
  onToggleSource = () => {},
}: {
  musicInfo: LX.Music.MusicInfoLocal
  isRefresh: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
  allowToggleSource?: boolean
}): Promise<string> => {
  if (!isRefresh) {
    const isWebDAV = 'webdav' in musicInfo.meta && (musicInfo.meta as any).webdav === true
    if (isWebDAV) {
      webDAVLog?.info('getMusicUrl: detected WebDAV music, calling downloadWebDAVMusic', { musicId: musicInfo.id })
      return downloadWebDAVMusic(musicInfo as LX.WebDAV.MusicInfo)
    }

    const path = await getLocalFilePath(musicInfo)
    if (path) return path
  }

  try {
    return await getOnlineOtherSourceMusicUrlByLocal(musicInfo, isRefresh).then(
      ({ url, quality, isFromCache }) => {
        if (!isFromCache) void saveMusicUrl(musicInfo, quality, url)
        return url
      }
    )
  } catch {}

  if (!allowToggleSource) throw new Error('failed')

  onToggleSource()
  return getOtherSourceByLocal(musicInfo, async (otherSource) => {
    return getOnlineOtherSourceMusicUrl({
      musicInfos: [...otherSource],
      onToggleSource,
      isRefresh,
    }).then(({ url, quality: targetQuality, musicInfo: targetMusicInfo, isFromCache }) => {
      // saveLyric(musicInfo, data.lyricInfo)
      if (!isFromCache) void saveMusicUrl(targetMusicInfo, targetQuality, url)

      // TODO: save url ?
      return url
    })
  })
}

export const getPicUrl = async ({
  musicInfo,
  listId,
  isRefresh,
  skipFilePic,
  onToggleSource = () => {},
}: {
  musicInfo: LX.Music.MusicInfoLocal
  listId?: string | null
  isRefresh: boolean
  skipFilePic?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  const isWebDAVMusic = 'webdav' in musicInfo.meta && (musicInfo.meta as any).webdav === true
  
  if (!isRefresh && !skipFilePic) {
    if (isWebDAVMusic) {
      // 验证原音频文件是否存在
      const audioFilePath = musicInfo.meta.filePath
      if (audioFilePath) {
        const audioExists = await existsFile(audioFilePath).catch(() => false)
        if (!audioExists) {
          webDAVLog?.warn('getPicUrl: audio file not found, clearing cached picUrl', { audioFilePath })
          const module = await loadWebDAVModule()
          void module.updateWebDAVMusicMeta(musicInfo.id, { picUrl: '' })
        }
      }
      
      if (musicInfo.meta.picUrl?.startsWith('file://')) {
        const picFilePath = musicInfo.meta.picUrl.replace('file://', '')
        const picExists = await existsFile(picFilePath).catch(() => false)
        if (picExists) {
          webDAVLog?.info('getPicUrl: RETURN - using cached local cover (verified)', { musicId: musicInfo.id, picUrl: musicInfo.meta.picUrl })
          return musicInfo.meta.picUrl
        } else {
          webDAVLog?.warn('getPicUrl: cached cover file not found, will re-extract', { picFilePath })
        }
      }
    }

    let pic = await readPic(musicInfo.meta.filePath).catch(() => null)        
    if (pic) {
      if (pic.startsWith('/')) pic = `file://${pic}`
      if (isWebDAVMusic) {
        webDAVLog?.info('getPicUrl: RETURN - found local embedded cover', { pic })
        const module = await loadWebDAVModule()
        void module.updateWebDAVMusicMeta(musicInfo.id, { picUrl: pic })
      }
      return pic
    }

    if (musicInfo.meta.picUrl) {
      if (musicInfo.meta.picUrl.startsWith('file://')) {
        const picFilePath = musicInfo.meta.picUrl.replace('file://', '')
        const picExists = await existsFile(picFilePath).catch(() => false)
        if (picExists) {
          return musicInfo.meta.picUrl
        }
      } else {
        return musicInfo.meta.picUrl
      }
    }
  }

  if (isWebDAVMusic) {
    webDAVLog?.info('getPicUrl: WebDAV music has no local cover, return empty (use manual fetch)')
    return ''
  }

  try {
    const result = await getOnlineOtherSourcePicByLocal(musicInfo)
    webDAVLog?.info('getPicUrl: fetched online cover', { url: result.url })
    return result.url
  } catch (err) {
    webDAVLog?.warn('getPicUrl: getOnlineOtherSourcePicByLocal failed', { err })
  }

  onToggleSource()
  return getOtherSourceByLocal(musicInfo, async (otherSource) => {
    return getOnlineOtherSourcePicUrl({
      musicInfos: [...otherSource],
      onToggleSource,
      isRefresh,
    }).then(async ({ url, musicInfo: targetMusicInfo, isFromCache }) => {
      return url
    })
  })
}

const getMusicFileLyric = async (filePath: string) => {
  const lyric = await readLyric(filePath).catch(() => null)
  if (!lyric) return null
  return {
    lyric,
  }
}
export const getLyricInfo = async ({
  musicInfo,
  isRefresh,
  skipFileLyric,
  onToggleSource = () => {},
}: {
  musicInfo: LX.Music.MusicInfoLocal
  skipFileLyric?: boolean
  isRefresh: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<LX.Player.LyricInfo> => {
  if (!isRefresh && !skipFileLyric) {
    // const lyricInfo = await getCachedLyricInfo(musicInfo)
    // if (lyricInfo?.rawlrcInfo.lyric && lyricInfo.lyric != lyricInfo.rawlrcInfo.lyric) {
    //   // 存在已编辑歌词
    //   return buildLyricInfo(lyricInfo)
    // }

    // 尝试读取文件内歌词
    const rawlrcInfo = await getMusicFileLyric(musicInfo.meta.filePath)
    if (rawlrcInfo) return buildLyricInfo(rawlrcInfo)

    const lyricInfo = await getCachedLyricInfo(musicInfo)
    if (lyricInfo?.lyric) return buildLyricInfo(lyricInfo)
  }

  try {
    return await getOnlineOtherSourceLyricByLocal(musicInfo, isRefresh).then(
      ({ lyricInfo, isFromCache }) => {
        if (!isFromCache) void saveLyric(musicInfo, lyricInfo)
        return buildLyricInfo(lyricInfo)
      }
    )
  } catch {}

  onToggleSource()
  return getOtherSourceByLocal(musicInfo, async (otherSource) => {
    return getOnlineOtherSourceLyricInfo({
      musicInfos: [...otherSource],
      onToggleSource,
      isRefresh,
    }).then(async ({ lyricInfo, musicInfo: targetMusicInfo, isFromCache }) => {
      void saveLyric(musicInfo, lyricInfo)

      if (isFromCache) return buildLyricInfo(lyricInfo)
      void saveLyric(targetMusicInfo, lyricInfo)

      return buildLyricInfo(lyricInfo)
    })
  })
}
