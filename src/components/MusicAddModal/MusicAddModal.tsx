import {forwardRef, useEffect, useImperativeHandle, useRef, useState} from 'react'
import Dialog, { type DialogType } from '@/components/common/Dialog'
import { toast } from '@/utils/tools'
import Title from './Title'
import List from './List'
import Button from '@/components/common/Button'
import wyApi from '@/utils/musicSdk/wy/user'
import txApi from '@/utils/musicSdk/tx/user'
import { useI18n } from '@/lang'
import { addListMusics, moveListMusics } from '@/core/list'
import settingState from '@/store/setting/state'
import {useTheme} from "@/store/theme/hook"
import {getPlaylistType, savePlaylistType} from "@/utils/data"
import {Text, View} from "react-native"
import {addWyLikedSong, removeWyLikedSong, updateWySubscribedPlaylistTrackCount} from "@/store/user/action.ts";
import {clearListDetailCache} from "@/core/songlist.ts";
import {useWySubscribedPlaylists} from "@/store/user/hook.ts";
import { log } from '@/utils/log'

export interface SelectInfo {
  musicInfo: LX.Music.MusicInfo | null
  listId: string
  isMove: boolean
}

const initSelectInfo = {}

export interface MusicAddModalProps {
  onAdded?: () => void
}

export interface MusicAddModalType {
  show: (info: SelectInfo) => void
}

