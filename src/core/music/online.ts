import { saveLyric, saveMusicUrl, getMusicUrl as getStoreMusicUrl } from '@/utils/data'
import { updateListMusics } from '@/core/list'
import settingState from '@/store/setting/state'

import wySdk from '@/utils/musicSdk/wy'
import {
  buildLyricInfo,
  getPlayQuality,
  handleGetOnlineLyricInfo,
  handleGetOnlineMusicUrl,
  handleGetOnlinePicUrl,
  getCachedLyricInfo, QUALITY_RANK,
} from './utils'
import {toast} from "@/utils/tools.ts"
import {fetchAndApplyDetailedQuality} from "@/utils/musicSdk/wy/musicDetail.js"
import userState from '@/store/user/state'

/* export const setMusicUrl = ({ musicInfo, type, url }: {
  musicInfo: LX.Music.MusicInfo
  type: LX.Quality
  url: string
}) => {
  saveMusicUrl(musicInfo, type, url)
}

export const setPic = (datas: {
  listId: string
  musicInfo: LX.Music.MusicInfo
  url: string
}) => {
  datas.musicInfo.img = datas.url
  updateMusicInfo({
    listId: datas.listId,
    id: datas.musicInfo.songmid,
    data: { img: datas.url },
    musicInfo: datas.musicInfo,
  })
}
 */

export const getMusicUrl = async ({
  musicInfo,
  quality,
  isRefresh,
  allowToggleSource = true,
  onToggleSource = () => {},
}: {
  musicInfo: LX.Music.MusicInfoOnline
  quality?: LX.Quality
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  // if (!musicInfo._types[type]) {
  //   if (!(musicInfo.source == 'kw' && type == '128k')) throw new Error('该歌曲没有可播放的音频')

  //   // return Promise.reject(new Error('该歌曲没有可播放的音频'))
  // }

  let currentMusicInfo = musicInfo;
  const preferredQuality = settingState.setting['player.playQuality'];

  const isWySource = currentMusicInfo.source === 'wy';
  const hasFullDetails = currentMusicInfo.meta._full;
  console.log("播放：currentMusicInfo:", currentMusicInfo);

  if (isWySource && !hasFullDetails) {
    const availableQualities = Object.keys(currentMusicInfo.meta._qualitys);
    const preferredQualityIndex = QUALITY_RANK.indexOf(preferredQuality);
    const maxAvailableQualityIndex = Math.min(...availableQualities.map(q => QUALITY_RANK.indexOf(q)));

    if (preferredQualityIndex < maxAvailableQualityIndex) {
      console.log('用户想要的音质比当前已知的最好音质还要高，获取音质详情');
      currentMusicInfo = await fetchAndApplyDetailedQuality(currentMusicInfo);
    } else {
      console.log('用户想要的音质比当前已知的最好音质还要低，无需获取音质详情');
      void fetchAndApplyDetailedQuality(currentMusicInfo);
    }
  }

  const targetQuality = quality ?? getPlayQuality(preferredQuality, currentMusicInfo);

  const cachedUrl = await getStoreMusicUrl(currentMusicInfo, targetQuality)
  if (cachedUrl && !isRefresh) return cachedUrl

  const highQualityLevels: LX.Quality[] = ['flac', 'hires', 'master', 'atmos', 'atmos_plus'];

  const isVipUser = userState.wy_vip_type !== 0;
  const isVipSong = currentMusicInfo.meta.fee === 1;
  const isHighQuality = highQualityLevels.includes(targetQuality);

  const preferApi = !isWySource || (!isVipUser && (isVipSong || isHighQuality))

  console.log("vip:" + userState.wy_vip_type)
  if (preferApi) {
    try {
      console.log('Attempting to get music URL via custom API');
      const result = await handleGetOnlineMusicUrl({
        musicInfo: currentMusicInfo,
        quality: targetQuality,
        onToggleSource,
        isRefresh,
        allowToggleSource,
      });
      console.log('Custom API request succeeded', result);
      void saveMusicUrl(currentMusicInfo, result.quality, result.url);
      return result.url;
    } catch (apiError) {
      console.log('Custom API request failed', apiError);
      throw apiError;
    }
  }

  if (musicInfo.source == 'wy' && settingState.setting['common.wy_cookie']) {
    try {
      const { url } = await wySdk.cookie.getMusicUrl(currentMusicInfo, targetQuality).promise;
      if (url) {
        void saveMusicUrl(currentMusicInfo, targetQuality, url);
        if (currentMusicInfo.id !== musicInfo.id) void saveMusicUrl(musicInfo, targetQuality, url);
        return url;
      }
    } catch (error) {
      console.log('Get music url with cookie failed, fallback to custom api', error);
    }
  }

  return handleGetOnlineMusicUrl({
    musicInfo: currentMusicInfo,
    quality: targetQuality,
    onToggleSource,
    isRefresh,
    allowToggleSource,
  }).then(({ url, quality: targetQuality, musicInfo: targetMusicInfo, isFromCache }) => {
    if (targetMusicInfo.id != currentMusicInfo.id && !isFromCache)
      void saveMusicUrl(targetMusicInfo, targetQuality, url)
    void saveMusicUrl(currentMusicInfo, targetQuality, url)
    if (currentMusicInfo.id !== musicInfo.id) void saveMusicUrl(musicInfo, targetQuality, url)
    return url
  })
}

export const getPicUrl = async ({
  musicInfo,
  listId,
  isRefresh,
  allowToggleSource = true,
  onToggleSource = () => {},
}: {
  musicInfo: LX.Music.MusicInfoOnline
  listId?: string | null
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<string> => {
  if (musicInfo.meta.picUrl && !isRefresh) return musicInfo.meta.picUrl
  return handleGetOnlinePicUrl({ musicInfo, onToggleSource, isRefresh, allowToggleSource }).then(
    ({ url, musicInfo: targetMusicInfo, isFromCache }) => {
      // picRequest = null
      if (listId) {
        musicInfo.meta.picUrl = url
        void updateListMusics([{ id: listId, musicInfo }])
      }
      // savePic({ musicInfo, url, listId })
      return url
    }
  )
}
export const getLyricInfo = async ({
  musicInfo,
  isRefresh,
  allowToggleSource = true,
  onToggleSource = () => {},
}: {
  musicInfo: LX.Music.MusicInfoOnline
  isRefresh: boolean
  allowToggleSource?: boolean
  onToggleSource?: (musicInfo?: LX.Music.MusicInfoOnline) => void
}): Promise<LX.Player.LyricInfo> => {
  if (!isRefresh) {
    const lyricInfo = await getCachedLyricInfo(musicInfo)
    if (lyricInfo) return buildLyricInfo(lyricInfo)
  }

  // lrcRequest = music[musicInfo.source].getLyric(musicInfo)
  return handleGetOnlineLyricInfo({ musicInfo, onToggleSource, isRefresh, allowToggleSource }).then(
    async ({ lyricInfo, musicInfo: targetMusicInfo, isFromCache }) => {
      // lrcRequest = null
      if (isFromCache) return buildLyricInfo(lyricInfo)
      if (targetMusicInfo.id == musicInfo.id) void saveLyric(musicInfo, lyricInfo)
      else void saveLyric(targetMusicInfo, lyricInfo)

      return buildLyricInfo(lyricInfo)
    }
  )
}
