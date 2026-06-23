import { findMusic } from '@/utils/musicSdk'
import { getWebDAVConfig, updateWebDAVMusicMeta, getWebDAVDownloadUrl, saveWebDAVConfig } from '@/core/webdavMusic/drive'
import { downloadFile, existsFile, mkdir, getWebDAVPrivateDirectory } from '@/utils/fs'
import { toast, clipboardWriteText, requestStoragePermission } from '@/utils/tools'
import settingState from '@/store/setting/state'
import playerState from '@/store/player/state'
import { btoa } from 'react-native-quick-base64'
import { updateListMusics } from '@/core/list'
import { webDAVLog } from '@/core/webdavMusic/logger'
import { readPic, readMetadata } from '@/utils/localMediaMetadata'

export const handleWebDAVBatchDownload = async (
  songs: LX.WebDAV.MusicInfo[],
  onProgress?: (current: number, total: number, currentSong: string) => void
): Promise<string[]> => {
  const hasPermission = await requestStoragePermission()
  if (!hasPermission) {
    toast('请授予存储权限后重试', 'long')
    return []
  }

  const downloadDir = getDefaultDownloadDir()
  const downloadedPaths: string[] = []
  
  webDAVLog.info('handleWebDAVBatchDownload: starting batch download', { songCount: songs.length })
  
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
    
    let currentIndex = 0
    for (const musicInfo of songs) {
      currentIndex++
      const fileName = musicInfo.meta.fileName
      const filePath = `${downloadDir}/${fileName}`
      
      if (onProgress) {
        onProgress(currentIndex, songs.length, fileName)
      }

      const fileExists = await existsFile(filePath)

      if (musicInfo.meta.filePath && !fileExists) {
        webDAVLog.info('handleWebDAVBatchDownload: file was deleted, clearing old filePath', { oldPath: musicInfo.meta.filePath })
        await updateWebDAVMusicMeta(musicInfo.id, { filePath: undefined })
      }

      if (fileExists) {
        webDAVLog.info('handleWebDAVBatchDownload: file already exists, skipping', { filePath })
        downloadedPaths.push(filePath)

        await updateWebDAVMusicMeta(musicInfo.id, { filePath })
        continue
      }
      
      try {
        const downloadUrl = getWebDAVDownloadUrl(musicInfo)
        webDAVLog.info('handleWebDAVBatchDownload: downloading', { currentIndex, fileName, downloadUrl })
        
        await downloadFile(downloadUrl, filePath, { headers }).promise

        const fileMetadata = await readMetadata(filePath).catch(() => null)
        
        const updates: Record<string, any> = { filePath }
        
        if (fileMetadata) {
          if (fileMetadata.albumName) updates.albumName = fileMetadata.albumName
          if (fileMetadata.name && !musicInfo.name) updates.name = fileMetadata.name
          if (fileMetadata.singer && !musicInfo.singer) updates.singer = fileMetadata.singer
        }

        await updateWebDAVMusicMeta(musicInfo.id, updates)

        const picPath = await readPic(filePath).catch(() => null)
        if (picPath) {
          const newPicUrl = picPath.startsWith('/') ? `file://${picPath}` : picPath
          await updateWebDAVMusicMeta(musicInfo.id, { picUrl: newPicUrl })
        }
        
        downloadedPaths.push(filePath)
        webDAVLog.info('handleWebDAVBatchDownload: download completed', { currentIndex, fileName, filePath })
      } catch (error: any) {
        webDAVLog.error('handleWebDAVBatchDownload: download failed', { fileName, error: error.message })
      }
    }
    
    webDAVLog.info('handleWebDAVBatchDownload: batch download completed', { downloadedCount: downloadedPaths.length })
    return downloadedPaths
  } catch (error: any) {
    webDAVLog.error('handleWebDAVBatchDownload: batch download failed', { error: error.message })
    throw error
  }
}