export default forwardRef<MusicAddModalType, MusicAddModalProps>(({ onAdded }, ref) => {
  const t = useI18n()
  const dialogRef = useRef<DialogType>(null)
  const [selectInfo, setSelectInfo] = useState<SelectInfo>(initSelectInfo as SelectInfo)
  const [playlistType, setPlaylistType] = useState<'local' | 'wy' | 'tx'>('local')
  const theme = useTheme()
  const subscribedPlaylists = useWySubscribedPlaylists()

  useEffect(() => {
    getPlaylistType().then(setPlaylistType)
  }, [])

  const handlePlaylistTypeChange = (type: 'local' | 'wy' | 'tx') => {
    setPlaylistType(type)
    void savePlaylistType(type)
  }


  useImperativeHandle(ref, () => ({
    show(selectInfo) {
      setSelectInfo(selectInfo)
      requestAnimationFrame(() => {
        dialogRef.current?.setVisible(true)
      })
    },
  }))

  const handleHide = () => {
    requestAnimationFrame(() => {
      setSelectInfo({ ...selectInfo, musicInfo: null })
    })
  }

  const handleSelect = (listInfo: LX.List.MyListInfo) => {
    dialogRef.current?.setVisible(false)
    const { musicInfo, listId: fromListId, isMove } = selectInfo
    
    log.info('[MusicAddModal] handleSelect 开始', {
      playlistType,
      toListId: listInfo.id,
      toListName: listInfo.name,
      fromListId,
      isMove,
      musicInfo: musicInfo ? {
        name: musicInfo.name,
        singer: musicInfo.singer,
        source: musicInfo.source,
        songId: musicInfo.meta?.songId,
      } : null,
    })
    
    // 网易云歌单
    if (playlistType === 'wy') {
      if (!musicInfo) {
        log.error('[MusicAddModal] 网易歌单添加失败: musicInfo 为空')
        return;
      }
      
      // 检查 songId 格式 - 网易云音乐需要纯数字 ID
      const songId = String(musicInfo.meta.songId);  // 转为字符串
      if (!songId || !/^\d+$/.test(songId)) {
        log.error('[MusicAddModal] 网易歌单添加失败: songId 格式不正确', {
          songId,
          songIdType: typeof musicInfo.meta.songId,
          expected: '纯数字ID',
          musicSource: musicInfo.source,
        })
        toast('该歌曲不支持添加到网易云歌单（ID格式不兼容）')
        return;
      }
      
      const toListId = String(listInfo.id);
      // 检查目标歌单 ID 格式
      if (toListId.startsWith('tx__')) {
        log.error('[MusicAddModal] 网易歌单添加失败: 目标歌单 ID 格式错误', {
          toListId,
          expected: '网易云歌单ID（纯数字）',
        })
        toast('目标歌单 ID 格式错误，请选择网易云歌单')
        return;
      }
      
      const sourcePlaylist = subscribedPlaylists.find(p => `wy__${p.id}` === fromListId);

      if (isMove) {
        wyApi.manipulatePlaylistTracks('add', toListId, [songId]).then(() => {
          if (listInfo.name === listInfo.creator.nickname + '喜欢的音乐') {
            addWyLikedSong(songId)
          }
          const sourcePlaylistId = fromListId.replace('wy__', '');
          clearListDetailCache('wy', toListId)
          global.app_event.playlist_updated({ source: 'wy', listId: toListId })
          return wyApi.manipulatePlaylistTracks('del', sourcePlaylistId, [songId]);
        }).then(() => {
          if (sourcePlaylist?.name === sourcePlaylist?.creator?.nickname + '喜欢的音乐') {
            removeWyLikedSong(songId)
          }
          onAdded?.()
          toast(t('list_edit_action_tip_move_success'));
          updateWySubscribedPlaylistTrackCount(toListId, 1);
          const sourcePlaylistId = fromListId.replace('wy__', '')
          updateWySubscribedPlaylistTrackCount(sourcePlaylistId, -1);
          clearListDetailCache('wy', sourcePlaylistId)
          global.app_event.playlist_updated({ source: 'wy', listId: sourcePlaylistId })
          log.info('[MusicAddModal] 网易歌单移动成功', { toListId, songId })
        }).catch((err) => {
          log.error('[MusicAddModal] 网易歌单移动失败', {
            error: err.message || err,
            toListId,
            songId,
            fromListId,
          })
          toast(err.message || t('list_edit_action_tip_move_failed'));
        });
      } else {
        wyApi.manipulatePlaylistTracks('add', toListId, [songId]).then(() => {
          if (listInfo.name === listInfo.creator.nickname + '喜欢的音乐') {
            addWyLikedSong(songId)
          }
          onAdded?.()
          toast(t('list_edit_action_tip_add_success'))
          updateWySubscribedPlaylistTrackCount(toListId, 1)
          clearListDetailCache('wy', toListId)
          global.app_event.playlist_updated({ source: 'wy', listId: toListId })
          log.info('[MusicAddModal] 网易歌单添加成功', { toListId, songId })
        }).catch((err) => {
          log.error('[MusicAddModal] 网易歌单添加失败', {
            error: err.message || err,
            toListId,
            songId,
          })
          toast(err.message || t('list_edit_action_tip_add_failed'));
        });
      }
      return;
    }
    
    // QQ音乐歌单
    if (playlistType === 'tx') {
      if (!musicInfo) {
        log.error('[MusicAddModal] QQ歌单添加失败: musicInfo 为空')
        return;
      }
      
      // 检查歌曲来源 - QQ 歌单只能添加 QQ 音乐的歌曲
      if (musicInfo.source !== 'tx') {
        log.error('[MusicAddModal] QQ歌单添加失败: 歌曲来源不是QQ音乐', {
          musicSource: musicInfo.source,
          songName: musicInfo.name,
          note: 'QQ歌单只能添加QQ音乐的歌曲',
        })
        toast('QQ歌单只能添加QQ音乐的歌曲，不支持跨平台添加')
        return;
      }
      
      // 检查歌曲 mid 格式 - QQ 音乐需要歌曲的 mid（media id）
      const songMid = musicInfo.meta.mid || musicInfo.meta.songId;
      if (!songMid) {
        log.error('[MusicAddModal] QQ歌单添加失败: 歌曲 mid 为空', {
          musicInfo,
          meta: musicInfo.meta,
        })
        toast('歌曲 mid 为空，无法添加')
        return;
      }
      
      // 获取真实的 QQ 歌单 ID（去掉 tx__ 前缀）
      const toListId = String(listInfo.id).replace('tx__', '');
      if (!toListId || toListId === String(listInfo.id)) {
        log.error('[MusicAddModal] QQ歌单添加失败: 目标歌单 ID 格式错误', {
          originalId: listInfo.id,
          toListId,
          expected: 'tx__开头的ID',
        })
        toast('目标歌单 ID 格式错误，请选择 QQ 歌单')
        return;
      }
      
      log.info('[MusicAddModal] QQ歌单添加开始', {
        toListId,
        songMid,
        musicSource: musicInfo.source,
      })
      
      txApi.addSongToPlaylist(toListId, [String(songMid)]).then(() => {
        onAdded?.()
        toast(t('list_edit_action_tip_add_success'))
        global.app_event.playlist_updated({ source: 'tx', listId: toListId })
        log.info('[MusicAddModal] QQ歌单添加成功', { toListId, songMid })
      }).catch((err) => {
        log.error('[MusicAddModal] QQ歌单添加失败', {
          error: err.message || err,
          toListId,
          songMid,
          musicSource: musicInfo.source,
        })
        toast(err.message || t('list_edit_action_tip_add_failed'));
      });
      return;
    }

    if (selectInfo.isMove) {
      void moveListMusics(
        selectInfo.listId,
        listInfo.id,
        [selectInfo.musicInfo!],
        settingState.setting['list.addMusicLocationType']
      )
        .then(() => {
          onAdded?.()
          toast(t('list_edit_action_tip_move_success'))
        })
        .catch(() => {
          toast(t('list_edit_action_tip_move_failed'))
        })
    } else {
      void addListMusics(
        listInfo.id,
        [selectInfo.musicInfo!],
        settingState.setting['list.addMusicLocationType']
      )
        .then(() => {
          onAdded?.()
          toast(t('list_edit_action_tip_add_success'))
        })
        .catch(() => {
          toast(t('list_edit_action_tip_add_failed'))
        })
    }
  }


  return (
    <Dialog ref={dialogRef} onHide={handleHide}>
      {selectInfo.musicInfo ? (
        <>
          <Title musicInfo={selectInfo.musicInfo} isMove={selectInfo.isMove} />
          <View style={{ flexDirection: 'row', justifyContent: 'center', paddingVertical: 10 }}>
            <Button onPress={() => handlePlaylistTypeChange('local')} style={{ marginRight: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, backgroundColor: playlistType === 'local' ? theme['c-button-background-active'] : theme['c-button-background'] }}>
              <Text color={theme['c-button-font']}>本地歌单</Text>
            </Button>
            <Button onPress={() => handlePlaylistTypeChange('wy')} style={{ marginRight: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, backgroundColor: playlistType === 'wy' ? theme['c-button-background-active'] : theme['c-button-background'] }}>
              <Text color={theme['c-button-font']}>网易歌单</Text>
            </Button>
            <Button onPress={() => handlePlaylistTypeChange('tx')} style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 4, backgroundColor: playlistType === 'tx' ? theme['c-button-background-active'] : theme['c-button-background'] }}>
              <Text color={theme['c-button-font']}>QQ歌单</Text>
            </Button>
          </View>
          <List musicInfo={selectInfo.musicInfo} onPress={handleSelect} playlistType={playlistType} />
        </>
      ) : null}
    </Dialog>
  )
})
