import {forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState} from 'react'
import OnlineList, { type OnlineListType, type OnlineListProps } from '@/components/OnlineList'
import { clearListDetail, getListDetail, setListDetail, setListDetailInfo } from '@/core/songlist'
import songlistState from '@/store/songlist/state'
import { handlePlay } from './listAction'
import { useListInfo } from './state'
import {DetailInfo} from "@/screens/SonglistDetail/Header.tsx"
import playerState from '@/store/player/state'
import { LIST_IDS } from '@/config/constant'
import listState from '@/store/list/state'
import { getListMusics } from '@/core/list'
import txUserApi from '@/utils/musicSdk/tx/user'
import { log } from '@/utils/log'

export interface MusicListProps {
  componentId: string
  isCreator: boolean
  onListUpdate: OnlineListProps['onListUpdate']
  playingId: string | null
}

export interface MusicListType {
  loadList: (source: LX.OnlineSource, listId: string, isRefresh?: boolean) => Promise<DetailInfo>
  scrollToInfo: (info: LX.Music.MusicInfoOnline) => void
  addSongToList: (rawSong: any) => void
}

export default forwardRef<MusicListType, MusicListProps>(({componentId, isCreator, playingId }, ref) => {
  const listRef = useRef<OnlineListType>(null)
  const isUnmountedRef = useRef(false)
  const info = useListInfo()
  const [txIsUserCreated, setTxIsUserCreated] = useState(false)
  const [kgIsUserCreated, setKgIsUserCreated] = useState(false)

  useEffect(() => {
    if (info.source === 'tx') {
      txUserApi.getUserPlaylists().then(playlists => {
        const targetPlaylist = playlists.find((p: any) => String(p.id) === String(info.id))
        if (targetPlaylist && !targetPlaylist.isCollected) {
          setTxIsUserCreated(true)
        } else {
          setTxIsUserCreated(false)
        }
      }).catch(() => {
        setTxIsUserCreated(false)
      })
    } else {
      setTxIsUserCreated(false)
    }
  }, [info.source, info.id])

  useEffect(() => {
    if (info.source === 'kg') {
      setKgIsUserCreated(true)
    } else {
      setKgIsUserCreated(false)
    }
  }, [info.source, info.id])

  const finalIsCreator = info.source === 'tx' ? txIsUserCreated : info.source === 'kg' ? kgIsUserCreated : isCreator

  useEffect(() => {
    const handleJumpPosition = () => {
      let listId = playerState.playMusicInfo.listId
      if (listId === LIST_IDS.TEMP) listId = listState.tempListMeta.id
      if (listId !== `${info.source}__${info.id}`) return

      const musicInfo = playerState.playMusicInfo.musicInfo
      if (musicInfo) {
        const currentList = songlistState.listDetailInfo.list
        const index = currentList.findIndex(m => m.id === musicInfo.id)
        if (index > -1) {
          listRef.current?.scrollToInfo(musicInfo as LX.Music.MusicInfoOnline)
        } else {
          const currentListId = `${info.source}__${info.id}`
          if (listId === currentListId) {
            void getListMusics(LIST_IDS.TEMP).then(fullList => {
              if (fullList.length > currentList.length) {
                const castedList = fullList as LX.Music.MusicInfoOnline[]
                if (castedList.length && currentList.length && castedList[0].id === currentList[0].id) {
                  songlistState.listDetailInfo.list = castedList
                  listRef.current?.setList(castedList)
                  setTimeout(() => {
                    listRef.current?.scrollToInfo(musicInfo as LX.Music.MusicInfoOnline)
                  }, 200)
                }
              }
            })
          }
        }
      }
    }

    global.app_event.on('jumpListPosition', handleJumpPosition)
    return () => {
      global.app_event.off('jumpListPosition', handleJumpPosition)
    }
  }, [info.id, info.source])

  useImperativeHandle(
    ref,
    () => ({
      async loadList(source, id, isRefresh = false) {
        if (global.lx.isEnableLog) console.log(`[SonglistDetail] loadList`, { source, id, isRefresh })
        clearListDetail()
        const listDetailInfo = songlistState.listDetailInfo
        const createDetailInfo = (detail: typeof listDetailInfo.info): DetailInfo => ({
          name: (info.name || detail.name) ?? '',
          desc: detail.desc || info.desc || '',
          playCount: info.play_count ?? detail.play_count ?? '',
          imgUrl: info.img ?? detail.img,
          userId: info.userId || detail.userId,
          total: listDetailInfo.total,
        })

        if (
          listDetailInfo.id === id &&
          listDetailInfo.source === source &&
          listDetailInfo.list.length
        ) {
          if (global.lx.isEnableLog) log.info(`[SonglistDetail] loadList cache hit`, { listCount: listDetailInfo.list.length })
          requestAnimationFrame(() => {
            listRef.current?.setList(listDetailInfo.list)
          })
          return Promise.resolve(createDetailInfo(listDetailInfo.info))
        }

        listRef.current?.setStatus('loading')
        const page = 1
        setListDetailInfo(info.source, info.id)
        if (global.lx.isEnableLog) log.info(`[SonglistDetail] loadList start`, { source, id, page, isRefresh })
        return getListDetail(id, source, page, isRefresh)
          .then((listDetail) => {
            if (global.lx.isEnableLog) log.info(`[SonglistDetail] loadList got data`, { songCount: listDetail.list.length, total: listDetail.total })
            const result = setListDetail(listDetail, id, page)
            if (isUnmountedRef.current) return createDetailInfo(result.info)
            requestAnimationFrame(() => {
              listRef.current?.setList(result.list)
              listRef.current?.setStatus(
                songlistState.listDetailInfo.maxPage <= page ? 'end' : 'idle',
              )
            })
            return createDetailInfo(result.info)
          })
          .catch((err) => {
            if (global.lx.isEnableLog) log.info(`[SonglistDetail] loadList error`, { error: err?.message })
            if (songlistState.listDetailInfo.list.length && page === 1) clearListDetail()
            listRef.current?.setStatus('error')
            throw err
          })
      },
      scrollToInfo(targetInfo) {
        const currentList = songlistState.listDetailInfo.list
        if (currentList.some(s => s.id === targetInfo.id)) {
          listRef.current?.scrollToInfo(targetInfo)
          return
        }

        const currentListId = `${songlistState.listDetailInfo.source}__${songlistState.listDetailInfo.id}`
        let playingListId = playerState.playMusicInfo.listId
        if (playingListId === LIST_IDS.TEMP) playingListId = listState.tempListMeta.id

        if (playingListId === currentListId) {
          void getListMusics(LIST_IDS.TEMP).then(fullList => {
            const castedList = fullList as LX.Music.MusicInfoOnline[]
            if (castedList.some(s => s.id === targetInfo.id)) {
              songlistState.listDetailInfo.list = castedList
              listRef.current?.setList(castedList)
              setTimeout(() => {
                listRef.current?.scrollToInfo(targetInfo)
              }, 200)
            }
          })
        }
      },
      addSongToList(rawSong: any) {
        const { decodeName } = require('@/utils/index')
        const song: LX.Music.MusicInfoOnline = {
          id: `kg__${rawSong.hash || rawSong.audio_id}`,
          name: decodeName(rawSong.name || rawSong.songname || '').replace(/\.mp3$/i, ''),
          singer: decodeName(rawSong.singerinfo?.map((s: any) => s.name).join('、') || rawSong.singername || ''),
          albumName: decodeName(rawSong.album_name || ''),
          albumId: String(rawSong.album_id || ''),
          songmid: String(rawSong.audio_id || rawSong.hash || ''),
          source: 'kg',
          interval: rawSong.duration ? rawSong.duration + 's' : '',
          img: rawSong.cover ? rawSong.cover.replace('{size}', '400') : '',
          hash: rawSong.hash || '',
          mixsongid: rawSong.mixsongid || 0,
          fileId: rawSong.fileid || 0,
        } as any
        const currentList = [...songlistState.listDetailInfo.list]
        if (!currentList.some(s => s.id === song.id)) {
          currentList.push(song)
          songlistState.listDetailInfo.list = currentList
          songlistState.listDetailInfo.total = currentList.length
          listRef.current?.setList(currentList)
          log.info(`[乐观更新] 已添加歌曲到列表: ${song.name}, 当前共 ${currentList.length} 首`)
        }
      },
    }),
    [info.source, info.id],
  )

  useEffect(() => {
    isUnmountedRef.current = false
    return () => {
      isUnmountedRef.current = true
    }
  }, [])

  const handlePlayList: OnlineListProps['onPlayList'] = (index) => {
    const listDetailInfo = songlistState.listDetailInfo
    void handlePlay(listDetailInfo.id, listDetailInfo.source, listDetailInfo.list, index)
  }

  const handleRefresh: OnlineListProps['onRefresh'] = () => {
    const page = 1
    listRef.current?.setStatus('refreshing')
    getListDetail(songlistState.listDetailInfo.id, songlistState.listDetailInfo.source, page, true)
      .then((listDetail) => {
        const result = setListDetail(listDetail, songlistState.listDetailInfo.id, page)
        if (isUnmountedRef.current) return
        listRef.current?.setList(result.list)
        listRef.current?.setStatus(songlistState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
      })
      .catch(() => {
        if (songlistState.listDetailInfo.list.length && page == 1) clearListDetail()
        listRef.current?.setStatus('error')
      })
  }

  const handleLoadMore: OnlineListProps['onLoadMore'] = () => {
    listRef.current?.setStatus('loading')
    const page = songlistState.listDetailInfo.list.length
      ? songlistState.listDetailInfo.page + 1
      : 1
    getListDetail(songlistState.listDetailInfo.id, songlistState.listDetailInfo.source, page)
      .then((listDetail) => {
        const result = setListDetail(listDetail, songlistState.listDetailInfo.id, page)
        if (isUnmountedRef.current) return
        listRef.current?.setList(result.list, true)
        listRef.current?.setStatus(songlistState.listDetailInfo.maxPage <= page ? 'end' : 'idle')
      })
      .catch(() => {
        if (songlistState.listDetailInfo.list.length && page == 1) clearListDetail()
        listRef.current?.setStatus('error')
      })
  }

  const handleListUpdate = useCallback((newList: LX.Music.MusicInfoOnline[]) => {
    if (isUnmountedRef.current) return
    songlistState.listDetailInfo.list = newList
  }, [])

  return (
    <OnlineList componentId={componentId}
                ref={listRef}
                onPlayList={handlePlayList}
                onRefresh={handleRefresh}
                onLoadMore={handleLoadMore}
                onListUpdate={handleListUpdate}
                forcePlayList={true}
                listId={`${info.source}__${info.id}`}
                isCreator={finalIsCreator}
                playingId={playingId}
    />
  )
})
