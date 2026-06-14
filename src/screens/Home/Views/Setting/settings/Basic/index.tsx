import { memo } from 'react'

import Theme from '../Theme'
import Section from '../../components/Section'
import Source from './Source'
import SourceName from './SourceName'
import Language from './Language'
import FontSize from './FontSize'
import ShareType from './ShareType'
import IsStartupAutoPlay from './IsStartupAutoPlay'
import IsEnableSlideSwitchSong from './IsEnableSlideSwitchSong'
import IsStartupPushPlayDetailScreen from './IsStartupPushPlayDetailScreen'
import IsAutoHidePlayBar from './IsAutoHidePlayBar'
import IsHomePageScroll from './IsHomePageScroll'
import IsShowBackBtn from './IsShowBackBtn'
import IsShowExitBtn from './IsShowExitBtn'
import IsUseSystemFileSelector from './IsUseSystemFileSelector'
import IsAlwaysKeepStatusbarHeight from './IsAlwaysKeepStatusbarHeight'
import DrawerLayoutPosition from './DrawerLayoutPosition'
import IsShowMyListSubMenu from './IsShowMyListSubMenu'
import IsNewListUI from './IsNewListUI'
import { useI18n } from '@/lang/i18n'
import WyCookie from './WyCookie'
import TxCookie from './TxCookie'
import NavMenu from "@/screens/Home/Views/Setting/settings/Basic/NavMenu.tsx";
import BilibiliMultiPage from './BilibiliMultiPage'

export default memo(() => {
  const t = useI18n()

  return (
    <Section title={t('setting_basic')} sectionId="setting_basic">
      <IsStartupAutoPlay />
      <IsEnableSlideSwitchSong />
      {/*<IsStartupPushPlayDetailScreen />*/}
      {global.lx.isCarMode ? (
        <>
          <IsShowBackBtn />
          <IsShowExitBtn />
        </>
      ) : null}
      <IsHomePageScroll />
      <IsShowMyListSubMenu />
      <IsNewListUI />
      <IsUseSystemFileSelector />
      <IsAlwaysKeepStatusbarHeight />
      <Theme />
      <DrawerLayoutPosition />
      <NavMenu />
      <Language />
      <FontSize />
      <ShareType />
      <Source />
      <SourceName />
      <WyCookie />
      <TxCookie />
      <BilibiliMultiPage />
    </Section>
  )
})
