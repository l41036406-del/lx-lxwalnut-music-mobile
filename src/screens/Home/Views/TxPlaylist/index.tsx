/**
 * QQ音乐歌单页面 - 显示用户自建歌单和收藏歌单
 */

import { memo, useEffect, useState, useCallback, useRef } from 'react'
import { View, FlatList, RefreshControl, BackHandler, StyleSheet, Keyboard, TouchableOpacity } from 'react-native'
import ListItem from './ListItem'
import txUserApi from '@/utils/musicSdk/tx/user'
import { useI18n } from '@/lang'
import { useTheme } from '@/store/theme/hook'
import Text from '@/components/common/Text'
import { toast } from '@/utils/tools'
import SonglistDetail from '../../../SonglistDetail'
import commonState from '@/store/common/state'

interface PlaylistInfo {
  id: string
  name: string
  cover: string
  songCount: number
  desc: string
  isFavorites?: boolean
  isCollected?: boolean
}

type TabType = 'created' | 'collected'

export default memo(() => {
  const t = useI18n()
  const theme = useTheme()
  const [activeTab, setActiveTab] = useState<TabType>('created')
  const [createdPlaylists, setCreatedPlaylists] = useState<PlaylistInfo[]>([])
  const [collectedPlaylists, setCollectedPlaylists] = useState<PlaylistInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedPlaylist, setSelectedPlaylist] = useState<any>(null)
  const selectedPlaylistRef = useRef(selectedPlaylist)
  selectedPlaylistRef.current = selectedPlaylist

  const playlists = activeTab === 'created' ? createdPlaylists : collectedPlaylists

  const fetchCreatedPlaylists = useCallback(async (isRefresh = false) => {
    try {
      const lists = await txUserApi.getCreatedPlaylists()
      setCreatedPlaylists(lists)
    } catch (err: any) {
      console.error('获取自建歌单失败:', err)
      if (!isRefresh) {
        toast(`获取自建歌单失败: ${err.message}`)
      }
    }
  }, [])

  const fetchCollectedPlaylists = useCallback(async (isRefresh = false) => {
    try {
      const result = await txUserApi.getFavPlaylists(1, 50)
      setCollectedPlaylists(result.list || [])
    } catch (err: any) {
      console.error('获取收藏歌单失败:', err)
      if (!isRefresh) {
        toast(`获取收藏歌单失败: ${err.message}`)
      }
    }
  }, [])

  const fetchPlaylists = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }
      await Promise.all([
        fetchCreatedPlaylists(isRefresh),
        fetchCollectedPlaylists(isRefresh),
      ])
    } catch (err: any) {
      console.error('获取歌单失败:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [fetchCreatedPlaylists, fetchCollectedPlaylists])

  useEffect(() => {
    fetchPlaylists()
  }, [fetchPlaylists])

  const onRefresh = useCallback(() => {
    fetchPlaylists(true)
  }, [fetchPlaylists])

  useEffect(() => {
    const onBackPress = () => {
      if (selectedPlaylistRef.current) {
        if (commonState.componentIds.length > 1) {
          return false
        }
        setSelectedPlaylist(null)
        return true
      }
      return false
    }

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress)
    return () => subscription.remove()
  }, [])

  const handleItemPress = useCallback((info: PlaylistInfo) => {
    const playlistInfo = {
      id: info.id,
      name: info.name,
      author: '',
      img: info.cover,
      play_count: 0,
      desc: info.desc,
      source: 'tx',
      userId: '',
      total: info.songCount,
    }
    setSelectedPlaylist(playlistInfo)
  }, [])

  const handleBack = useCallback(() => {
    setSelectedPlaylist(null)
  }, [])

  const renderTab = useCallback((tab: TabType, label: string) => {
    const isActive = activeTab === tab
    return (
      <TouchableOpacity
        key={tab}
        style={[styles.tabItem, isActive && { borderBottomColor: theme['c-primary'] }]}
        onPress={() => setActiveTab(tab)}
      >
        <Text style={[styles.tabText, isActive && { color: theme['c-primary'] }]}>
          {label}
        </Text>
      </TouchableOpacity>
    )
  }, [activeTab, theme])

  return (
    <View style={{ flex: 1 }}>
      <View
        style={[{ flex: 1 }, selectedPlaylist ? { opacity: 0 } : null]}
        pointerEvents={selectedPlaylist ? 'none' : 'auto'}
      >
        {/* 标签栏 */}
        <View style={[styles.tabBar, { borderBottomColor: theme['c-border-background'] }]}>
          {renderTab('created', `自建歌单 (${createdPlaylists.length})`)}
          {renderTab('collected', `收藏歌单 (${collectedPlaylists.length})`)}
        </View>

        {/* 歌单列表 */}
        <FlatList
          onScrollBeginDrag={Keyboard.dismiss}
          data={playlists}
          renderItem={({ item }) => (
            <ListItem item={item} onPress={handleItemPress} />
          )}
          keyExtractor={item => `${item.id}-${item.isCollected ? 'collected' : 'created'}`}
          refreshControl={
            <RefreshControl
              colors={[theme['c-primary']]}
              refreshing={refreshing}
              onRefresh={onRefresh}
            />
          }
          ListEmptyComponent={
            loading ? null : (
              <View style={styles.emptyContainer}>
                <Text style={styles.emptyText}>
                  {playlists.length === 0 ? t('list_empty') : ''}
                </Text>
              </View>
            )
          }
        />
      </View>
      {selectedPlaylist && (
        <View style={[StyleSheet.absoluteFill]}>
          <SonglistDetail info={selectedPlaylist} onBack={handleBack} />
        </View>
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    borderBottomWidth: 1,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 14,
    opacity: 0.7,
  },
})
