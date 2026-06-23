import { memo, useState, useCallback, useEffect, useRef } from 'react'
import { View, StyleSheet, TextInput, Clipboard } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import Text from '@/components/common/Text'
import Button from '../../components/Button'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import { useSettingValue } from '@/store/setting/hook'
import musicSdk from '@/utils/musicSdk'
import { log, getSourceTestLogs, clearSourceTestLogs, sourceTestLog } from '@/utils/log'
import { createStyle, toast } from '@/utils/tools'
import LogConfirmAlert, { type LogConfirmAlertType } from '@/components/common/LogConfirmAlert'

const adjustColorOpacity = (color: string, opacity: number) => {
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/)
  if (rgbaMatch) {
    const r = parseInt(rgbaMatch[1])
    const g = parseInt(rgbaMatch[2])
    const b = parseInt(rgbaMatch[3])
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`
  }
  
  const rgbMatch = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/)
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1])
    const g = parseInt(rgbMatch[2])
    const b = parseInt(rgbMatch[3])
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`
  }
  
  const hexMatch = color.match(/#([0-9a-fA-F]{6})/)
  if (hexMatch) {
    const r = parseInt(hexMatch[1].slice(0, 2), 16)
    const g = parseInt(hexMatch[1].slice(2, 4), 16)
    const b = parseInt(hexMatch[1].slice(4, 6), 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`
  }
  
  const hexMatch3 = color.match(/#([0-9a-fA-F]{3})/)
  if (hexMatch3) {
    const r = parseInt(hexMatch3[1][0] + hexMatch3[1][0], 16)
    const g = parseInt(hexMatch3[1][1] + hexMatch3[1][1], 16)
    const b = parseInt(hexMatch3[1][2] + hexMatch3[1][2], 16)
    return `rgba(${r}, ${g}, ${b}, ${opacity / 100})`
  }
  
  return color
}

const sources = [
  { id: 'kw', name: '酷我' },
  { id: 'kg', name: '酷狗' },
  { id: 'tx', name: 'QQ' },
  { id: 'wy', name: '网易' },
  { id: 'mg', name: '咪咕' },
]

const qualityLevels = ['master', 'atmos_plus', 'atmos', 'hires', 'flac', '320k', '128k']

const qualityPriority: Record<string, number> = {
  master: 7,
  atmos_plus: 6,
  atmos: 5,
  hires: 4,
  flac: 3,
  '320k': 2,
  '128k': 1,
  unknown: 0,
}

const parseFileSize = (sizeStr: string): number => {
  const match = sizeStr.match(/^([\d.]+)\s*(MB|KB)$/i)
  if (!match) return 0
  const num = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  return unit === 'KB' ? num / 1024 : num
}

const getActualQualityBySize = (actualSizeMB: number, claimedQuality: string, qualitySizes: Record<string, number>): string => {
  let closestQuality = claimedQuality
  let minDiff = Infinity
  
  for (const [quality, expectedSize] of Object.entries(qualitySizes)) {
    const diff = Math.abs(actualSizeMB - expectedSize)
    if (diff < minDiff) {
      minDiff = diff
      closestQuality = quality
    }
  }
  
  return closestQuality
}

interface SourceKeywords {
  kw: string
  kg: string
  tx: string
  wy: string
  mg: string
}

interface TestResult {
  source: string
  name: string
  delay: number | null
  maxQuality: string | null
  status: 'pending' | 'testing' | 'success' | 'failed'
  message: string
  searchedSong: string
}

const STORAGE_KEY = 'lx_music_source_test_keywords'
const SETTINGS_STORAGE_KEY = 'lx_music_source_test_settings'
const TIMEOUT_MS = 20000
const RATE_LIMIT_ERROR_KEYWORDS = ['请求频率超限', '频率超限', 'too many requests', 'rate limit', '请求过于频繁']

const isRateLimitError = (errorMessage: string): boolean => {
  return RATE_LIMIT_ERROR_KEYWORDS.some(keyword => errorMessage.includes(keyword))
}

const sleep = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

const loadSavedKeywords = async (): Promise<SourceKeywords> => {
  try {
    const saved = await AsyncStorage.getItem(STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return { kw: '晴天', kg: '晴天', tx: '晴天', wy: '再也没有', mg: '晴天' }
}

const saveKeywords = async (keywords: SourceKeywords) => {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(keywords))
  } catch (error) {
    log.error('[源测试] 保存关键词失败:', error)
  }
}

interface TestSettings {
  intervalSeconds: string
  qualityIntervalSeconds: string
  testTimeoutSeconds: string
  sizeErrorMB: string
}

const loadSavedSettings = async (): Promise<TestSettings> => {
  try {
    const saved = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY)
    if (saved) return JSON.parse(saved)
  } catch {}
  return {
    intervalSeconds: '0',
    qualityIntervalSeconds: '0',
    testTimeoutSeconds: '20',
    sizeErrorMB: '0.5',
  }
}

const saveSettings = async (settings: TestSettings) => {
  try {
    await AsyncStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch (error) {
    log.error('[源测试] 保存设置失败:', error)
  }
}

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const subContainerOpacity = useSettingValue('theme.subContainerOpacity')
  const [isTesting, setIsTesting] = useState(false)
  const [results, setResults] = useState<TestResult[]>([])
  const [currentProgress, setCurrentProgress] = useState('')
  const [keywords, setKeywords] = useState<SourceKeywords>({
    kw: '晴天',
    kg: '晴天',
    tx: '晴天',
    wy: '再也没有',
    mg: '晴天',
  })
  const [isLoaded, setIsLoaded] = useState(false)
  const [intervalSeconds, setIntervalSeconds] = useState('0')
  const [qualityIntervalSeconds, setQualityIntervalSeconds] = useState('0')
  const [testTimeoutSeconds, setTestTimeoutSeconds] = useState('20')
  const [sizeErrorMB, setSizeErrorMB] = useState('0.5')
  const [isStopRequested, setIsStopRequested] = useState(false)
  const [logText, setLogText] = useState('')
  const [testingSourceId, setTestingSourceId] = useState<string | null>(null)
  const [elapsedTime, setElapsedTime] = useState(0)
  
  const shouldContinueTesting = useRef(true)
  const logModalRef = useRef<LogConfirmAlertType>(null)
  const testStartTimeRef = useRef<number>(0)
  const elapsedTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    const load = async () => {
      const [savedKeywords, savedSettings] = await Promise.all([
        loadSavedKeywords(),
        loadSavedSettings(),
      ])
      setKeywords(savedKeywords)
      setIntervalSeconds(savedSettings.intervalSeconds)
      setQualityIntervalSeconds(savedSettings.qualityIntervalSeconds)
      setTestTimeoutSeconds(savedSettings.testTimeoutSeconds)
      setSizeErrorMB(savedSettings.sizeErrorMB)
      setIsLoaded(true)
    }
    load()
  }, [])

  useEffect(() => {
    if (isLoaded) {
      saveKeywords(keywords)
    }
  }, [keywords, isLoaded])

  const handleKeywordChange = useCallback((sourceId: string, value: string) => {
    setKeywords(prev => ({ ...prev, [sourceId]: value }))
  }, [])

  useEffect(() => {
    if (isLoaded) {
      saveSettings({
        intervalSeconds,
        qualityIntervalSeconds,
        testTimeoutSeconds,
        sizeErrorMB,
      })
    }
  }, [intervalSeconds, qualityIntervalSeconds, testTimeoutSeconds, sizeErrorMB, isLoaded])

  const stopElapsedTimer = useCallback(() => {
    if (elapsedTimerRef.current) {
      clearInterval(elapsedTimerRef.current)
      elapsedTimerRef.current = null
    }
  }, [])

  const handleStop = useCallback(() => {
    shouldContinueTesting.current = false
    setIsStopRequested(true)
    setIsTesting(false)
    stopElapsedTimer()
    setCurrentProgress('测试已停止')
    sourceTestLog.info('========== 用户请求停止测试 ==========')
  }, [stopElapsedTimer])

  const copyToClipboard = async (text: string) => {
    try {
      await Clipboard.setString(text)
      toast('复制成功')
    } catch {
      toast('复制失败')
    }
  }

  const getSourceTestLog = async () => {
    try {
      const log = await getSourceTestLogs()
      const logArr = log.split(/^----lx source test log----\n|\n----lx source test log----\n|\n----lx source test log----$/)
      logArr.reverse()
      const formattedLog = logArr
        .filter(line => line.trim())
        .join('\n\n')
        .replace(/^\n+|\n+$/, '')
      setLogText(formattedLog)
    } catch {
      setLogText('')
    }
  }

  const openLogModal = () => {
    getSourceTestLog()
    logModalRef.current?.setVisible(true)
  }

  const handleCleanLog = () => {
    void clearSourceTestLogs().then(() => {
      toast('日志已清空')
      getSourceTestLog()
    })
  }

  const handleIntervalChange = useCallback((value: string) => {
    const num = value.replace(/[^0-9]/g, '')
    setIntervalSeconds(num)
  }, [])

  const handleQualityIntervalChange = useCallback((value: string) => {
    const num = value.replace(/[^0-9]/g, '')
    setQualityIntervalSeconds(num)
  }, [])

  const handleTestTimeoutChange = useCallback((value: string) => {
    const num = value.replace(/[^0-9]/g, '')
    setTestTimeoutSeconds(num)
  }, [])

  const handleSizeErrorChange = useCallback((value: string) => {
    const num = value.replace(/[^\d.]/g, '')
    const parts = num.split('.')
    if (parts.length > 2) {
      setSizeErrorMB(parts[0] + '.' + parts.slice(1).join(''))
    } else {
      setSizeErrorMB(num)
    }
  }, [])

  const getSizeErrorMB = (): number => {
    const num = parseFloat(sizeErrorMB)
    return isNaN(num) || num <= 0 ? 0.5 : num
  }

  const getQualityTestInterval = (): number => {
    const seconds = parseInt(qualityIntervalSeconds)
    return (isNaN(seconds) ? 0 : seconds) * 1000
  }

  const getTestTimeout = (): number => {
    const seconds = parseInt(testTimeoutSeconds)
    return (isNaN(seconds) || seconds <= 0 ? 20 : seconds) * 1000
  }

  const testSource = useCallback(async (source: typeof sources[0], keyword: string, qualityIntervalMs: number): Promise<{
    delay: number | null
    maxQuality: string | null
    message: string
    success: boolean
    searchedSong: string
  }> => {
    const totalStartTime = Date.now()
    sourceTestLog.info(`========== [${source.name}] 开始测试 ==========`)
    sourceTestLog.info(`搜索关键词: "${keyword}"`)

    try {
      const sdk = musicSdk[source.id]
      if (!sdk) {
        log.error(`[${source.name}] 错误: 未找到平台SDK`)
        throw new Error(`平台 ${source.name} SDK不存在`)
      }

      sourceTestLog.info(`[${source.name}] SDK检查: ${sdk.musicSearch ? '支持搜索' : '不支持搜索'}`)
      
      if (!sdk.musicSearch) {
        log.error(`[${source.name}] 错误: 该平台不支持搜索接口`)
        throw new Error(`${source.name} 不支持搜索接口`)
      }

      sourceTestLog.info(`[${source.name}] 调用 musicSearch.search("${keyword}", 1, 1)`)
      const searchStartTime = Date.now()
      const searchResult = await sdk.musicSearch.search(keyword, 1, 1)
      const searchEndTime = Date.now()
      sourceTestLog.info(`[${source.name}] 搜索耗时: ${searchEndTime - searchStartTime}ms`)
      
      sourceTestLog.info(`[${source.name}] 搜索结果结构:`, JSON.stringify({
        hasList: !!searchResult?.list,
        listLength: searchResult?.list?.length,
        total: searchResult?.total,
        source: searchResult?.source
      }))

      if (!searchResult?.list?.length) {
        log.error(`[${source.name}] 错误: 搜索结果为空`)
        throw new Error('搜索结果为空，该平台可能无此歌曲版权')
      }

      const songInfo = searchResult.list[0]
      sourceTestLog.info(`[${source.name}] 搜索结果第一首歌曲原始数据:`, JSON.stringify(songInfo, null, 2))
      
      const songName = songInfo.name || songInfo.songName || songInfo.title || songInfo.filename || '未知歌曲'
      const songSinger = songInfo.singer || songInfo.artist || songInfo.artists || songInfo.artistName || '未知歌手'
      const songId = songInfo.songmid || songInfo.id || songInfo.songId || songInfo.musicId || ''
      
      sourceTestLog.info(`[${source.name}] 解析歌曲信息: 歌名="${songName}", 歌手="${songSinger}", ID="${songId}"`)
      sourceTestLog.info(`[${source.name}] 搜索结果完整keys: ${Object.keys(songInfo).join(', ')}`)
      
      if (!songName) {
        log.error(`[${source.name}] 错误: 无法解析歌曲名称`)
        throw new Error('无法解析歌曲信息')
      }

      const songDisplay = `${songName} - ${songSinger}`
      sourceTestLog.info(`[${source.name}] 找到歌曲: ${songDisplay}`)

      sourceTestLog.info(`[${source.name}] 检查播放接口: ${sdk.getMusicUrl ? '支持' : '不支持'}`)
      
      if (!sdk.getMusicUrl) {
        log.error(`[${source.name}] 错误: 该平台不支持播放接口`)
        throw new Error(`${source.name} 不支持播放接口`)
      }

      const oldMusicInfo = {
        name: songName,
        singer: songSinger,
        songmid: songId,
        source: source.id,
        interval: songInfo.interval || '',
        albumName: songInfo.albumName || songInfo.album || '',
        img: songInfo.img || songInfo.pic || '',
        typeUrl: songInfo.typeUrl || {},
        types: songInfo.types || songInfo._types ? Object.keys(songInfo._types || songInfo.types) : [],
        _types: songInfo._types || songInfo.types || {},
        meta: songInfo.meta || {},
        ...songInfo,
      }

      sourceTestLog.info(`[${source.name}] 构建oldMusicInfo对象:`, JSON.stringify({
        name: oldMusicInfo.name,
        singer: oldMusicInfo.singer,
        songmid: oldMusicInfo.songmid,
        source: oldMusicInfo.source,
        interval: oldMusicInfo.interval,
        albumName: oldMusicInfo.albumName,
        types: oldMusicInfo.types,
        _types: oldMusicInfo._types,
      }, null, 2))

      sourceTestLog.info(`[${source.name}] ========== 开始逐级测试音质 ==========`)

      let maxQuality: string | null = null
      let highestPriority = 0
      const qualityResults: Record<string, { success: boolean; url?: string; error?: string; time: number }> = {}
      const detectedQualities: Record<string, { url: string; time: number }> = {}
      let totalStartTime = Date.now()

      for (let i = 0; i < qualityLevels.length; i++) {
        const quality = qualityLevels[i]
        const qualityStartTime = Date.now()
        
        if (i > 0) {
          await sleep(qualityIntervalMs)
        }
        
        try {
          sourceTestLog.info(`[${source.name}] 尝试音质: ${quality}`)
          
          const resultObj = sdk.getMusicUrl(oldMusicInfo, quality)
          
          let result: any
          if (resultObj instanceof Promise) {
            result = await resultObj
          } else if (resultObj?.promise instanceof Promise) {
            result = await resultObj.promise
          } else if (resultObj && typeof resultObj.promise === 'function') {
            result = await resultObj.promise()
          } else {
            result = resultObj
          }
          
          const qualityEndTime = Date.now()
          const qualityTime = qualityEndTime - qualityStartTime
          
          sourceTestLog.info(`[${source.name}] ${quality} 接口返回结果:`, JSON.stringify({
            isString: typeof result === 'string',
            hasUrl: !!(result?.url || (typeof result === 'string' && result)),
            hasDataUrl: !!(result?.data?.url),
            type: result?.type || '未返回',
            resultType: typeof result,
            keys: typeof result === 'object' ? Object.keys(result).slice(0, 10) : [],
          }, null, 2))
          
          const url = typeof result === 'string' ? result : (result?.url || result?.data?.url)
          const actualType = result?.type || ''
          
          const hasInvalidLevel = url && /level=(undefined|null|$|&)/i.test(url)
          const isValidUrl = url && url.length > 10 && !hasInvalidLevel
          
          if (isValidUrl) {
            sourceTestLog.info(`[${source.name}] [OK] ${quality} 获取URL成功 [耗时${qualityTime}ms]`)
            sourceTestLog.info(`[${source.name}]   - actualType: ${actualType}`)
            sourceTestLog.info(`[${source.name}]   - URL长度: ${url?.length || 0}`)
            sourceTestLog.info(`[${source.name}]   - URL预览: ${url?.substring(0, 100)}${url?.length > 100 ? '...' : ''}`)
            
            const urlLower = url.toLowerCase()
            const urlExtension = urlLower.split('.').pop() || ''
            
            let actualQualityFromUrl = quality
            const qualitySizes: Record<string, number> = {}
            for (const [q, info] of Object.entries(oldMusicInfo._types || {})) {
              if (typeof info === 'object' && info.size) {
                qualitySizes[q] = parseFileSize(info.size)
              }
            }
            
            sourceTestLog.info(`[${source.name}]   - 元数据音质大小:`, JSON.stringify(qualitySizes))
            
            if (Object.keys(qualitySizes).length > 0) {
              try {
                const headResponse = await fetch(url, { method: 'HEAD' })
                const contentLength = headResponse.headers.get('content-length')
                
                if (contentLength) {
                  const actualSizeMB = parseInt(contentLength) / (1024 * 1024)
                  const actualSizeRounded = Math.round(actualSizeMB * 100) / 100
                  
                  sourceTestLog.info(`[${source.name}]   - 文件大小检测: ${actualSizeRounded.toFixed(2)}MB`)
                  
                    let matchedQuality: string | null = null
                    const errorMB = getSizeErrorMB()
                    for (const [q, expectedSize] of Object.entries(qualitySizes)) {
                      const expectedSizeRounded = Math.round(expectedSize * 100) / 100
                      if (Math.abs(actualSizeRounded - expectedSizeRounded) <= errorMB) {
                        matchedQuality = q
                        sourceTestLog.info(`[${source.name}]   - [OK] 大小完全匹配: ${q} (${expectedSizeRounded.toFixed(2)}MB)`)
                        break
                      }
                    }
                  
                  if (!matchedQuality) {
                    sourceTestLog.info(`[${source.name}]   - [WARN] 大小不匹配任何元数据音质`)
                    qualityResults[quality] = { success: false, error: `大小不匹配(${actualSizeRounded.toFixed(2)}MB)`, time: qualityTime }
                    continue
                  }
                  
                  if (matchedQuality === quality) {
                    sourceTestLog.info(`[${source.name}]   - [OK] 与请求音质 ${quality} 一致`)
                    actualQualityFromUrl = quality
                  } else {
                    sourceTestLog.info(`[${source.name}]   - [WARN] 实际音质 ${matchedQuality} 与请求音质 ${quality} 不一致`)
                    detectedQualities[matchedQuality] = { url: url.substring(0, 50) + '...', time: qualityTime }
                    qualityResults[quality] = { success: false, error: `实际=${matchedQuality}`, time: qualityTime }
                    continue
                  }
                } else {
                  sourceTestLog.info(`[${source.name}]   - [WARN] 无法获取文件大小`)
                  qualityResults[quality] = { success: false, error: '无法获取文件大小', time: qualityTime }
                  continue
                }
              } catch {
                sourceTestLog.info(`[${source.name}]   - [WARN] 获取文件信息失败`)
                qualityResults[quality] = { success: false, error: '获取文件信息失败', time: qualityTime }
                continue
              }
            } else {
              sourceTestLog.info(`[${source.name}]   - [WARN] 无元数据大小信息`)
              qualityResults[quality] = { success: false, error: '无元数据', time: qualityTime }
              continue
            }
            
            const isQualityMatch = actualQualityFromUrl === quality
            const isApiTypeMatch = actualType === quality && actualType
            
            if (isQualityMatch && isApiTypeMatch) {
              qualityResults[quality] = { success: true, url: url.substring(0, 50) + '...', time: qualityTime }
              maxQuality = quality
              highestPriority = qualityPriority[quality] || 0
              sourceTestLog.info(`[${source.name}] [OK] ${quality} 音质匹配! 已找到最高音质`)
              break
            } else if (isQualityMatch) {
              qualityResults[quality] = { success: true, url: url.substring(0, 50) + '...', time: qualityTime }
              maxQuality = quality
              highestPriority = qualityPriority[quality] || 0
              sourceTestLog.info(`[${source.name}] [OK] ${quality} URL格式匹配! 已找到最高音质`)
              break
            } else {
              sourceTestLog.info(`[${source.name}] [FAIL] ${quality} 音质不匹配`)
              sourceTestLog.info(`[${source.name}]   - 请求音质: ${quality}`)
              sourceTestLog.info(`[${source.name}]   - API返回音质: ${actualType || '未返回'}`)
              sourceTestLog.info(`[${source.name}]   - URL推断音质: ${actualQualityFromUrl}`)
              sourceTestLog.info(`[${source.name}]   - URL扩展名: ${urlExtension}`)
              sourceTestLog.info(`[${source.name}]   - 降级到下一档测试`)
              qualityResults[quality] = { success: false, error: `不匹配，实际=${actualQualityFromUrl}`, time: qualityTime }
              
              if (actualQualityFromUrl && !detectedQualities[actualQualityFromUrl]) {
                detectedQualities[actualQualityFromUrl] = { url: url.substring(0, 50) + '...', time: qualityTime }
                sourceTestLog.info(`[${source.name}]   - 记录检测到的音质: ${actualQualityFromUrl}`)
              }
              
              continue
            }
          } else {
            sourceTestLog.info(`[${source.name}] [FAIL] ${quality} URL无效 [耗时${qualityTime}ms]`)
            sourceTestLog.info(`[${source.name}]   - URL存在: ${!!url}`)
            sourceTestLog.info(`[${source.name}]   - URL长度: ${url?.length || 0}`)
            sourceTestLog.info(`[${source.name}]   - 包含无效level参数: ${hasInvalidLevel}`)
            sourceTestLog.info(`[${source.name}]   - 降级到下一档测试`)
            qualityResults[quality] = { success: false, error: 'URL无效', time: qualityTime }
            continue
          }
        } catch (qualityError: any) {
          const qualityEndTime = Date.now()
          const errorMessage = qualityError.message || '未知错误'
          const errorType = qualityError.constructor?.name || 'Error'
          const errorStack = qualityError.stack || '无堆栈信息'
          
          sourceTestLog.info(`[${source.name}] [FAIL] ${quality} 请求异常 [耗时${qualityEndTime - qualityStartTime}ms]`)
          sourceTestLog.info(`[${source.name}]   - 错误类型: ${errorType}`)
          sourceTestLog.info(`[${source.name}]   - 错误消息: ${errorMessage}`)
          sourceTestLog.info(`[${source.name}]   - 错误堆栈: ${errorStack.substring(0, 500)}${errorStack.length > 500 ? '...' : ''}`)
          
          if (isRateLimitError(errorMessage)) {
            sourceTestLog.info(`[${source.name}]   - 检测到请求频率超限，跳过剩余音质测试`)
            
            qualityResults[quality] = { success: false, error: errorMessage, time: qualityEndTime - qualityStartTime }
            
            const totalDelay = Date.now() - totalStartTime
            sourceTestLog.info(`[${source.name}] 测试终止: 检测到请求频率超限，总耗时 ${totalDelay}ms`)
            sourceTestLog.info(`========== [${source.name}] 测试异常结束 ==========`)
            
            return {
              delay: totalDelay,
              maxQuality: null,
              message: `请求频率超限，请稍后重试`,
              success: false,
              searchedSong: songDisplay,
            }
          }
          
          sourceTestLog.info(`[${source.name}]   - 降级到下一档测试`)
          qualityResults[quality] = { success: false, error: errorMessage, time: qualityEndTime - qualityStartTime }
          continue
        }
      }

      const totalDelay = Date.now() - totalStartTime
      
      if (!maxQuality && Object.keys(detectedQualities).length > 0) {
        let highestDetectedQuality: string | null = null
        let highestDetectedPriority = -1
        
        for (const detectedQuality of Object.keys(detectedQualities)) {
          const priority = qualityPriority[detectedQuality] || 0
          if (priority > highestDetectedPriority) {
            highestDetectedPriority = priority
            highestDetectedQuality = detectedQuality
          }
        }
        
        if (highestDetectedQuality) {
          maxQuality = highestDetectedQuality
          sourceTestLog.info(`[${source.name}] 未找到完全匹配的音质，但检测到降级音质: ${maxQuality}`)
        }
      }
      
      const qualityLabel = maxQuality ? getQualityLabel(maxQuality) : '可能是(接口挂掉了/网络问题/不支持该源/频率超限了)'

      sourceTestLog.info(`[${source.name}] 测试完成: 总耗时 ${totalDelay}ms, 最高音质 ${qualityLabel}`)
      sourceTestLog.info(`========== [${source.name}] 测试结束 ==========`)

      if (!maxQuality) {
        return {
          delay: totalDelay,
          maxQuality: null,
          message: `耗时${totalDelay}ms，可能是(接口挂掉了/网络问题/不支持该源/频率超限了)`,
          success: false,
          searchedSong: songDisplay,
        }
      }

      return {
        delay: totalDelay,
        maxQuality,
        message: `耗时${totalDelay}ms，最高音质${qualityLabel}`,
        success: true,
        searchedSong: songDisplay,
      }
    } catch (error: any) {
      const totalDelay = Date.now() - totalStartTime
      log.error(`[${source.name}] 测试失败: ${error.message}`)
      log.error(`[${source.name}] 错误类型: ${error.constructor?.name || 'Unknown'}`)
      log.error(`[${source.name}] 错误堆栈:`, error.stack || '无堆栈信息')
      log.error(`========== [${source.name}] 测试异常结束 ==========`)

      return {
        delay: totalDelay,
        maxQuality: null,
        message: `耗时${totalDelay}ms，可能是(接口挂掉了/网络问题/不支持该源/频率超限了)`,
        success: false,
        searchedSong: songDisplay,
      }
    }
  }, [])

  const handleTest = useCallback(async () => {
    shouldContinueTesting.current = true
    setIsStopRequested(false)
    setIsTesting(true)
    setElapsedTime(0)
    testStartTimeRef.current = Date.now()
    
    elapsedTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - testStartTimeRef.current) / 1000)
      setElapsedTime(elapsed)
    }, 1000)
    
    const runTest = async () => {
      setResults(sources.map(source => ({
        source: source.id,
        name: source.name,
        delay: null,
        maxQuality: null,
        status: 'pending',
        message: '',
        searchedSong: '',
      })))
      setCurrentProgress('')

      const qualityIntervalMs = getQualityTestInterval()

      sourceTestLog.info('========== 开始源测试 ==========')
      sources.forEach(s => {
        sourceTestLog.info(`[${s.name}] 关键词: "${keywords[s.id as keyof SourceKeywords]}"`)
      })

      for (let i = 0; i < sources.length; i++) {
        if (!shouldContinueTesting.current) {
          sourceTestLog.info('========== 测试被用户停止 ==========')
          setCurrentProgress('测试已停止')
          return
        }

        const source = sources[i]
        const keyword = keywords[source.id as keyof SourceKeywords]

        if (!keyword.trim()) {
          setResults(prev => prev.map(r =>
            r.source === source.id ? {
              ...r,
              status: 'failed',
              message: '关键词为空',
            } : r
          ))
          continue
        }

        setResults(prev => prev.map(r =>
          r.source === source.id ? { ...r, status: 'testing' } : r
        ))
        const currentElapsed = Math.floor((Date.now() - testStartTimeRef.current) / 1000)
        setCurrentProgress(`正在测试 ${source.name}...`)

        const timeoutMs = getTestTimeout()
        const timeoutPromise = new Promise<{ success: false }>((resolve) => {
          setTimeout(() => resolve({ success: false }), timeoutMs)
        })

        const testPromise = testSource(source, keyword, qualityIntervalMs)

        const result = await Promise.race([testPromise, timeoutPromise])

        if (!('success' in result)) {
          log.error(`[${source.name}] 超时: 测试超过${timeoutMs}ms未完成`)
          setResults(prev => prev.map(r =>
            r.source === source.id ? {
              status: 'failed',
              delay: null,
              maxQuality: null,
              message: `超时(${timeoutMs/1000}秒)`,
              searchedSong: '',
            } : r
          ))
          setCurrentProgress(`${source.name} 超时，跳过`)
        } else {
          setResults(prev => prev.map(r =>
            r.source === source.id ? {
              ...r,
              status: result.success ? 'success' : 'failed',
              delay: result.delay,
              maxQuality: result.success ? result.maxQuality : null,
              message: result.message,
              searchedSong: result.searchedSong,
            } : r
          ))

          const statusText = result.success ? '完成' : '失败'
          setCurrentProgress(`${source.name} ${statusText}: ${result.message}`)
        }

      if (i < sources.length - 1 && shouldContinueTesting.current) {
          const interval = parseInt(intervalSeconds) || 2
          if (interval > 0) {
            sourceTestLog.info(`========== 等待 ${interval} 秒后测试下一个源 ==========`)
            const startTime = Date.now()
            while (Date.now() - startTime < interval * 1000) {
              if (!shouldContinueTesting.current) break
              await new Promise(resolve => setTimeout(resolve, 100))
            }
          }
        }
      }

      sourceTestLog.info('========== 源测试完成 ==========')
      stopElapsedTimer()
      setIsTesting(false)
      setCurrentProgress('')
    }

    await runTest()
  }, [testSource, keywords, intervalSeconds, qualityIntervalSeconds, stopElapsedTimer])

  const handleTestSingleSource = useCallback(async (source: typeof sources[0]) => {
    if (isTesting) return
    
    const keyword = keywords[source.id as keyof SourceKeywords]
    if (!keyword.trim()) {
      toast(`请输入${source.name}搜索关键词`)
      return
    }

    setElapsedTime(0)
    testStartTimeRef.current = Date.now()
    elapsedTimerRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - testStartTimeRef.current) / 1000)
      setElapsedTime(elapsed)
    }, 1000)

    setTestingSourceId(source.id)
    setCurrentProgress(`正在测试 ${source.name}...`)

    setResults(prev => {
      if (prev.length === 0) {
        return sources.map(s => ({
          source: s.id,
          name: s.name,
          delay: null,
          maxQuality: null,
          status: s.id === source.id ? 'testing' : 'pending',
          message: '',
          searchedSong: '',
        }))
      }
      return prev.map(r =>
        r.source === source.id ? { ...r, status: 'testing' } : r
      )
    })

    const qualityIntervalMs = getQualityTestInterval()
    const timeoutMs = getTestTimeout()
    const timeoutPromise = new Promise<{ success: false }>((resolve) => {
      setTimeout(() => resolve({ success: false }), timeoutMs)
    })

    const testPromise = testSource(source, keyword, qualityIntervalMs)

    const result = await Promise.race([testPromise, timeoutPromise])

    if (!('success' in result)) {
      log.error(`[${source.name}] 超时: 测试超过${timeoutMs}ms未完成`)
      setResults(prev => prev.map(r =>
        r.source === source.id ? {
          ...r,
          status: 'failed',
          delay: null,
          maxQuality: null,
          message: `超时(${timeoutMs/1000}秒)`,
          searchedSong: '',
        } : r
      ))
      setCurrentProgress(`${source.name} 超时`)
    } else {
      setResults(prev => prev.map(r =>
        r.source === source.id ? {
          ...r,
          status: result.success ? 'success' : 'failed',
          delay: result.delay,
          maxQuality: result.success ? result.maxQuality : null,
          message: result.message,
          searchedSong: result.searchedSong,
        } : r
      ))

      const statusText = result.success ? '完成' : '失败'
      setCurrentProgress(`${source.name} ${statusText}: ${result.message}`)
    }

    stopElapsedTimer()
    setTestingSourceId(null)
  }, [isTesting, keywords, testSource, qualityIntervalSeconds, stopElapsedTimer])

  const getQualityLabel = (quality: string | null) => {
    if (!quality) return '可能是(接口挂掉了/网络问题/不支持该源)'
    const labels: Record<string, string> = {
      master: '臻品母带',
      atmos_plus: 'ATMOS增强版',
      atmos: 'ATMOS杜比全景声',
      hires: 'Hi-Res',
      flac: 'FLAC',
      '320k': '320K',
      '192k': '192K',
      '128k': '128K',
    }
    return labels[quality] || quality
  }

  const getQualityColors: Record<string, string> = {
    master: '#9B59B6',
    atmos_plus: '#E74C3C',
    atmos: '#E67E22',
    hires: '#FF6B6B',
    flac: '#4ECDC4',
    '320k': '#45B7D1',
    '128k': '#95A5A6',
  }

  const getStatusColor = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return theme['c-font-label']
      case 'testing': return theme['c-warning']
      case 'success': return theme['c-success']
      case 'failed': return theme['c-error']
      default: return theme['c-font']
    }
  }

  const getStatusText = (status: TestResult['status']) => {
    switch (status) {
      case 'pending': return '等待测试'
      case 'testing': return '测试中...'
      case 'success': return '[OK]'
      case 'failed': return '[FAIL]'
      default: return ''
    }
  }

  if (!isLoaded) {
    return null
  }

  return (
    <View style={[styles.container, { backgroundColor: `rgba(255, 255, 255, ${subContainerOpacity / 100})` }]}>
      <Text style={[styles.title, { color: theme['c-font'] }]}>
        {t('setting_basic_source_test_title')}
      </Text>

      <Text style={[styles.desc, { color: theme['c-font-label'] }]}>
        {t('setting_basic_source_test_desc')}
      </Text>

      <View style={styles.keywordsSection}>
        <Text style={[styles.sectionTitle, { color: theme['c-font-label'] }]}>
          各平台搜索关键词
        </Text>
        {sources.map(source => (
          <View key={source.id} style={styles.keywordRow}>
            <Text style={[styles.sourceLabel, { color: theme['c-font'] }]}>
              {source.name}
            </Text>
            <View style={styles.keywordContainer}>
              <TextInput
                style={[styles.keywordInput, { color: theme['c-font'], backgroundColor: theme['c-background'] }]}
                placeholder={`输入${source.name}搜索词`}
                placeholderTextColor={theme['c-font-label']}
                value={keywords[source.id as keyof SourceKeywords]}
                onChangeText={(value) => handleKeywordChange(source.id, value)}
                editable={!isTesting}
                clearButtonMode="while-editing"
              />
            </View>
            <View style={styles.singleTestBtnContainer}>
              <Button
                onPress={() => handleTestSingleSource(source)}
                disabled={isTesting || testingSourceId === source.id || !keywords[source.id as keyof SourceKeywords].trim()}
                style={styles.singleTestBtn}
              >
                {testingSourceId === source.id ? '测试中' : '测试'}
              </Button>
            </View>
          </View>
        ))}
      </View>

      <View style={styles.buttonRow}>
        <Button
          onPress={handleTest}
          disabled={isTesting || !Object.values(keywords).some(k => k.trim())}
          style={styles.startTestBtn}
        >
          {isTesting ? '测试中...' : '开始测试'}
        </Button>
        <Button
          onPress={handleStop}
          disabled={!isTesting}
          style={styles.stopTestBtn}
        >
          终止测试
        </Button>
      </View>

      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>
          误差(MB):
        </Text>
        <TextInput
          style={[styles.errorInput, { color: theme['c-font'], backgroundColor: theme['c-background'] }]}
          placeholder="0.5"
          placeholderTextColor={theme['c-font-label']}
          value={sizeErrorMB}
          onChangeText={handleSizeErrorChange}
          keyboardType="decimal-pad"
          maxLength={5}
          editable={!isTesting}
          />
      </View>

      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>
          测试超时(秒):
        </Text>
        <TextInput
          style={[styles.timeoutInput, { color: theme['c-font'], backgroundColor: theme['c-background'] }]}
          placeholder="20"
          placeholderTextColor={theme['c-font-label']}
          value={testTimeoutSeconds}
          onChangeText={handleTestTimeoutChange}
          keyboardType="number-pad"
          maxLength={5}
          editable={!isTesting}
          />
      </View>

      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>
          平台测试间隔(秒):
        </Text>
        <TextInput
          style={[styles.intervalInput, { color: theme['c-font'], backgroundColor: theme['c-background'] }]}
          placeholder="0"
          placeholderTextColor={theme['c-font-label']}
          value={intervalSeconds}
          onChangeText={handleIntervalChange}
          keyboardType="number-pad"
          maxLength={5}
          editable={!isTesting}
          />
      </View>

      <View style={styles.settingsRow}>
        <Text style={styles.settingsLabel}>
          音质测试间隔(秒):
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TextInput
            style={[styles.qualityIntervalInput, { color: theme['c-font'], backgroundColor: theme['c-background'] }]}
            placeholder="0"
            placeholderTextColor={theme['c-font-label']}
            value={qualityIntervalSeconds}
            onChangeText={handleQualityIntervalChange}
            keyboardType="number-pad"
            maxLength={5}
            editable={!isTesting}
            />
          <Button
            onPress={openLogModal}
            style={styles.logBtn}
          >
            测试日志
          </Button>
        </View>
      </View>

      {currentProgress && (
        <View style={styles.progressContainer}>
          <Text style={[styles.progressText, { color: theme['c-warning'] }]}>
            {currentProgress}
          </Text>
        </View>
      )}

      {results.length > 0 && (
        <View style={styles.resultSection}>
          <Text style={[styles.sectionTitle, { color: theme['c-font-label'] }]}>
            {t('setting_basic_source_test_result_title')}
          </Text>
          {isTesting && (
            <Text style={[styles.elapsedTimeText, { color: theme['c-font-label'] }]}>
              总耗时: {elapsedTime}s
            </Text>
          )}
          <View style={styles.resultList}>
            {results.map((result) => (
              <View key={result.source} style={styles.resultItem}>
                <View style={styles.resultHeader}>
                  <Text style={[styles.resultName, { color: theme['c-font'] }]}>
                    {result.name}
                  </Text>
                  <Text style={[styles.resultStatus, { color: getStatusColor(result.status) }]}>
                    {getStatusText(result.status)}
                  </Text>
                </View>
                {result.searchedSong && (
                  <Text style={[styles.resultSong, { color: theme['c-font-label'] }]}>
                    找到: {result.searchedSong}
                  </Text>
                )}
                <Text style={[styles.resultMessage, { color: getStatusColor(result.status) }]}>
                  {result.message || (result.status === 'failed' ? `耗时${result.delay || 0}ms，可能是(接口挂掉了/网络问题/不支持该源/频率超限了)` : '')}
                </Text>
                {result.status === 'success' && result.maxQuality && (
                  <View style={[styles.qualityBadge, { backgroundColor: getQualityColors[result.maxQuality] || '#ccc' }]}>
                    <Text style={styles.qualityBadgeText}>{getQualityLabel(result.maxQuality)}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </View>
      )}

      <LogConfirmAlert
        ref={logModalRef}
        cancelText="关闭"
        confirmText="清空日志"
        onConfirm={handleCleanLog}
        showConfirm={!!logText}
        reverseBtn={true}
        middleText="复制全部"
        onMiddle={() => copyToClipboard(logText)}
        showMiddle={!!logText}
      >
        <View style={styles.logContent} onStartShouldSetResponder={() => true}>
          {logText ? (
            <Text selectable={true} style={{ fontSize: 13, lineHeight: 18 }}>
              {logText}
            </Text>
          ) : (
            <Text size={13}>暂无日志</Text>
          )}
        </View>
      </LogConfirmAlert>
    </View>
  )
})

const styles = StyleSheet.create({
  container: {
    marginTop: 15,
    padding: 12,
    borderRadius: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 6,
  },
  desc: {
    fontSize: 12,
    opacity: 0.7,
    marginBottom: 12,
  },
  keywordsSection: {
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  keywordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },

  sourceLabel: {
    width: 50,
    fontSize: 13,
    fontWeight: '500',
  },

  keywordContainer: {
    flex: 1,
    minWidth: 100,
    marginRight: 12,
    zIndex: 1,
  },

  keywordInput: {
    width: '100%',
    height: 42,
    paddingHorizontal: 12,
    borderRadius: 8,
    fontSize: 14,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    zIndex: 2,
  },

  singleTestBtnContainer: {
    width: 72,
    flexShrink: 0,
    zIndex: 1,
  },

  singleTestBtn: {
    width: '100%',
    height: 42,
    backgroundColor: '#1890ff',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    textAlign: 'center',
    textAlignVertical: 'center',
  },

  buttonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
  },

  startTestBtn: {
    flex: 1,
    height: 40,
    backgroundColor: '#1890ff',
    borderRadius: 8,
  },

  stopTestBtn: {
    flex: 1,
    height: 40,
    backgroundColor: '#ff4d4f',
    borderRadius: 8,
  },

  settingsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 12,
  },

  settingsLabel: {
    fontSize: 13,
    color: '#666666',
  },

  errorInput: {
    width: 80,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 6,
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignSelf: 'center',
    direction: 'ltr',
  },

  timeoutInput: {
    width: 80,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 6,
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignSelf: 'center',
    direction: 'ltr',
  },

  intervalInput: {
    width: 80,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 6,
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignSelf: 'center',
    direction: 'ltr',
  },

  qualityIntervalInput: {
    width: 80,
    height: 38,
    paddingHorizontal: 10,
    borderRadius: 6,
    fontSize: 14,
    textAlign: 'center',
    textAlignVertical: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    alignSelf: 'center',
    direction: 'ltr',
  },

  logBtn: {
    height: 38,
    paddingHorizontal: 16,
    backgroundColor: '#6c757d',
    borderRadius: 6,
  },
  progressContainer: {
    padding: 10,
    backgroundColor: 'rgba(255, 193, 7, 0.1)',
    borderRadius: 6,
    marginBottom: 12,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressText: {
    fontSize: 13,
  },
  elapsedTimeText: {
    fontSize: 12,
  },
  resultSection: {
    marginTop: 12,
  },
  resultList: {
    backgroundColor: 'rgba(0, 0, 0, 0.05)',
    borderRadius: 6,
    padding: 8,
  },
  resultItem: {
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0, 0, 0, 0.1)',
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  resultName: {
    fontSize: 14,
    fontWeight: '500',
  },
  resultStatus: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  resultSong: {
    fontSize: 12,
    marginBottom: 2,
    opacity: 0.7,
  },
  resultMessage: {
    fontSize: 13,
    marginBottom: 4,
  },
  qualityBadge: {
    display: 'inline-block',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 4,
  },
  qualityBadgeText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  logContent: {
    flexGrow: 1,
    flexShrink: 1,
    flexDirection: 'column',
  },
})