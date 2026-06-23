import { stringMd5 } from 'react-native-quick-md5'
import { decodeName } from '../index'
import settingState from '@/store/setting/state';
import {logPlugin} from "@babel/preset-env/lib/debug";

export const QUALITYS = ['master', 'atmos_plus', 'atmos', 'hires', 'flac', '320k', '192k', '128k']
export const getMusicType = (info, type) => {
  const list = global.lx.qualityList[info.source]
  if (!list) return '128k'
  if (!list.includes(type)) type = list[list.length - 1]
  const rangeType = QUALITYS.slice(QUALITYS.indexOf(type))
  for (const type of rangeType) {
    if (info._types[type]) return type
  }
  return '128k'
}

export const toMD5 = (str) => stringMd5(str)

export const formatSingerName = (singers, nameKey = 'name', join = '、') => {
  if (Array.isArray(singers)) {
    const singer = []
    singers.forEach((item) => {
      let name = item[nameKey]
      if (!name) return
      singer.push(name)
    })
    return decodeName(singer.join(join))
  }
  return decodeName(String(singers ?? ''))
}

export const resolveQualityAlias = (source, type) => {
  const activeApiId = settingState.setting['common.apiSource'];
  if (!/^user_api/.test(activeApiId)) {
    console.log(`[LX Music SDK] No custom API detected (activeApiId: '${activeApiId}'), skipping quality alias resolution.`);
    return type;
  }
  const supportedQualities = global.lx.qualityList[source];
  // console.log(`[LX Music SDK] Supported qualities for source '${source}':`, supportedQualities);
  if (!supportedQualities) {
    console.log(`[LX Music SDK] No quality configuration found for source '${source}', skipping quality alias resolution.`);
    return type;
  }
  if (
    type === 'hires' &&
    !supportedQualities.includes('hires')
  ) {
    console.log(`[LX Music SDK] Resolving quality alias for source '${source}': 'hires' -> 'flac24bit'`);
    return 'flac24bit';
  }

  return type;
};