export const handleWebDAVDownloadAndImport = async (
  songs: LX.WebDAV.MusicInfo[],
  setLoadingText: (text: string) => void
): Promise<void> => {
  if (songs.length === 0) {
    toast('没有可下载的歌曲')
    return
  }
  
  setLoadingText(`正在下载 0/${songs.length}...`)
  webDAVLog.info('handleWebDAVDownloadAndImport: starting process', { songCount: songs.length })

  try {
    const downloadedPaths = await handleWebDAVBatchDownload(songs, (current, total, fileName) => {
      setLoadingText(`正在下载 ${current}/${total}...\n${fileName}`)
    })
    
    if (downloadedPaths.length === 0) {
      toast('没有成功下载任何歌曲')
      return
    }
    
    webDAVLog.info('handleWebDAVDownloadAndImport: download completed', { downloadedCount: downloadedPaths.length })

    const files = downloadedPaths.map(path => {
      const name = path.split('/').pop() || ''
      return { path, name } as any
    })
    
    setLoadingText('正在添加到列表...')
    await addListMusics(
      LIST_IDS.DOWNLOAD,
      files.map(buildLocalMusicInfoByFilePath),
      settingState.setting['list.addMusicLocationType']
    )

    toast(global.i18n.t('list_select_local_file_temp_add_tip', { total: files.length }), 'long')

    setLoadingText('正在读取音乐标签...')

    const createLocalMusicInfos = async (
      filePaths: string[],
      errorPath: string[]
    ): Promise<LX.Music.MusicInfoLocal[]> => {
      const list: LX.Music.MusicInfoLocal[] = []
      filePaths = [...filePaths]
      while (filePaths.length) {
        const tasks = [
          filePaths.shift(),
          filePaths.shift(),
          filePaths.shift(),
          filePaths.shift(),
          filePaths.shift(),
        ].filter(Boolean) as string[]

        await Promise.all(
          tasks.map(async (path) => {
            const info = await readMetadata(path)
            const picPath = await readPic(path).catch(() => null)
            return { path, info, picPath }
          }),
        ).then((res) => {
          for (const { path, info, picPath } of res) {
            if (!info) {
              errorPath.push(path)
              continue
            }
            const musicInfo = buildLocalMusicInfo(path, info, picPath)
            list.push(musicInfo)
          }
        })
      }
      return list
    }
    
    const createThrottleAddMusics = (
      add: (listId: string, musicInfos: LX.Music.MusicInfoLocal[]) => Promise<void>,
      remove: (listId: string, errorPath: string[]) => Promise<void>,
      listId: string
    ) => {
      let timer: number | null = null
      let _musicInfos: LX.Music.MusicInfoLocal[] = []
      let _errorPath: string[] = []
      return (musicInfos: LX.Music.MusicInfoLocal[], errorPath?: string[]) => {
        if (musicInfos.length) _musicInfos = [..._musicInfos, ...musicInfos]
        if (errorPath) _errorPath = [..._errorPath, ...errorPath]
        if (timer) return
        timer = BackgroundTimer.setTimeout(async () => {
          timer = null
          let musicInfos = _musicInfos
          _musicInfos = []
          let errorPath = _errorPath
          _errorPath = []
          if (musicInfos.length) await add(listId, musicInfos)
          if (errorPath.length) await remove(listId, errorPath)
        }, 100)
      }
    }
    
    const handleUpdateMusics = async (
      filePaths: string[],
      throttleUpdateMusics: (musicInfos: LX.Music.MusicInfoLocal[], errorPath?: string[]) => void,
      index: number = -1,
      total: number = 0,
      errorPath: string[] = []
    ) => {
      if (!total) total = filePaths.length
      const paths = filePaths.slice(index + 1, index + 11)
      const musicInfos = await createLocalMusicInfos(paths, errorPath)
      if (musicInfos.length) {
        throttleUpdateMusics(musicInfos)
        await updateListMusics(musicInfos.map((info) => ({ id: LIST_IDS.DOWNLOAD, musicInfo: info })))
      }
      setLoadingText(`正在读取标签 ${Math.min(index + 11, total)}/${total}...`)
      index += 10
      if (filePaths.length - 1 > index)
        await handleUpdateMusics(filePaths, throttleUpdateMusics, index, total, errorPath)
      else {
        if (errorPath.length) {
          toast(
            global.i18n.t('list_select_local_file_result_failed_tip', {
              total,
              success: total - errorPath.length,
              failed: errorPath.length,
            }),
            'long'
          )
        } else {
          toast(global.i18n.t('list_select_local_file_result_tip', { total }), 'long')
        }
        throttleUpdateMusics([], errorPath)
        setLoadingText('')
      }
    }
    
    const throttleUpdateMusics = createThrottleAddMusics(
      async (listId, musicInfos) => {
        return updateListMusics(musicInfos.map((info) => ({ id: listId, musicInfo: info })))
      },
      async (listId, errorPath) => {
        return Promise.resolve()
      },
      LIST_IDS.DOWNLOAD
    )
    
    await handleUpdateMusics(downloadedPaths, throttleUpdateMusics)
    
    webDAVLog.info('handleWebDAVDownloadAndImport: all processes completed')
    
  } catch (error: any) {
    webDAVLog.error('handleWebDAVDownloadAndImport: process failed', { error: error.message })
    toast(`导入失败：${error.message}`, 'long')
    setLoadingText('')
  }
}
