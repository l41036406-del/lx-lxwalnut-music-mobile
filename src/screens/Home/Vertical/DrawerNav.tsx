import { memo, useMemo, useRef, useCallback, useEffect, useState } from 'react'
import { ScrollView, TouchableOpacity, View, Animated, PanResponder } from 'react-native'
import { useI18n } from '@/lang'
import { useNavActiveId, useStatusbarHeight } from '@/store/common/hook'
import { useTheme } from '@/store/theme/hook'
import { Icon } from '@/components/common/Icon'
import { SvgIcon } from '@/components/common/SvgIcon'
import { confirmDialog, createStyle, exitApp as backHome } from '@/utils/tools'
import { NAV_MENUS, LIST_IDS } from '@/config/constant'
import type { InitState } from '@/store/common/state'
import { exitApp, setNavActiveId } from '@/core/common'
import Text from '@/components/common/Text'
import { useSettingValue } from '@/store/setting/hook'
import React from 'react'
import { Animated as AnimatedType, Easing } from 'react-native'
import { useMyList } from '@/store/list/hook'
import { setActiveList, updateUserListPosition } from '@/core/list'
import { navigations } from "@/navigation"
import commonState from '@/store/common/state'

const LONG_PRESS_MS = 350;
const DRAG_CANCEL_THRESHOLD = 6;

interface DragAnim {
  translateY: AnimatedType.Value;
  scale: AnimatedType.Value;
  opacity: AnimatedType.Value;
}

const createAnim = (): DragAnim => ({
  translateY: new AnimatedType.Value(0),
  scale: new AnimatedType.Value(1),
  opacity: new AnimatedType.Value(1),
});

interface DraggableListItemProps {
  item: LX.List.MyListInfo;
  index: number;
  isDragging: boolean;
  isDragSource: boolean;
  translateY: AnimatedType.Value;
  scale: AnimatedType.Value;
  opacity: AnimatedType.Value;
  zIndex: number;
  onLayoutHeight: (index: number, height: number) => void;
  onLongPressStart: (index: number) => void;
  onDragMove: (dy: number) => void;
  onDragRelease: () => void;
  onDragCancel: () => void;
  onPress: () => void;
}

