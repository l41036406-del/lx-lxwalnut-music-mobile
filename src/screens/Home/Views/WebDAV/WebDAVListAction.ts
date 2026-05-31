import { findMusic } from '@/utils/musicSdk'
import { getWebDAVConfig, updateWebDAVMusicMeta, getWebDAVDownloadUrl } from '@/core/webdavMusic/drive'
import { downloadFile, existsFile, mkdir } from '@/utils/fs'
import { toast, clipboardWriteText } from '@/utils/tools'
import settingState from '@/store/setting/state'
import { btoa } from 'react-native-quick-base64'
import { updateListMusics } from '@/core/list'
import { webDAVLog } from '@/core/webdavMusic/logger'
import { readPic } from '@/utils/localMediaMetadata'

export const handleWebDAVDownload = async (musicInfo: LX.WebDAV.MusicInfo): Promise<string | null> => {
  const downloadUrl = getWebDAVDownloadUrl(musicInfo)
  const downloadDir = settingState.setting['download.path'] || '/storage/emulated/0/Music/LX-N Music'
  const fileName = musicInfo.meta.fileName
  const filePath = `${downloadDir}/${fileName}`

  try {
    await mkdir(downloadDir)
    
    const username = settingState.setting['sync.webdav.username']
    const password = settingState.setting['sync.webdav.password']
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; Pixel 3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Mobile Safari/537.36',
    }
    if (username && password) {
      headers['Authorization'] = 'Basic ' + btoa(`${username}:${password}`)
    }

    webDAVLog.info('handleWebDAVDownload: downloading file', { downloadUrl, filePath })
    await downloadFile(downloadUrl, filePath, { headers }).promise
    webDAVLog.info('handleWebDAVDownload: download completed, extracting embedded cover')
    
    // 更新配置中的文件路径（确保指向新下载的文件）
    await updateWebDAVMusicMeta(musicInfo.id, { filePath })
    
    // 提取并更新封面
    const picPath = await readPic(filePath).catch(() => null)
    let newPicUrl: string | null = null
    if (picPath) {
      newPicUrl = picPath.startsWith('/') ? `file://${picPath}` : picPath
      await updateWebDAVMusicMeta(musicInfo.id, { picUrl: newPicUrl })
      webDAVLog.info('handleWebDAVDownload: saved embedded cover to meta', { picUrl: newPicUrl })
    } else {
      webDAVLog.info('handleWebDAVDownload: no embedded cover found in file')
    }
    
    // 触发 UI 刷新
    global.app_event.picUpdated()
    
    toast(`下载成功：${fileName}`)
    return newPicUrl
  } catch (error: any) {
    webDAVLog.error('handleWebDAVDownload: download failed', { error: error.message })
    toast(`下载失败：${error.message}`, 'long')
    return null
  }
}

export const handleFetchWebDAVPicFromOnline = async (
  musicInfo: LX.WebDAV.MusicInfo,
  listId?: string
) => {
  try {
    toast('正在从在线音源搜索同名歌曲...')
    webDAVLog.info('handleFetchWebDAVPicFromOnline: searching for', {
      musicId: musicInfo.id,
      name: musicInfo.name,
      singer: musicInfo.singer
    })

    // 使用 findMusic 搜索同名歌曲
    const searchResult = await findMusic({
      name: musicInfo.name,
      singer: musicInfo.singer,
      albumName: musicInfo.meta.albumName,
      interval: musicInfo.interval,
      source: musicInfo.source,
    })

    webDAVLog.info('handleFetchWebDAVPicFromOnline: search result count', {
      count: searchResult.length,
      results: searchResult
    })

    if (searchResult.length === 0) {
      toast('未找到匹配的歌曲')
      return null
    }

    // 取第一个结果的封面
    const matchedSong = searchResult[0]
    const newPicUrl = matchedSong.img || matchedSong.meta?.picUrl

    if (!newPicUrl) {
      webDAVLog.warn('handleFetchWebDAVPicFromOnline: matched song has no cover', matchedSong)
      toast('找到的歌曲没有封面')
      return null
    }

    webDAVLog.info('handleFetchWebDAVPicFromOnline: found cover', {
      source: matchedSong.source,
      name: matchedSong.name,
      singer: matchedSong.singer,
      picUrl: newPicUrl
    })

    await updateWebDAVMusicMeta(musicInfo.id, { picUrl: newPicUrl })

    if (listId) {
      await updateListMusics([{
        id: listId,
        musicInfo: { ...musicInfo, meta: { ...musicInfo.meta, picUrl: newPicUrl } }
      }])
    }

    global.app_event.picUpdated()

    toast('封面获取成功！')
    return newPicUrl
  } catch (error: any) {
    webDAVLog.error('handleFetchWebDAVPicFromOnline: failed', { error: error.message, error })
    const errorMessage = error.message || String(error)
    if (errorMessage.includes('timeout')) {
      toast('搜索超时，请重试', 'long')
    } else {
      toast(`获取封面失败：${errorMessage}`, 'long')
    }
    throw error
  }
}

export const handleWebDAVRemove = async (
  musicInfo: LX.WebDAV.MusicInfo
) => {
  try {
    const config = await getWebDAVConfig()
    const songIndex = config.songs.findIndex(song => song.id === musicInfo.id)
    
    if (songIndex === -1) {
      toast('未找到该歌曲')
      return
    }

    config.songs.splice(songIndex, 1)
    
    const { saveWebDAVConfig } = await import('@/core/webdavMusic/drive')
    await saveWebDAVConfig(config)
    
    toast('已从列表移除')
  } catch (error: any) {
    webDAVLog.error('handleWebDAVRemove: failed', { error: error.message })
    toast(`移除失败：${error.message}`, 'long')
  }
}

export const handleWebDAVCopyName = (musicInfo: LX.WebDAV.MusicInfo) => {
  const name = musicInfo.name || musicInfo.meta.fileName
  clipboardWriteText(name)
  toast('已复制歌曲名称')
}
