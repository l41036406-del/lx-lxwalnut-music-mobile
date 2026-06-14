/**
 * QQ音乐歌单列表项 - 复刻网易云"我的歌单"列表项
 */

import { memo } from 'react'
import { View, TouchableOpacity, StyleSheet } from 'react-native'
import Image from '@/components/common/Image'
import Text from '@/components/common/Text'
import { useTheme } from '@/store/theme/hook'

interface PlaylistItem {
  id: string
  name: string
  cover: string
  songCount: number
  desc?: string
  isFavorites?: boolean
}

interface ListItemProps {
  item: PlaylistItem
  onPress: (item: PlaylistItem) => void
}

export default memo(({ item, onPress }: ListItemProps) => {
  const theme = useTheme()

  return (
    <TouchableOpacity
      style={[styles.container, { borderBottomColor: theme['c-list-header-border-bottom'] }]}
      onPress={() => onPress(item)}
    >
      {/* 封面图片 */}
      <Image url={item.cover} style={styles.cover} />

      {/* 歌单信息 */}
      <View style={styles.info}>
        <Text size={16} numberOfLines={2}>{item.name}</Text>
        {item.songCount > 0 ? (
          <Text size={12} color={theme['c-font-label']} style={{ marginTop: 4 }}>
            {item.songCount} tracks
          </Text>
        ) : null}
      </View>
    </TouchableOpacity>
  )
})

const styles = StyleSheet.create({
  container: {
    height: 100,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    borderBottomWidth: 1,
  },
  cover: {
    width: 80,
    height: 80,
    borderRadius: 8,
    marginRight: 15,
  },
  info: {
    flex: 1,
  },
})
