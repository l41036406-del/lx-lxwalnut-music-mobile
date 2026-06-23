import { initSetting, showPactModal } from '@/core/common'
import registerPlaybackService from '@/plugins/player/service'
import initTheme from './theme'
import initI18n from './i18n'
import initUserApi from './userApi'
import initPlayer from './player'
import dataInit from './dataInit'
import initSync from './sync'
import initCommonState from './common'
import initUiMode from './uiMode'
import { initDeeplink } from './deeplink'
import { setApiSource } from '@/core/apiSource'
import commonActions from '@/store/common/action'
import settingState from '@/store/setting/state'
import { checkUpdate } from '@/core/version'
import { bootLog } from '@/utils/bootLog'
import { cheatTip } from '@/utils/tools'
import * as networkLyric from '@/core/networkLyric'
import { searchLog } from '@/utils/searchLog'
import { playerLog } from '@/utils/playerLog'

let isFirstPush = true
const handlePushedHomeScreen = async () => {
  await cheatTip()
  if (settingState.setting['common.isAgreePact']) {
    if (isFirstPush) {
      isFirstPush = false
      void initDeeplink()
    }
  } else {
    if (isFirstPush) isFirstPush = false
    showPactModal()
  }

  setTimeout(() => {
    void initSync(settingState.setting);
    bootLog('Sync service started with a delay.');
  }, 3000)
  if (settingState.setting['version.autoCheckUpdate']) {
    void checkUpdate(false)
  } else {
    void checkUpdate(true)
  }
  networkLyric.init()
}

let isInited = false
export default async () => {
  if (isInited) return handlePushedHomeScreen
  bootLog('Initing...')
  commonActions.setFontSize(global.lx.fontSize)
  bootLog('Font size changed.')
  const setting = await initSetting()
  bootLog('Setting inited.')
  
  global.lx.isEnableLog = setting['common.isEnableLog'] ?? true
  global.lx.isEnableSyncLog = setting['common.isEnableSyncLog'] ?? false
  global.lx.isEnableUserApiLog = setting['common.isEnableUserApiLog'] ?? false
  bootLog('Log state restored.')
  
  searchLog.init()
  bootLog('Search Log inited.')
  playerLog.init()
  bootLog('Player Log inited.')

  await Promise.all([
    initTheme(setting),
    initI18n(setting),
    initUserApi(setting),
    initUiMode(),
  ])
  bootLog('Theme, I18n, UserApi inited.')

  setApiSource(setting['common.apiSource'])
  bootLog('Api inited.')

  registerPlaybackService()
  bootLog('Playback Service Registered.')
  await initPlayer(setting)
  bootLog('Player inited.')
  await dataInit(setting)
  bootLog('Data inited.')
  await initCommonState(setting)
  bootLog('Common State inited.')

  isInited ||= true

  return handlePushedHomeScreen
}
