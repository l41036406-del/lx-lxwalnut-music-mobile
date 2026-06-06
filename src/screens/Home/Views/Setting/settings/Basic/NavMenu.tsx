import { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { StyleSheet, View, Text, Pressable, Animated, PanResponder, ScrollView } from 'react-native';
import SubTitle from '../../components/SubTitle';
import CheckBox from '@/components/common/CheckBox';
import { useSettingValue } from '@/store/setting/hook';
import { useI18n } from '@/lang';
import { updateSetting } from '@/core/common';
import { NAV_MENUS, NAV_ID_Type } from '@/config/constant';
import { useTheme } from '@/store/theme/hook';
import { Icon } from '@/components/common/Icon';

const CANNOT_CLOSE_ITEMS: NAV_ID_Type[] = ['nav_setting'];
const LONG_PRESS_MS = 350;
const DRAG_CANCEL_THRESHOLD = 6;

interface MenuItemData {
  id: NAV_ID_Type;
  name: string;
}

interface ListItemProps {
  item: MenuItemData;
  index: number;
  isChecked: boolean;
  isDragging: boolean;
  isDragSource: boolean;
  translateY: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
  zIndex: number;
  onLayoutHeight: (index: number, height: number) => void;
  onLongPressStart: (index: number) => void;
  onDragMove: (dy: number) => void;
  onDragRelease: () => void;
  onDragCancel: () => void;
  onToggle: (id: NAV_ID_Type, check: boolean) => void;
  dragHandleHint: string;
}

interface DragAnim {
  translateY: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
}

const createAnim = (): DragAnim => ({
  translateY: new Animated.Value(0),
  scale: new Animated.Value(1),
  opacity: new Animated.Value(1),
});

const MenuItem = memo(({
  item,
  index,
  isChecked,
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
  onToggle,
  dragHandleHint,
}: ListItemProps) => {
  const theme = useTheme();
  const t = useI18n();
  const cannotClose = CANNOT_CLOSE_ITEMS.includes(item.id);
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
        onStartShouldSetPanResponder: () => true,
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
    [index, onLongPressStart, onDragMove, onDragRelease, onDragCancel]
  );

  const transform = isDragSource
    ? [{ translateY }, { scale }]
    : [{ translateY }];
  const elevation = isDragSource ? 8 : 0;
  const shadowOpacity = isDragSource ? 0.25 : 0;

  return (
    <Animated.View
      onLayout={(e) => onLayoutHeight(index, e.nativeEvent.layout.height)}
      style={[
        styles.menuItem,
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
        },
      ]}
    >
      <View style={styles.menuInfo}>
        <View style={styles.dragHandle} {...panResponder.panHandlers}>
          <Icon name="menu" color={theme['c-font-label']} size={16} />
        </View>
        <Text style={[styles.menuName, { color: theme['c-font'] }]}>{item.name}</Text>
        <CheckBox
          check={isChecked}
          label=""
          disabled={cannotClose}
          onChange={(check) => onToggle(item.id, check)}
        />
      </View>
      {isDragSource ? (
        <Text size={11} color={theme['c-font-label']} style={styles.dragHint}>
          {dragHandleHint}
        </Text>
      ) : null}
    </Animated.View>
  );
});

export default memo(() => {
  const t = useI18n();
  const theme = useTheme();
  const navStatus = useSettingValue('common.navStatus');
  const navOrder = useSettingValue('common.navOrder');

  const [localOrder, setLocalOrder] = useState<NAV_ID_Type[]>(() => {
    return navOrder || NAV_MENUS.map(m => m.id);
  });

  const heightsRef = useRef<number[]>([]);
  const animsRef = useRef<DragAnim[]>([]);
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null);
  const draggingIndexRef = useRef<number | null>(null);
  const targetIndexRef = useRef<number | null>(null);
  const lastTargetRef = useRef<number | null>(null);

  const menuList = useMemo(() => {
    const filtered = localOrder.filter(id => id !== 'nav_play_history');
    return filtered.map((id, idx) => {
      const menuItem = NAV_MENUS.find(m => m.id === id);
      return {
        id,
        name: t(id),
        index: idx,
      };
    });
  }, [localOrder, t]);

  if (animsRef.current.length !== menuList.length) {
    if (animsRef.current.length < menuList.length) {
      for (let i = animsRef.current.length; i < menuList.length; i++) {
        animsRef.current.push(createAnim());
      }
    } else {
      animsRef.current.length = menuList.length;
    }
    heightsRef.current.length = menuList.length;
  }

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
    Animated.parallel([
      Animated.spring(anim.scale, { toValue: 1.03, useNativeDriver: true, friction: 7 }),
      Animated.timing(anim.opacity, { toValue: 0.92, duration: 120, useNativeDriver: true }),
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
      Animated.spring(anim.translateY, {
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

  const handleToggle = useCallback((id: NAV_ID_Type, check: boolean) => {
    updateSetting({ 'common.navStatus': { ...navStatus, [id]: check } });
  }, [navStatus]);

  const persistReorder = useCallback((from: number, to: number) => {
    if (from === to) return;
    const filtered = localOrder.filter(id => id !== 'nav_play_history');
    const next = [...filtered];
    const [moved] = next.splice(from, 1);
    if (!moved) return;
    next.splice(to, 0, moved);
    
    const navPlayHistoryIndex = localOrder.indexOf('nav_play_history');
    if (navPlayHistoryIndex !== -1) {
      next.splice(navPlayHistoryIndex, 0, 'nav_play_history');
    }
    
    setLocalOrder(next);
    updateSetting({ 'common.navOrder': next });
  }, [localOrder]);

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

  const reorderHint = t('setting_basic_nav_menu_reorder_tip');

  return (
    <SubTitle title={t('setting_basic_nav_menu')}>
      <View style={styles.container}>
        <ScrollView
          style={styles.scrollView}
          keyboardShouldPersistTaps={'always'}
          scrollEnabled={draggingIndex == null}
        >
          <View style={{
            overflow: 'hidden',
            borderRadius: 8,
            backgroundColor: 'transparent',
          }}>
            <View style={styles.menuList}>
              {menuList.map((item, idx) => {
                const anim = animsRef.current[idx] ?? createAnim();
                const isDragSource = draggingIndex === idx;
                return (
                  <MenuItem
                    key={item.id}
                    item={item}
                    index={idx}
                    isChecked={navStatus[item.id] ?? true}
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
                    onToggle={handleToggle}
                    dragHandleHint={reorderHint}
                  />
                );
              })}
            </View>
          </View>
        </ScrollView>
      </View>
    </SubTitle>
  );
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  menuList: {
    overflow: 'hidden',
  },
  menuItem: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(128, 128, 128, 0.2)',
    borderRadius: 8,
  },
  menuInfo: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menuName: {
    fontSize: 16,
    flex: 1,
    paddingLeft: 10,
  },
  dragHandle: {
    paddingHorizontal: 6,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dragHint: {
    marginTop: 2,
    textAlign: 'center',
  },
});
