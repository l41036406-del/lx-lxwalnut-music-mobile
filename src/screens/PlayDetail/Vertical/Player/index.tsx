import { memo } from 'react'
import { View } from 'react-native'

import MoreBtn from './components/MoreBtn'
import PlayInfo from './components/PlayInfo'
import ControlBtn from './components/ControlBtn'
import { createStyle } from '@/utils/tools'
import { NAV_SHEAR_NATIVE_IDS } from '@/config/constant'

export default memo(({ componentId }: { componentId: string }) => {
  return (
    <View 
      style={styles.container} 
      nativeID={NAV_SHEAR_NATIVE_IDS.playDetail_player}
    >
      <PlayInfo />
      <ControlBtn />
      <MoreBtn componentId={componentId} />
    </View>
  )
})

const styles = createStyle({
  container: {
    flex: 0,
    width: '100%',
    paddingHorizontal: 15,
    paddingBottom: 15,
    paddingTop: 5,
    flexDirection: 'column',
  },
})
