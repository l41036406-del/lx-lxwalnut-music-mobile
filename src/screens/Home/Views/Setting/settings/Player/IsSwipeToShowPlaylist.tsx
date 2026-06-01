import { updateSetting } from '@/core/common'
import { useI18n } from '@/lang'
import { createStyle } from '@/utils/tools'
import { memo } from 'react'
import { View } from 'react-native'
import { useSettingValue } from '@/store/setting/hook'

import CheckBoxItem from '../../components/CheckBoxItem'

export default memo(() => {
  const t = useI18n()
  const isSwipeToShowPlaylist = useSettingValue('player.isSwipeToShowPlaylist')
  const setSwipeToShowPlaylist = (isSwipeToShowPlaylist: boolean) => {
    updateSetting({ 'player.isSwipeToShowPlaylist': isSwipeToShowPlaylist })
  }

  return (
    <View style={styles.content}>
      <CheckBoxItem
        check={isSwipeToShowPlaylist}
        label={t('setting_player_swipe_to_show_playlist')}
        onChange={setSwipeToShowPlaylist}
      />
    </View>
  )
})

const styles = createStyle({
  content: {
    marginTop: 5,
  },
})