const DraggableListItem = memo(({
  item,
  index,
  isDragging,
  isDragSource,
  translateY,
  scale,
  opacity,
  zIndex,
  onLayoutHeight,
  onLongPressStart,
  onDragMove,
  onDragRelease,
  onDragCancel,
  onPress,
}: DraggableListItemProps) => {
  const theme = useTheme();
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isActivatedRef = useRef(false);

  const clearLongPressTimer = () => {
    if (longPressTimer.current != null) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
    };
  }, []);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onStartShouldSetPanResponderCapture: () => true,
        onMoveShouldSetPanResponder: (_e, gs) => {
          if (!isActivatedRef.current) return false;
          return Math.abs(gs.dy) > 1 || Math.abs(gs.dx) > 1;
        },
        onMoveShouldSetPanResponderCapture: (_e, gs) => {
          if (!isActivatedRef.current) return false;
          return Math.abs(gs.dy) > 2;
        },
        onPanResponderGrant: () => {
          clearLongPressTimer();
          isActivatedRef.current = false;
          longPressTimer.current = setTimeout(() => {
            longPressTimer.current = null;
            isActivatedRef.current = true;
            onLongPressStart(index);
          }, LONG_PRESS_MS);
        },
        onPanResponderMove: (_e, gs) => {
          if (!isActivatedRef.current) {
            if (
              Math.abs(gs.dy) > DRAG_CANCEL_THRESHOLD ||
              Math.abs(gs.dx) > DRAG_CANCEL_THRESHOLD
            ) {
              clearLongPressTimer();
            }
            return;
          }
          onDragMove(gs.dy);
        },
        onPanResponderRelease: () => {
          clearLongPressTimer();
          if (isActivatedRef.current) {
            isActivatedRef.current = false;
            onDragRelease();
          } else {
            onPress();
          }
        },
        onPanResponderTerminate: () => {
          clearLongPressTimer();
          if (isActivatedRef.current) {
            isActivatedRef.current = false;
            onDragCancel();
          }
        },
        onPanResponderTerminationRequest: () => !isActivatedRef.current,
      }),
    [index, onLongPressStart, onDragMove, onDragRelease, onDragCancel, onPress]
  );

  const transform = isDragSource
    ? [{ translateY }, { scale }]
    : [{ translateY }];
  const elevation = isDragSource ? 8 : 0;
  const shadowOpacity = isDragSource ? 0.25 : 0;

  return (
    <AnimatedType.View
      onLayout={(e) => onLayoutHeight(index, e.nativeEvent.layout.height)}
      style={[
        styles.subMenuItem,
        {
          backgroundColor: isDragSource ? theme['c-primary-background-active'] : 'transparent',
          opacity,
          transform,
          zIndex,
          elevation,
          shadowOpacity,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowRadius: 4,
          borderRadius: 8,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
        <View style={styles.dragHandle} {...panResponder.panHandlers}>
          <Icon name="menu" color={theme['c-font-label']} size={14} />
        </View>
        <Text size={14} color={theme['c-font-label']} numberOfLines={1}>
          {item.name}
        </Text>
      </View>
    </AnimatedType.View>
  );
});

const CollapsibleMyListItem = () => {
  const t = useI18n();
  const theme = useTheme();
  const allList = useMyList();
  const [isExpanded, setExpanded] = useState(false);
  const animation = useRef(new AnimatedType.Value(0)).current;
  const contentHeight = useRef(0);

  const heightsRef = useRef<number[]>([]);
  const animsRef = useRef<DragAnim[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const draggingIndexRef = useRef<number | null>(null);
  const targetIndexRef = useRef<number | null>(null);
  const lastTargetRef = useRef<number | null>(null);

  if (animsRef.current.length !== allList.length) {
    if (animsRef.current.length < allList.length) {
      for (let i = animsRef.current.length; i < allList.length; i++) {
        animsRef.current.push(createAnim());
      }
    } else {
      animsRef.current.length = allList.length;
    }
    heightsRef.current.length = allList.length;
  }

  const toggleCollapse = () => {
    const toValue = isExpanded ? 0 : 1;
    AnimatedType.timing(animation, {
      toValue,
      duration: 300,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: false,
    }).start();
    setExpanded(!isExpanded);
  };

  const handleSelect = useCallback((listId: string) => {
    setNavActiveId('nav_love');
    setActiveList(listId);
    global.app_event.changeMenuVisible(false);
  }, []);

  const handleLayoutHeight = useCallback((index: number, height: number) => {
    heightsRef.current[index] = height;
  }, []);

  const resetAllAnims = useCallback(() => {
    for (const anim of animsRef.current) {
      anim.translateY.stopAnimation();
      anim.scale.stopAnimation();
      anim.opacity.stopAnimation();
      anim.translateY.setValue(0);
      anim.scale.setValue(1);
      anim.opacity.setValue(1);
    }
  }, []);

  const handleLongPressStart = useCallback((index: number) => {
    draggingIndexRef.current = index;
    targetIndexRef.current = index;
    lastTargetRef.current = index;
    setDraggingIndex(index);
    const anim = animsRef.current[index];
    if (!anim) return;
    AnimatedType.parallel([
      AnimatedType.spring(anim.scale, { toValue: 1.03, useNativeDriver: true, friction: 7 }),
      AnimatedType.timing(anim.opacity, { toValue: 0.92, duration: 120, useNativeDriver: true }),
    ]).start();
  }, []);

  const computeTargetIndex = useCallback((from: number, dy: number) => {
    const heights = heightsRef.current;
    const n = heights.length;
    if (n === 0) return from;

    const cumulative: number[] = [];
    let acc = 0;
    for (let i = 0; i < n; i++) {
      cumulative.push(acc);
      acc += heights[i] ?? 0;
    }
    const draggedHeight = heights[from] ?? 0;
    const originalTop = cumulative[from] ?? 0;
    const newCenter = originalTop + dy + draggedHeight / 2;

    let target = from;
    let minDist = Infinity;
    for (let i = 0; i < n; i++) {
      const itemCenter = (cumulative[i] ?? 0) + (heights[i] ?? 0) / 2;
      const dist = Math.abs(itemCenter - newCenter);
      if (dist < minDist) {
        minDist = dist;
        target = i;
      }
    }
    return target;
  }, []);

  const animateLayout = useCallback((from: number, to: number) => {
    const heights = heightsRef.current;
    const draggedHeight = heights[from] ?? 0;
    for (let i = 0; i < animsRef.current.length; i++) {
      if (i === from) continue;
      const anim = animsRef.current[i];
      let target = 0;
      if (from < to) {
        if (i > from && i <= to) target = -draggedHeight;
      } else if (from > to) {
        if (i >= to && i < from) target = draggedHeight;
      }
      AnimatedType.spring(anim.translateY, {
        toValue: target,
        useNativeDriver: true,
        friction: 9,
        tension: 70,
      }).start();
    }
  }, []);

  const handleDragMove = useCallback(
    (dy: number) => {
      const from = draggingIndexRef.current;
      if (from == null) return;
      const anim = animsRef.current[from];
      if (anim) anim.translateY.setValue(dy);
      const target = computeTargetIndex(from, dy);
      targetIndexRef.current = target;
      if (target !== lastTargetRef.current) {
        lastTargetRef.current = target;
        animateLayout(from, target);
      }
    },
    [computeTargetIndex, animateLayout]
  );

  const persistReorder = useCallback((from: number, to: number) => {
    if (from === to) return;
    const next = [...allList];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    const ids = next.map(item => item.id);
    void updateUserListPosition(ids);
  }, [allList]);

  const handleDragRelease = useCallback(() => {
    const from = draggingIndexRef.current;
    const to = targetIndexRef.current ?? from;
    draggingIndexRef.current = null;
    targetIndexRef.current = null;
    lastTargetRef.current = null;
    setDraggingIndex(null);
    if (from == null) return;
    resetAllAnims();
    if (to != null && to !== from) {
      persistReorder(from, to);
    }
  }, [persistReorder, resetAllAnims]);

  const handleDragCancel = useCallback(() => {
    draggingIndexRef.current = null;
    targetIndexRef.current = null;
    lastTargetRef.current = null;
    setDraggingIndex(null);
    resetAllAnims();
  }, [resetAllAnims]);

  const animatedHeight = animation.interpolate({
    inputRange: [0, 1],
    outputRange: [0, contentHeight.current],
  });

  const animatedOpacity = animation.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View>
      <TouchableOpacity style={styles.menuItem} onPress={toggleCollapse}>
        <View style={styles.iconContent}>
          <Icon name="love" size={20} color={theme['c-font-label']} />
        </View>
        <Text style={styles.text}>{t('nav_love')}</Text>
      </TouchableOpacity>

      <AnimatedType.View style={{ height: animatedHeight, opacity: animatedOpacity, overflow: 'hidden' }}>
        <View
          onLayout={(event) => {
            contentHeight.current = event.nativeEvent.layout.height;
          }}
          style={{ position: 'absolute', width: '100%' }}
        >
          {allList.map((list, index) => {
            const anim = animsRef.current[index] ?? createAnim();
            const isDragSource = draggingIndex === index;
            return (
              <DraggableListItem
                key={list.id}
                item={list}
                index={index}
                isDragging={draggingIndex != null}
                isDragSource={isDragSource}
                translateY={anim.translateY}
                scale={anim.scale}
                opacity={anim.opacity}
                zIndex={isDragSource ? 10 : 1}
                onLayoutHeight={handleLayoutHeight}
                onLongPressStart={handleLongPressStart}
                onDragMove={handleDragMove}
                onDragRelease={handleDragRelease}
                onDragCancel={handleDragCancel}
                onPress={() => handleSelect(list.id)}
              />
            );
          })}
        </View>
      </AnimatedType.View>
    </View>
  );
};

const styles = createStyle({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 40,
    paddingBottom: 50,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerText: {
    textAlign: 'center',
    marginLeft: 16,
  },
  menus: {
    flex: 1,
  },
  subMenuItem: {
    paddingVertical: 12,
    paddingLeft: 55,
    paddingRight: 10,
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  collapsibleMenuItemText: {
    flex: 1,
    paddingLeft: 20,
  },
  list: {
    paddingTop: 10,
    paddingBottom: 10,
  },
  menuItem: {
    flexDirection: 'row',
    paddingTop: 13,
    paddingBottom: 13,
    paddingLeft: 25,
    paddingRight: 25,
    alignItems: 'center',
  },
  iconContent: {
    width: 24,
    alignItems: 'center',
  },
  text: {
    paddingLeft: 20,
  },
  footer: {
    paddingVertical: 5,
    paddingHorizontal: 15,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  footerBtn: {
    padding: 10,
  },
  dragHandle: {
    paddingHorizontal: 6,
    paddingVertical: 4,
    marginRight: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
})

const Header = () => {
  const theme = useTheme()
  const statusBarHeight = useStatusbarHeight()
  return (
    <View
      style={{
        paddingTop: statusBarHeight,
        backgroundColor: theme['c-primary-light-700-alpha-500'],
      }}
    >
      <View style={styles.header}>
        <Icon name="logo" color={theme['c-primary-dark-100-alpha-300']} size={28} />
        <Text style={styles.headerText} size={28} color={theme['c-primary-dark-100-alpha-300']}>
          LX-N Music
        </Text>
      </View>
    </View>
  )
}

type IdType = InitState['navActiveId'] | 'nav_exit' | 'back_home'

const renderIcon = (icon: string, size: number, color: string) => {
  if (icon.startsWith('svg:')) {
    return <SvgIcon name={icon.slice(4)} size={size} color={color} />
  }
  return <Icon name={icon} size={size} color={color} />
}

const MenuItem = ({
  id,
  icon,
  onPress,
}: {
  id: IdType
  icon: string
  onPress: (id: IdType) => void
}) => {
  const t = useI18n()
  const activeId = useNavActiveId()
  const theme = useTheme()

  return activeId == id ? (
    <View style={{ ...styles.menuItem, backgroundColor: theme['c-primary-background-hover'] }}>
      <View style={styles.iconContent}>
        {renderIcon(icon, 20, theme['c-primary-font-active'])}
      </View>
      <Text style={styles.text} color={theme['c-primary-font']}>
        {t(id)}
      </Text>
    </View>
  ) : (
    <TouchableOpacity
      style={styles.menuItem}
      onPress={() => {
        onPress(id)
      }}
    >
      <View style={styles.iconContent}>
        {renderIcon(icon, 20, theme['c-font-label'])}
      </View>
      <Text style={styles.text}>{t(id)}</Text>
    </TouchableOpacity>
  )
}

export default memo(() => {
  const theme = useTheme()
  const showBackBtn = useSettingValue('common.showBackBtn')
  const showExitBtn = useSettingValue('common.showExitBtn')
  const navStatus = useSettingValue('common.navStatus');
  const navOrder = useSettingValue('common.navOrder');
  const isShowMyListSubMenu = useSettingValue('list.isShowMyListSubMenu');

  const handlePress = (id: IdType) => {
    switch (id) {
      case 'nav_exit':
        void confirmDialog({
          message: global.i18n.t('exit_app_tip'),
          confirmButtonText: global.i18n.t('list_remove_tip_button'),
        }).then((isExit) => {
          if (!isExit) return
          exitApp('Exit Btn')
        })
        return
      case 'back_home':
        backHome()
        return
    }
    global.app_event.changeMenuVisible(false)
    setNavActiveId(id as any)
  }

  const handleDownloadPress = () => {
    global.app_event.changeMenuVisible(false);
    navigations.pushDownloadManagerScreen(commonState.componentIds[commonState.componentIds.length - 1]?.id!);
  };
  const handleHistoryPress = () => {
    global.app_event.changeMenuVisible(false);
    setNavActiveId('nav_play_history');
  };
  const filteredNavMenus = useMemo(() => {
    if (!navOrder) return NAV_MENUS.filter(
      menu => menu.id !== 'nav_play_history' && (menu.id === 'nav_setting' || (navStatus[menu.id] ?? true))
    );

    return navOrder
      .filter(id => id !== 'nav_play_history')
      .map(id => NAV_MENUS.find(menu => menu.id === id))
      .filter((menu): menu is typeof NAV_MENUS[number] => menu !== undefined && (menu.id === 'nav_setting' || (navStatus[menu.id] ?? true)));
  }, [navStatus, navOrder]);

  return (
    <View style={{ ...styles.container, backgroundColor: theme['c-content-background'] }}>
      <Header />
      <ScrollView style={styles.menus}>
        <View style={styles.list}>
          {filteredNavMenus.map((menu) => {
            if (menu.id === 'nav_love') {
              return isShowMyListSubMenu
                ? <CollapsibleMyListItem key={menu.id} />
                : <MenuItem key={menu.id} id={menu.id} icon={menu.icon} onPress={handlePress} />;
            }
            return <MenuItem key={menu.id} id={menu.id} icon={menu.icon} onPress={handlePress} />;
          })}
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerBtn} onPress={handleHistoryPress}>
          <Icon name="music_time" size={25} color={theme['c-font-label']} />
        </TouchableOpacity>
        <TouchableOpacity style={styles.footerBtn} onPress={handleDownloadPress}>
          <Icon name="download-2" size={22} color={theme['c-font-label']} />
        </TouchableOpacity>
      </View>

      {global.lx.isCarMode && showBackBtn ? <MenuItem id="back_home" icon="home" onPress={handlePress} /> : null}
      {global.lx.isCarMode && showExitBtn ? <MenuItem id="nav_exit" icon="exit2" onPress={handlePress} /> : null}
    </View>
  )
})
