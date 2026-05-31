import { memo } from 'react'
import Svg, { Path, Rect, Line, Circle } from 'react-native-svg'
import { scaleSizeW } from '@/utils/pixelRatio'

interface SvgIconProps {
  name: string
  size?: number
  rawSize?: number
  color?: string
}

/**
 * 日历图标 - 用于每日推荐
 * 参考网易云音乐每日推荐的日历样式
 */
const CalendarIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* 日历主体 */}
    <Rect x="2" y="3" width="20" height="19" rx="2" ry="2" stroke={color} strokeWidth="1.6" fill="none" />
    {/* 顶部横线（日历头部） */}
    <Line x1="2" y1="8" x2="22" y2="8" stroke={color} strokeWidth="1.6" />
    {/* 左侧挂钩 */}
    <Line x1="7" y1="1" x2="7" y2="5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    {/* 右侧挂钩 */}
    <Line x1="17" y1="1" x2="17" y2="5" stroke={color} strokeWidth="1.6" strokeLinecap="round" />
    {/* 日期点 - 2x3 布局 */}
    <Circle cx="7" cy="12.5" r="1.2" fill={color} />
    <Circle cx="12" cy="12.5" r="1.2" fill={color} />
    <Circle cx="17" cy="12.5" r="1.2" fill={color} />
    <Circle cx="7" cy="17" r="1.2" fill={color} />
    <Circle cx="12" cy="17" r="1.2" fill={color} />
    <Circle cx="17" cy="17" r="1.2" fill={color} />
  </Svg>
)

/**
 * 用户图标 - 用于关注的歌手
 * 简洁的用户轮廓图标
 */
const ArtistIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* 头部 */}
    <Circle cx="12" cy="8.5" r="4.5" stroke={color} strokeWidth="1.6" fill="none" />
    {/* 身体 */}
    <Path
      d="M3.5 22c0-4.694 3.806-8.5 8.5-8.5s8.5 3.806 8.5 8.5"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      fill="none"
    />
  </Svg>
)

/**
 * 专辑/唱片图标 - 用于收藏的专辑
 * 参考网易云音乐收藏专辑的黑胶唱片样式
 */
const AlbumDiscIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    {/* 外圈 */}
    <Circle cx="12" cy="12" r="11" stroke={color} strokeWidth="1.6" fill="none" />
    {/* 内圈（唱片中心孔） */}
    <Circle cx="12" cy="12" r="3" stroke={color} strokeWidth="1.6" fill="none" />
    {/* 中心点 */}
    <Circle cx="12" cy="12" r="1" fill={color} />
  </Svg>
)

const OneDriveIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
    <Path
      d="M6.6 19.35h11.2c2.62 0 4.7-2.04 4.7-4.62 0-2.24-1.6-4.11-3.72-4.52-.65-2.98-3.09-5.21-5.97-5.21-2.4 0-4.58 1.55-5.58 3.96a5.26 5.26 0 0 0-1.55-.24C3.05 8.72.9 11 .9 13.79c0 3.11 2.33 5.56 5.7 5.56z"
      stroke={color}
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
)

const HeartbeatIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 1165 1024" fill="none">
    <Path
      d="M582.103 1023.979c-0.017 0-0.037 0-0.057 0-9.91 0-19.135-2.929-26.858-7.969l0.189 0.116-0.366-0.236c-37.014-20.47-322.334-182.265-474.13-387.408-50.491-68.21-80.819-154.003-80.819-246.879 0-19.704 1.365-39.089 4.006-58.067l-0.25 2.192c14.344-104.705 67.037-196.32 148.366-258.045 92.559-70.283 201.609-86.225 315.345-45.86 43.791 16.083 81.683 36.31 116.21 60.947l-1.48-1.003c33.048-23.634 70.939-43.86 111.372-58.853l3.359-1.091c113.788-40.337 222.838-24.422 315.37 45.86 81.33 61.829 134.022 153.471 148.366 258.045 2.401 16.818 3.771 36.242 3.771 55.986 0 92.851-30.314 178.622-81.584 247.955l0.802-1.136c-152.712 206.19-440.415 368.797-474.783 387.643-7.598 4.895-16.869 7.819-26.821 7.853h-0.009zM347.59 105.694c-43.425 0-89.994 12.46-135.593 47.117-59.054 44.892-97.349 111.588-107.794 187.813-1.757 12.365-2.76 26.646-2.76 41.16 0 68.639 22.431 132.040 60.363 183.271l-0.591-0.835c123.421 166.664 348.143 304.769 421.071 347.018 73.005-42.169 297.65-180.354 421.071-347.018 37.342-50.393 59.773-113.792 59.773-182.429 0-14.517-1.004-28.801-2.945-42.783l0.184 1.616c-10.471-76.199-48.74-142.895-107.82-187.813-159.125-120.933-330.108 28.27-337.384 34.684-8.691 7.859-20.268 12.668-32.969 12.668s-24.278-4.809-33.012-12.706l0.043 0.038c-5.052-4.555-93.553-81.801-201.634-81.801z"
      fill={color}
      stroke={color}
    />
    <Path
      d="M380 430 L 480 300 L 680 530 L 780 400"
      stroke={color}
      strokeWidth="70"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
)

const WebDAVIcon = ({ size, color }: { size: number; color: string }) => (
  <Svg width={size} height={size} viewBox="0 0 1024 1024" fill="none">
    <Path
      d="M281.856 473.664a63.68 63.68 0 0 1-29.888 16.512 161.6 161.6 0 0 0 37.568 318.656c1.728 0 3.392 0 5.12 0.192a63.552 63.552 0 0 1 16.576 0.768l0.832 0.064 13.184 0.64c11.968 0.32 28.416 0.512 48.256 0.64 39.552 0.32 90.88 0.128 142.592-0.256a41526.784 41526.784 0 0 0 218.368-2.048 161.536 161.536 0 0 0 37.568-318.656 64 64 0 0 1-48.448-52.672 64 64 0 0 1-1.92-15.68 206.592 206.592 0 1 0-413.248 0 63.936 63.936 0 0 1-26.56 51.84z m565.248-93.12a289.536 289.536 0 0 1-112.64 556.288l-37.952 0.384h-0.128c-41.152 0.448-109.76 1.216-179.392 1.664-51.84 0.384-103.872 0.512-144.32 0.256a2339.84 2339.84 0 0 1-51.2-0.768 507.392 507.392 0 0 1-17.92-0.768h-0.448a123.2 123.2 0 0 1-9.28-0.896 289.536 289.536 0 0 1-110.592-558.72 334.72 334.72 0 0 1 663.872 2.56z m-537.6 429.12z"
      stroke={color}
      strokeWidth="28"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
  </Svg>
)

export const SvgIcon = memo(({ name, size = 15, rawSize, color = '#000' }: SvgIconProps) => {
  const finalSize = rawSize ?? scaleSizeW(size)

  switch (name) {
    case 'calendar':
      return <CalendarIcon size={finalSize} color={color} />
    case 'artist':
      return <ArtistIcon size={finalSize} color={color} />
    case 'album-disc':
      return <AlbumDiscIcon size={finalSize} color={color} />
    case 'onedrive':
      return <OneDriveIcon size={finalSize} color={color} />
    case 'heartbeat':
      return <HeartbeatIcon size={finalSize} color={color} />
    case 'webdav':
      return <WebDAVIcon size={finalSize} color={color} />
    default:
      return null
  }
})

export {}
