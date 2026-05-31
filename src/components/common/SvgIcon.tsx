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
      d="M523.857 80.842c2.83 1.213 5.767 2.183 8.758 2.964 26.3 4.527 42.172 21.828 43.116 47.266 0.97 26.84-13.286 45.568-39.829 51.47a102.206 102.206 0 01-22.5 2.425c-72.22 0.27-144.385 0-216.577 0.35-77.285 0.404-113.664 35.032-114.149 112.101-0.997 153.68-0.485 307.362 0 461.043a171.503 171.503 0 007.168 48.155c12.8 42.9 48.856 64.862 104.987 65.077 87.93 0.324 175.886 0 263.815 0 64.054 0 128.108 0.216 192.215-0.161 13.474 0 26.894-1.348 40.098-4.042 46.377-10.24 74.105-44.544 74.914-93.67 0.835-59.903 0.188-119.834 0.485-179.82 0-9.781 0.97-19.536 2.856-29.13a48.667 48.667 0 0131.42-36.513 48.397 48.397 0 0147.294 8.515c7.841 6.549 14.82 14.12 22.177 21.262v81.731a120.994 120.994 0 00-2.614 16.923c-0.808 45.81-0.485 91.352-2.21 136.974-2.344 62.14-31.5 110.026-81.946 144.06-20.21 13.609-44.113 21.693-66.318 32.283H497.8a137.89 137.89 0 00-18.863-2.614c-75.911-0.485-151.849-0.43-227.76-1.32-14.416-0.162-29.776-1.132-42.9-6.279-63.272-24.71-104.232-70.332-121.21-136.758-1.993-7.707-4.149-15.36-6.224-23.067V257.401a21.18 21.18 0 002.64-5.659c14.148-86.231 71.923-147.294 156.62-165.187l10.94-2.156 21.989-3.557h250.826z"
      stroke={color}
      strokeWidth="28"
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
    />
    <Path
      d="M466.97 352.23l63.38 62.68c-4.877 5.227-9.755 10.886-15.144 16.357-42.146 42.496-84.076 84.992-126.734 126.949-14.767 14.497-17.812 29.992-10.886 48.828 13.716 37.269 38.534 63.65 75.183 78.821 25.761 10.672 37.133 8.408 56.859-11.371l127.65-128.243c3.826-3.853 7.113-8.192 9.242-10.644l65.482 65.832c-9.782 9.81-22.635 21.935-35.166 34.412-35.84 35.678-71.976 70.98-107.17 107.25-38.912 40.098-84.426 50.58-136.811 33.2-92.969-30.882-152.037-109.19-150.501-198.656a96.876 96.876 0 0128.483-68.985c111.762-83.965 274.05-84.35 386.048 0a97.246 97.246 0 0128.732 69.233c1.355 8.971 0.148 17.866-3.831 26.153l-86.637-87.75z"
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
