package com.lxwalnut.music.mobile.recognition;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.PixelFormat;
import android.graphics.Outline;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewOutlineProvider;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.core.content.ContextCompat;

import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.PermissionAwareActivity;
import com.facebook.react.modules.core.PermissionListener;
import com.facebook.react.modules.core.DeviceEventManagerModule;

import java.io.ByteArrayOutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

import org.json.JSONArray;
import org.json.JSONObject;

public class MusicRecognitionModule extends ReactContextBaseJavaModule implements PermissionListener {
    private static final String TAG = "MusicRecognition";
    private static final int PERMISSION_REQUEST_CODE = 1001;
    private static final int SAMPLE_RATE = 8000;
    private static final int CHANNEL_CONFIG = AudioFormat.CHANNEL_IN_MONO;
    private static final int AUDIO_FORMAT = AudioFormat.ENCODING_PCM_16BIT;
    private static final int RECORD_DURATION_SECONDS = 10;

    private final ReactApplicationContext reactContext;
    private final Handler mainHandler;
    private AudioRecord audioRecord;
    private volatile boolean isRecording = false;
    private WindowManager windowManager;
    private View floatingContainer;
    private LinearLayout expandedPanel;
    private TextView statusTextView;
    private LinearLayout resultsContainer;
    private View logoButtonView;
    private boolean isExpanded = false;
    private String lastWavPath = null;
    private boolean logoHidden = false;
    private Runnable autoHideRunnable = null;
    private static final int AUTO_HIDE_DELAY_MS = 10000;
    private static final int WIDGET_WIDTH = 120;
    private static final int PANEL_WIDTH = 760;
    private int snappedEdge = 0;           // 0=none, 1=LEFT, 2=RIGHT
    private static final int LEFT_EDGE = 1;
    private static final int RIGHT_EDGE = 2;
    private boolean logoWasHiddenAtTouchDown = false;

    public MusicRecognitionModule(ReactApplicationContext reactContext) {
        super(reactContext);
        this.reactContext = reactContext;
        this.mainHandler = new Handler(Looper.getMainLooper());
    }

    private int getScreenWidth() {
        return reactContext.getResources().getDisplayMetrics().widthPixels;
    }

    private void resetAutoHideTimer() {
        if (autoHideRunnable != null) {
            mainHandler.removeCallbacks(autoHideRunnable);
            logToJS("自动隐藏计时器已重置");
        }
        if (!isExpanded && !isRecording) {
            autoHideRunnable = () -> hideLogoButton();
            mainHandler.postDelayed(autoHideRunnable, AUTO_HIDE_DELAY_MS);
            logToJS("自动隐藏计时器已启动，" + (AUTO_HIDE_DELAY_MS / 1000) + "秒后执行");
        } else {
            logToJS("跳过自动隐藏计时（isExpanded=" + isExpanded + ", isRecording=" + isRecording + "）");
        }
    }

    /**
     * 10-second auto-hide: snap half the widget off the nearest screen edge.
     * Uses params.x (real window position) — NOT translationX.
     * Requires FLAG_LAYOUT_NO_LIMITS for off-screen rendering.
     */
    private void hideLogoButton() {
        if (logoButtonView == null || windowManager == null || floatingContainer == null || logoHidden) return;
        logoHidden = true;
        logToJS("悬浮按钮自动隐藏：滑出一半 + 半透明");

        logoButtonView.post(() -> {
            if (!logoHidden || logoButtonView.getWidth() == 0) return;

            WindowManager.LayoutParams params = (WindowManager.LayoutParams) floatingContainer.getLayoutParams();
            int widgetWidth = logoButtonView.getWidth();
            int halfWidget = widgetWidth / 2;
            int screenWidth = getScreenWidth();
            int currentX = params.x;

            // Decide which edge is closer
            int leftEdgeTarget = -halfWidget;
            int rightEdgeTarget = screenWidth - halfWidget;
            int distToLeft = Math.abs(currentX - leftEdgeTarget);
            int distToRight = Math.abs(currentX - rightEdgeTarget);
            int targetX = (distToLeft <= distToRight) ? leftEdgeTarget : rightEdgeTarget;
            snappedEdge = (distToRight <= distToLeft) ? RIGHT_EDGE : LEFT_EDGE;

            final int startX = currentX;
            final int delta = targetX - startX;

            android.animation.ValueAnimator animator = android.animation.ValueAnimator.ofInt(0, 1000);
            animator.setDuration(300);
            animator.setInterpolator(new android.view.animation.DecelerateInterpolator());
            animator.addUpdateListener(animation -> {
                float fraction = animation.getAnimatedFraction();
                params.x = startX + (int) (delta * fraction);
                try {
                    windowManager.updateViewLayout(floatingContainer, params);
                } catch (Exception e) {
                    Log.e(TAG, "Hide animation failed", e);
                }
            });
            animator.start();

            logoButtonView.animate()
                .alpha(0.5f)
                .setDuration(300)
                .start();
        });
    }

    /**
     * Restore the widget to fully visible position at the snapped edge.
     * Left:  params.x = 0
     * Right: params.x = screenWidth - widgetWidth
     * Optionally runs onComplete after animation finishes (for click-to-expand).
     */
    private void showLogoButton() {
        showLogoButton(null);
    }

    private void showLogoButton(Runnable onComplete) {
        if (logoButtonView == null || windowManager == null || floatingContainer == null) return;
        logoHidden = false;
        logToJS("悬浮按钮恢复显示：滑回安全边缘 + 全透明");

        WindowManager.LayoutParams params = (WindowManager.LayoutParams) floatingContainer.getLayoutParams();
        int screenWidth = getScreenWidth();
        int widgetWidth = logoButtonView.getWidth();

        // Target: fully visible edge (NOT half-off)
        int targetX = (snappedEdge == RIGHT_EDGE)
            ? (screenWidth - widgetWidth)
            : 0;

        final int startX = params.x;
        final int delta = targetX - startX;

        if (delta == 0) {
            logoButtonView.setAlpha(1.0f);
            if (onComplete != null) onComplete.run();
            return;
        }

        android.animation.ValueAnimator animator = android.animation.ValueAnimator.ofInt(0, 1000);
        animator.setDuration(300);
        animator.setInterpolator(new android.view.animation.DecelerateInterpolator());
        animator.addUpdateListener(animation -> {
            float fraction = animation.getAnimatedFraction();
            params.x = startX + (int) (delta * fraction);
            try {
                windowManager.updateViewLayout(floatingContainer, params);
            } catch (Exception e) {
                Log.e(TAG, "Restore animation failed", e);
            }
        });

        if (onComplete != null) {
            animator.addListener(new android.animation.AnimatorListenerAdapter() {
                @Override
                public void onAnimationEnd(android.animation.Animator animation) {
                    onComplete.run();
                }
            });
        }

        animator.start();

        logoButtonView.animate()
            .alpha(1.0f)
            .setDuration(300)
            .start();
    }

    @Override
    public String getName() {
        return "MusicRecognitionModule";
    }

    private void log(String msg) {
        Log.i(TAG, msg);
    }

    private void logToJS(String msg) {
        Log.i(TAG, msg);
        mainHandler.post(() -> {
            try {
                WritableMap params = Arguments.createMap();
                params.putString("type", "log");
                params.putString("message", msg);
                reactContext
                        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                        .emit("MusicRecognitionEvent", params);
            } catch (Exception e) {
                Log.e(TAG, "sendEvent failed", e);
            }
        });
    }

    @ReactMethod
    public void checkOverlayPermission(Promise promise) {
        log("检查悬浮窗权限...");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
            log("悬浮窗权限未授予");
            promise.reject("PERMISSION_DENIED", "Overlay permission not granted");
        } else {
            log("悬浮窗权限已授予");
            promise.resolve(true);
        }
    }

    @ReactMethod
    public void openOverlayPermissionActivity(Promise promise) {
        log("打开悬浮窗权限设置...");
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
                Intent intent = new Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
                        Uri.parse("package:" + reactContext.getApplicationContext().getPackageName()));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(intent);
            }
            promise.resolve(true);
        } catch (Exception e) {
            promise.reject("ERROR", e.getMessage());
        }
    }

    @ReactMethod
    public void checkMicrophonePermission(Promise promise) {
        log("检查麦克风权限...");
        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            log("麦克风权限未授予，请求中...");
            Activity activity = getCurrentActivity();
            if (activity instanceof PermissionAwareActivity) {
                ((PermissionAwareActivity) activity).requestPermissions(
                        new String[]{Manifest.permission.RECORD_AUDIO},
                        PERMISSION_REQUEST_CODE,
                        (requestCode, permissions, grantResults) -> {
                            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                                log("麦克风权限已授予");
                                promise.resolve(true);
                            } else {
                                log("麦克风权限被拒绝");
                                promise.reject("PERMISSION_DENIED", "Microphone permission denied");
                            }
                            return true;
                        }
                );
            } else {
                promise.reject("NO_ACTIVITY", "No current activity");
            }
        } else {
            log("麦克风权限已授予");
            promise.resolve(true);
        }
    }

    @Override
    public boolean onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        return false;
    }

    @ReactMethod
    public void showFloatingButton() {
        log("显示悬浮按钮...");
        mainHandler.post(() -> {
            try {
                // 如果悬浮窗已存在，则关闭它（切换行为）
                if (floatingContainer != null) {
                    log("悬浮按钮已存在，关闭它");
                    hideFloatingButtonInternal();
                    return;
                }

                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && !Settings.canDrawOverlays(reactContext)) {
                    log("无悬浮窗权限，无法显示");
                    return;
                }

                windowManager = (WindowManager) reactContext.getSystemService(Context.WINDOW_SERVICE);

                int layoutFlag;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    layoutFlag = WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY;
                } else {
                    layoutFlag = WindowManager.LayoutParams.TYPE_PHONE;
                }

                floatingContainer = createFloatingView();

                WindowManager.LayoutParams params = new WindowManager.LayoutParams(
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        WindowManager.LayoutParams.WRAP_CONTENT,
                        layoutFlag,
                        WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE
                            | WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
                        PixelFormat.TRANSLUCENT
                );
                params.gravity = Gravity.LEFT | Gravity.CENTER_VERTICAL;
                params.x = 0; // 按钮紧贴屏幕边缘
                params.y = 0;

                windowManager.addView(floatingContainer, params);
                log("悬浮按钮显示成功");
            } catch (Exception e) {
                Log.e(TAG, "Failed to show floating button", e);
                log("显示悬浮按钮失败: " + e.getMessage());
            }
        });
    }

    private void hideFloatingButtonInternal() {
        try {
            if (autoHideRunnable != null) {
                mainHandler.removeCallbacks(autoHideRunnable);
                autoHideRunnable = null;
            }
            logoHidden = false;
            snappedEdge = 0;
            logoWasHiddenAtTouchDown = false;
            if (floatingContainer != null && windowManager != null) {
                windowManager.removeView(floatingContainer);
                floatingContainer = null;
                expandedPanel = null;
                statusTextView = null;
                resultsContainer = null;
                logoButtonView = null;
                isExpanded = false;
                isRecording = false;
                log("悬浮按钮已隐藏");
            }
        } catch (Exception e) {
            Log.e(TAG, "Failed to hide floating button", e);
        }
    }

    @ReactMethod
    public void hideFloatingButton() {
        log("隐藏悬浮按钮...");
        mainHandler.post(this::hideFloatingButtonInternal);
    }

    @ReactMethod
    public void getLastRecordingPath(Promise promise) {
        if (lastWavPath != null) {
            promise.resolve(lastWavPath);
        } else {
            promise.reject("NO_RECORDING", "没有录制的音频文件");
        }
    }

    @ReactMethod
    public void playLastRecording() {
        if (lastWavPath == null) {
            log("没有可播放的录音");
            return;
        }
        try {
            android.media.MediaPlayer player = new android.media.MediaPlayer();
            player.setDataSource(lastWavPath);
            player.prepare();
            player.start();
            player.setOnCompletionListener(mp -> {
                mp.release();
                log("播放完成");
            });
            log("开始播放录音: " + lastWavPath);
        } catch (Exception e) {
            log("播放失败: " + e.getMessage());
        }
    }

    private String saveAsWav(byte[] pcmData) {
        try {
            java.io.File dir = reactContext.getExternalFilesDir(null);
            if (dir == null) dir = reactContext.getFilesDir();
            java.io.File file = new java.io.File(dir, "recording_" + System.currentTimeMillis() + ".wav");
            
            int totalDataLen = pcmData.length + 36;
            int channels = 1;
            int bitsPerSample = 16;
            int byteRate = SAMPLE_RATE * channels * bitsPerSample / 8;
            int blockAlign = channels * bitsPerSample / 8;

            java.io.FileOutputStream fos = new java.io.FileOutputStream(file);
            java.io.DataOutputStream dos = new java.io.DataOutputStream(fos);

            dos.writeBytes("RIFF");
            dos.writeInt(Integer.reverseBytes(totalDataLen));
            dos.writeBytes("WAVE");
            dos.writeBytes("fmt ");
            dos.writeInt(Integer.reverseBytes(16));
            dos.writeShort(Short.reverseBytes((short) 1));
            dos.writeShort(Short.reverseBytes((short) channels));
            dos.writeInt(Integer.reverseBytes(SAMPLE_RATE));
            dos.writeInt(Integer.reverseBytes(byteRate));
            dos.writeShort(Short.reverseBytes((short) blockAlign));
            dos.writeShort(Short.reverseBytes((short) bitsPerSample));
            dos.writeBytes("data");
            dos.writeInt(Integer.reverseBytes(pcmData.length));
            dos.write(pcmData);

            dos.flush();
            dos.close();
            fos.close();

            log("WAV 文件已保存: " + file.getAbsolutePath() + " (" + file.length() + " bytes)");
            return file.getAbsolutePath();
        } catch (Exception e) {
            log("保存 WAV 失败: " + e.getMessage());
            return null;
        }
    }

    private FrameLayout createFloatingView() {
        FrameLayout container = new FrameLayout(reactContext);

        ImageView logoButton = new ImageView(reactContext);
        try {
            int resId = reactContext.getResources().getIdentifier("ic_launcher", "mipmap", reactContext.getPackageName());
            if (resId != 0) {
                logoButton.setImageResource(resId);
            }
        } catch (Exception e) {
            Log.w(TAG, "Could not load launcher icon", e);
        }

        // 整体放大：小巧圆形 logo
        FrameLayout.LayoutParams logoParams = new FrameLayout.LayoutParams(120, 120);
        logoButton.setLayoutParams(logoParams);
        logoButton.setScaleType(ImageView.ScaleType.CENTER_CROP);
        logoButton.setBackgroundColor(0xFF7EB6FF);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            logoButton.setClipToOutline(true);
            logoButton.setOutlineProvider(new ViewOutlineProvider() {
                @Override
                public void getOutline(View view, Outline outline) {
                    outline.setOval(0, 0, view.getWidth(), view.getHeight());
                }
            });
        }

        // logo 按钮触摸处理：拖拽移动 + 长按3秒关闭 + 短按切换面板
        logoButton.setOnTouchListener(new View.OnTouchListener() {
            private float downX, downY, lastX, lastY;
            private boolean isDragging = false;
            private boolean longPressTriggered = false;
            private Runnable longPressRunnable = null;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        // Record hidden state before any restore
                        logoWasHiddenAtTouchDown = logoHidden;
                        resetAutoHideTimer();
                        downX = event.getRawX();
                        downY = event.getRawY();
                        lastX = event.getRawX();
                        lastY = event.getRawY();
                        isDragging = false;
                        longPressTriggered = false;
                        longPressRunnable = () -> {
                            longPressTriggered = true;
                            logToJS("长按3秒，关闭悬浮窗");
                            hideFloatingButtonInternal();
                        };
                        mainHandler.postDelayed(longPressRunnable, 3000);
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        resetAutoHideTimer();
                        if (!isDragging && (Math.abs(event.getRawX() - downX) > 10 || Math.abs(event.getRawY() - downY) > 10)) {
                            isDragging = true;
                            if (longPressRunnable != null) {
                                mainHandler.removeCallbacks(longPressRunnable);
                                longPressRunnable = null;
                            }
                        }
                        if (isDragging && windowManager != null && floatingContainer != null && logoButtonView != null) {
                            float dx = event.getRawX() - lastX;
                            float dy = event.getRawY() - lastY;
                            WindowManager.LayoutParams params = (WindowManager.LayoutParams) floatingContainer.getLayoutParams();
                            params.x += (int) dx;
                            params.y += (int) dy;

                            // Boundary clamp: never allow off-screen during drag
                            int screenWidth = getScreenWidth();
                            int widgetWidth = logoButtonView.getWidth();
                            params.x = Math.max(0, Math.min(params.x, screenWidth - widgetWidth));

                            try {
                                windowManager.updateViewLayout(floatingContainer, params);
                            } catch (Exception e) {
                                Log.e(TAG, "Update layout failed", e);
                            }
                            lastX = event.getRawX();
                            lastY = event.getRawY();
                        }
                        return true;

                    case MotionEvent.ACTION_UP:
                        if (longPressRunnable != null) {
                            mainHandler.removeCallbacks(longPressRunnable);
                            longPressRunnable = null;
                        }

                        if (!longPressTriggered && isDragging) {
                            // 拖拽松手：按钮停在用户扔到的绝对位置，不做任何吸附
                            // 只重置 10 秒自动隐藏计时
                            resetAutoHideTimer();
                        } else if (!longPressTriggered && !isDragging) {
                            // 点击：如果之前是隐藏状态，先恢复再展开；否则直接切换
                            if (logoWasHiddenAtTouchDown) {
                                showLogoButton(() -> togglePanel());
                            } else {
                                togglePanel();
                            }
                        }

                        isDragging = false;
                        return true;

                    case MotionEvent.ACTION_CANCEL:
                        resetAutoHideTimer();
                        if (longPressRunnable != null) {
                            mainHandler.removeCallbacks(longPressRunnable);
                            longPressRunnable = null;
                        }
                        isDragging = false;
                        return true;
                }
                return false;
            }
        });

        container.addView(logoButton);
        logoButtonView = logoButton;
        // 首次显示时启动自动隐藏计时器
        resetAutoHideTimer();

        expandedPanel = createExpandedPanel();
        expandedPanel.setVisibility(View.GONE);
        // 35度相对斜角布局：让 logo 按钮明显错开，避免与面板重叠
        // 水平偏移远大于垂直偏移 (向右偏移 120，向下偏移 80)
        FrameLayout.LayoutParams panelLayoutParams = new FrameLayout.LayoutParams(
                760, FrameLayout.LayoutParams.WRAP_CONTENT
        );
        panelLayoutParams.leftMargin = 120;  // 水平向右大幅偏移，让 logo 在面板左外侧
        panelLayoutParams.topMargin = 80;    // 垂直向下偏移 (与水平偏移形成 35度斜角)
        expandedPanel.setLayoutParams(panelLayoutParams);
        container.addView(expandedPanel);

        return container;
    }

    private LinearLayout createExpandedPanel() {
        LinearLayout panel = new LinearLayout(reactContext);
        panel.setOrientation(LinearLayout.VERTICAL);
        // 单层干净的白色背景 + 柔和圆角，避免多层 background 叠加产生黑色阴影
        android.graphics.drawable.GradientDrawable panelBg = new android.graphics.drawable.GradientDrawable();
        panelBg.setCornerRadius(24);
        panelBg.setColor(0xE6FFFFFF); // 90%不透明白色
        panel.setBackground(panelBg);
        panel.setPadding(28, 22, 28, 22);
        // 不设置 elevation，避免 WindowManager 悬浮窗渲染异常产生黑色阴影

        // 顶部栏：标题 + 关闭按钮
        LinearLayout topBar = new LinearLayout(reactContext);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setLayoutParams(new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        ));
        // 顶部栏支持拖动悬浮窗
        topBar.setOnTouchListener(new View.OnTouchListener() {
            private float downX, downY, lastX, lastY;
            private boolean isDragging = false;

            @Override
            public boolean onTouch(View v, MotionEvent event) {
                switch (event.getAction()) {
                    case MotionEvent.ACTION_DOWN:
                        downX = event.getRawX();
                        downY = event.getRawY();
                        lastX = event.getRawX();
                        lastY = event.getRawY();
                        isDragging = false;
                        return true;

                    case MotionEvent.ACTION_MOVE:
                        if (!isDragging && (Math.abs(event.getRawX() - downX) > 10 || Math.abs(event.getRawY() - downY) > 10)) {
                            isDragging = true;
                        }
                        if (isDragging && windowManager != null && floatingContainer != null) {
                            float dx = event.getRawX() - lastX;
                            float dy = event.getRawY() - lastY;
                            WindowManager.LayoutParams params = (WindowManager.LayoutParams) floatingContainer.getLayoutParams();
                            params.x += (int) dx;
                            params.y += (int) dy;
                            try {
                                windowManager.updateViewLayout(floatingContainer, params);
                            } catch (Exception e) {
                                Log.e(TAG, "Update layout failed", e);
                            }
                            lastX = event.getRawX();
                            lastY = event.getRawY();
                        }
                        return isDragging;

                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        isDragging = false;
                        return true;
                }
                return false;
            }
        });

        TextView title = new TextView(reactContext);
        title.setText("听歌识曲");
        title.setTextSize(17);
        title.setTextColor(0xFF444444);
        title.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        title.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));
        topBar.addView(title);

        // 关闭按钮 - 小清新
        TextView closeBtn = new TextView(reactContext);
        closeBtn.setText("✕");
        closeBtn.setTextSize(14);
        closeBtn.setTextColor(0xFFBBBBBB);
        closeBtn.setPadding(12, 4, 0, 4);
        closeBtn.setOnClickListener(v -> {
            logToJS("点击关闭按钮，关闭悬浮窗");
            hideFloatingButtonInternal();
        });
        topBar.addView(closeBtn);

        panel.addView(topBar);

        // 开始识别按钮 - 小清新
        FrameLayout startBtnWrapper = new FrameLayout(reactContext);
        LinearLayout.LayoutParams btnWrapperParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        btnWrapperParams.topMargin = 12;
        startBtnWrapper.setLayoutParams(btnWrapperParams);

        FrameLayout startBtn = new FrameLayout(reactContext);
        startBtn.setId(android.R.id.button1);
        android.graphics.drawable.GradientDrawable btnBg = new android.graphics.drawable.GradientDrawable();
        btnBg.setCornerRadius(12);
        btnBg.setColor(0xFF7EB6FF);
        startBtn.setBackground(btnBg);

        LinearLayout btnContent = new LinearLayout(reactContext);
        btnContent.setOrientation(LinearLayout.HORIZONTAL);
        btnContent.setGravity(Gravity.CENTER);
        btnContent.setPadding(28, 14, 28, 14);

        ImageView iconView = new ImageView(reactContext);
        int iconResId = reactContext.getResources().getIdentifier("ic_music_recognition", "drawable", reactContext.getPackageName());
        if (iconResId != 0) {
            iconView.setImageResource(iconResId);
        }
        LinearLayout.LayoutParams iconParams = new LinearLayout.LayoutParams(36, 36);
        iconParams.setMargins(0, 0, 10, 0);
        iconView.setLayoutParams(iconParams);
        iconView.setScaleType(ImageView.ScaleType.CENTER_CROP);

        TextView btnText = new TextView(reactContext);
        btnText.setId(android.R.id.text1);
        btnText.setText("开始识别");
        btnText.setTextSize(15);
        btnText.setTextColor(0xFFFFFFFF);
        btnText.setGravity(Gravity.CENTER);

        btnContent.addView(iconView);
        btnContent.addView(btnText);
        startBtn.addView(btnContent);

        startBtn.setLayoutParams(new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
        ));
        startBtn.setOnClickListener(v -> onStartRecognizeClick());
        startBtnWrapper.addView(startBtn);

        panel.addView(startBtnWrapper);

        // 状态文字
        statusTextView = new TextView(reactContext);
        statusTextView.setText("结果:点击跳转，长按复制");
        statusTextView.setTextSize(12);
        statusTextView.setTextColor(0xFFAAAAAA);
        statusTextView.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams statusParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        statusParams.topMargin = 8;
        statusTextView.setLayoutParams(statusParams);
        panel.addView(statusTextView);

        // 识别结果
        resultsContainer = new LinearLayout(reactContext);
        resultsContainer.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams resultsParams = new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
        );
        resultsParams.topMargin = 8;
        resultsContainer.setLayoutParams(resultsParams);
        panel.addView(resultsContainer);

        LinearLayout.LayoutParams panelParams = new LinearLayout.LayoutParams(760, LinearLayout.LayoutParams.WRAP_CONTENT);
        panel.setLayoutParams(panelParams);

        return panel;
    }

    /**
     * 判断触摸点是否在 logo 按钮区域内
     */
    private boolean isTouchOnLogo(float rawX, float rawY) {
        if (logoButtonView == null) return false;
        int[] loc = new int[2];
        logoButtonView.getLocationOnScreen(loc);
        return rawX >= loc[0] && rawX <= loc[0] + logoButtonView.getWidth()
                && rawY >= loc[1] && rawY <= loc[1] + logoButtonView.getHeight();
    }

    /**
     * Toggle the expanded panel.
     * Rule: Always 45° bottom-right offset (leftMargin=120, topMargin=80).
     * If widget is on the right side of screen, shift the entire container
     * leftward by PANEL_WIDTH so the panel doesn't overflow the viewport.
     */
    /**
     * 切换展开面板。
     * 原子级渲染法则：先计算最终坐标 → 同步 commit 容器位置 → 再淡入面板。
     * 绝不让面板在坐标未就绪时暴露给用户。
     */
    private void togglePanel() {
        if (expandedPanel == null) return;
        isExpanded = !isExpanded;

        if (isExpanded && floatingContainer != null && logoButtonView != null) {
            WindowManager.LayoutParams params = (WindowManager.LayoutParams) floatingContainer.getLayoutParams();
            int screenWidth = getScreenWidth();
            int widgetWidth = logoButtonView.getWidth();

            // 固定 45° 偏移：按钮左上角，面板斜右下角
            FrameLayout.LayoutParams panelLayoutParams = (FrameLayout.LayoutParams) expandedPanel.getLayoutParams();
            panelLayoutParams.leftMargin = 120;
            panelLayoutParams.topMargin = 80;
            expandedPanel.setLayoutParams(panelLayoutParams);

            // 判断按钮在屏幕哪半边
            int widgetRight = params.x + widgetWidth;
            boolean isOnRightSide = (widgetRight > screenWidth / 2);

            // 第一步：直接计算最终安全坐标（不做动画，一步到位）
            int targetX;
            if (isOnRightSide) {
                // 右侧：容器左移，确保面板不飞出屏幕
                // 面板右边界 = container_x + 120 + 760 = container_x + 880
                // 要求 container_x + 880 <= screenWidth → container_x <= screenWidth - 880
                targetX = Math.max(0, screenWidth - 880);
            } else {
                // 左侧：容器归零
                targetX = 0;
            }

            // 第二步：原子级同步——先 commit 坐标，面板此时还是 GONE
            params.x = targetX;
            windowManager.updateViewLayout(floatingContainer, params);

            // 第三步：面板先设为 VISIBLE 但 alpha=0，然后淡入
            expandedPanel.setAlpha(0.0f);
            expandedPanel.setVisibility(View.VISIBLE);
            expandedPanel.animate()
                .alpha(1.0f)
                .setDuration(150)
                .start();

            log("面板已展开，容器原子级定位完成");
        } else if (!isExpanded) {
            expandedPanel.setVisibility(View.GONE);
        }

        resetAutoHideTimer();
    }

    private void setStatus(String text) {
        mainHandler.post(() -> {
            if (statusTextView != null) {
                statusTextView.setText(text);
            }
        });
        Log.i(TAG, "状态: " + text);
    }

    private void updateStartBtn(String text, boolean isRecording) {
        mainHandler.post(() -> {
            if (expandedPanel != null) {
                View btnFrame = expandedPanel.findViewById(android.R.id.button1);
                TextView btnText = expandedPanel.findViewById(android.R.id.text1);
                if (btnFrame != null && btnText != null) {
                    btnText.setText(text);
                    android.graphics.drawable.GradientDrawable btnBg = new android.graphics.drawable.GradientDrawable();
                    btnBg.setCornerRadius(12);
                    if (isRecording) {
                        btnBg.setColor(0xFFD0D0D0);
                        btnText.setTextColor(0xFF888888);
                    } else {
                        btnBg.setColor(0xFF7EB6FF);
                        btnText.setTextColor(0xFFFFFFFF);
                    }
                    btnFrame.setBackground(btnBg);
                }
            }
        });
    }

    private void onStartRecognizeClick() {
        // 如果正在识别，直接停止
        if (isRecording) {
            log("正在识别中，停止识别");
            isRecording = false;
            try {
                if (audioRecord != null) {
                    audioRecord.stop();
                    audioRecord.release();
                    audioRecord = null;
                }
            } catch (Exception e) {
                Log.e(TAG, "Stop recording failed", e);
            }
            setStatus("已停止识别");
            updateStartBtn("开始识别", false);
            return;
        }
        log("点击开始识别");

        if (ContextCompat.checkSelfPermission(reactContext, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            log("麦克风权限未授予，请求权限...");
            Activity activity = getCurrentActivity();
            if (activity instanceof PermissionAwareActivity) {
                ((PermissionAwareActivity) activity).requestPermissions(
                        new String[]{Manifest.permission.RECORD_AUDIO},
                        PERMISSION_REQUEST_CODE,
                        (requestCode, permissions, grantResults) -> {
                            if (grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                                log("麦克风权限已授予");
                                mainHandler.post(this::startRecording);
                            } else {
                                log("麦克风权限被拒绝");
                                mainHandler.post(() -> setStatus("需要麦克风权限"));
                            }
                            return true;
                        }
                );
            } else {
                setStatus("需要麦克风权限");
            }
            return;
        }

        startRecording();
    }

    private void startRecording() {
        log("初始化录音...");
        int bufferSize = AudioRecord.getMinBufferSize(SAMPLE_RATE, CHANNEL_CONFIG, AUDIO_FORMAT);
        log("最小缓冲区大小: " + bufferSize + " 字节");

        if (bufferSize == AudioRecord.ERROR || bufferSize == AudioRecord.ERROR_BAD_VALUE) {
            log("录音缓冲区初始化失败: " + bufferSize);
            setStatus("录音初始化失败");
            updateStartBtn("重新识别", false);
            return;
        }

        try {
            audioRecord = new AudioRecord(
                    MediaRecorder.AudioSource.MIC,
                    SAMPLE_RATE,
                    CHANNEL_CONFIG,
                    AUDIO_FORMAT,
                    bufferSize * 2
            );

            if (audioRecord.getState() != AudioRecord.STATE_INITIALIZED) {
                log("录音设备状态: " + audioRecord.getState() + " (期望: " + AudioRecord.STATE_INITIALIZED + ")");
                setStatus("录音设备初始化失败");
                updateStartBtn("重新识别", false);
                return;
            }

            log("录音设备初始化成功");
            log("开始录音... 采样率=" + SAMPLE_RATE + "Hz, 时长=" + RECORD_DURATION_SECONDS + "秒");
            isRecording = true;
            audioRecord.startRecording();
            setStatus("录制中...");
            updateStartBtn("识别中... " + RECORD_DURATION_SECONDS + "秒", true);

            new Thread(() -> {
                ByteArrayOutputStream baos = new ByteArrayOutputStream();
                byte[] buffer = new byte[bufferSize];
                int totalBytes = SAMPLE_RATE * RECORD_DURATION_SECONDS * 2;
                int bytesRead = 0;
                int readCount = 0;
                long maxAmplitude = 0;
                long sumAmplitude = 0;
                int sampleCount = 0;

                log("总字节数: " + totalBytes + ", 缓冲区: " + bufferSize);

                while (isRecording && bytesRead < totalBytes) {
                    int read = audioRecord.read(buffer, 0, buffer.length);
                    if (read > 0) {
                        baos.write(buffer, 0, read);
                        bytesRead += read;
                        readCount++;

                        // 计算音频振幅
                        for (int i = 0; i < read - 1; i += 2) {
                            short sample = (short) ((buffer[i] & 0xFF) | (buffer[i + 1] << 8));
                            long amplitude = Math.abs(sample);
                            if (amplitude > maxAmplitude) maxAmplitude = amplitude;
                            sumAmplitude += amplitude;
                            sampleCount++;
                        }

                        int remaining = (totalBytes - bytesRead) / (SAMPLE_RATE * 2);
                        long avgAmplitude = sampleCount > 0 ? sumAmplitude / sampleCount : 0;

                        final long finalMax = maxAmplitude;
                        final long finalAvg = avgAmplitude;
                        final int finalBytesRead = bytesRead;
                        final int finalTotal = totalBytes;
                        final int readBuf = read;
                        final int finalSampleCount = sampleCount;

                        mainHandler.post(() -> {
                            setStatus("录制中...");
                            updateStartBtn("识别中... " + remaining + "秒", true);
                        });

                        if (readCount % 20 == 0) {
                            log("录制进度: " + bytesRead + "/" + totalBytes + " bytes | 读取次数: " + readCount
                                    + " | 最大振幅: " + maxAmplitude + " | 平均振幅: " + (sampleCount > 0 ? sumAmplitude / sampleCount : 0));
                        }
                    } else {
                        log("录音读取失败: " + read);
                    }
                }

                isRecording = false;
                try {
                    audioRecord.stop();
                    audioRecord.release();
                    log("录音停止并释放");
                } catch (Exception e) {
                    Log.e(TAG, "Stop recording failed", e);
                    log("停止录音失败: " + e.getMessage());
                }
                audioRecord = null;

                byte[] pcmData = baos.toByteArray();
                logToJS("录音完成: " + pcmData.length + " bytes | 采样数: " + sampleCount
                        + " | 最大振幅: " + maxAmplitude + " | 平均振幅: " + (sampleCount > 0 ? sumAmplitude / sampleCount : 0));

                // 显示前几个采样点
                StringBuilder sampleStr = new StringBuilder("前20个采样点: ");
                for (int i = 0; i < Math.min(40, pcmData.length); i += 2) {
                    short s = (short) ((pcmData[i] & 0xFF) | (pcmData[i + 1] << 8));
                    sampleStr.append(s).append(" ");
                }
                logToJS(sampleStr.toString());

                // 保存为 WAV 文件
                lastWavPath = saveAsWav(pcmData);
                if (lastWavPath != null) {
                    logToJS("WAV 已保存: " + lastWavPath);
                }

                setStatus("识别中...");
                updateStartBtn("等待中...", true);
                sendToApi(pcmData);
            }).start();

        } catch (SecurityException e) {
            log("录音权限异常: " + e.getMessage());
            setStatus("录音权限被拒绝");
            updateStartBtn("开始识别", false);
        } catch (Exception e) {
            log("录音异常: " + e.getMessage());
            setStatus("录音失败: " + e.getMessage());
            updateStartBtn("重新识别", false);
        }
    }

    private void sendToApi(byte[] pcmData) {
        new Thread(() -> {
            try {
                String fpid = String.valueOf(System.currentTimeMillis());
                String dfid = "8N56O9BOG0BLY16UGKZ4KK2M";
                String mid = "5f5ff6b534ce4f1702c642b779648ed3";
                String appid = "1005";
                String clientver = "20489";
                String clienttime = String.valueOf(System.currentTimeMillis() / 1000);

                // 构建参数（按key排序生成签名）
                java.util.TreeMap<String, String> paramMap = new java.util.TreeMap<>();
                paramMap.put("appid", appid);
                paramMap.put("area_code", "1");
                paramMap.put("clienttime", clienttime);
                paramMap.put("clientver", clientver);
                paramMap.put("dfid", dfid);
                paramMap.put("fpid", fpid);
                paramMap.put("include_unpublish", "1");
                paramMap.put("mid", mid);
                paramMap.put("multi_result", "1");
                paramMap.put("useid", "1898352613");

                // 生成签名：MD5(salt + sorted_params_string + data + salt)
                // 注意：对于二进制数据（PCM），签名需要包含数据本身
                StringBuilder paramsString = new StringBuilder();
                for (java.util.Map.Entry<String, String> entry : paramMap.entrySet()) {
                    paramsString.append(entry.getKey()).append("=").append(entry.getValue());
                }

                String salt = "OIlwieks28dk2k092lksi2UIkp";
                // 用字节数组拼接签名：salt + paramsString + pcmData + salt
                java.security.MessageDigest md = java.security.MessageDigest.getInstance("MD5");
                md.update(salt.getBytes("UTF-8"));
                md.update(paramsString.toString().getBytes("UTF-8"));
                md.update(pcmData);
                md.update(salt.getBytes("UTF-8"));
                byte[] digest = md.digest();
                StringBuilder sigBuilder = new StringBuilder();
                for (byte b : digest) {
                    sigBuilder.append(String.format("%02x", b));
                }
                String signature = sigBuilder.toString();

                // 构建 URL
                StringBuilder urlBuilder = new StringBuilder("https://gateway.kugou.com/fingerprint.service/v1/music_trackid_mulit?");
                for (java.util.Map.Entry<String, String> entry : paramMap.entrySet()) {
                    urlBuilder.append(entry.getKey()).append("=").append(entry.getValue()).append("&");
                }
                urlBuilder.append("signature=").append(signature);

                String apiUrl = urlBuilder.toString();
                logToJS("=== 开始 API 请求 ===");
                logToJS("签名参数: " + paramsString.toString());
                logToJS("签名: " + signature);
                logToJS("URL: " + apiUrl);
                logToJS("PCM: " + pcmData.length + " bytes");

                setStatus("正在请求 API...");

                java.net.URL url = new java.net.URL(apiUrl);
                java.net.HttpURLConnection conn = (java.net.HttpURLConnection) url.openConnection();
                conn.setRequestMethod("POST");
                conn.setRequestProperty("Content-Type", "application/octet-stream");
                conn.setRequestProperty("User-Agent", "KuGou/11490 (Android)");
                conn.setRequestProperty("Cookie", "KugooID=1898352613; userid=1898352613; token=0f09b5ab0836bba4d76f12406401479e4535ae0097491274892a876c4fe1b93a; dfid=8N56O9BOG0BLY16UGKZ4KK2M; mid=5f5ff6b534ce4f1702c642b779648ed3");
                conn.setDoOutput(true);
                conn.setConnectTimeout(15000);
                conn.setReadTimeout(15000);

                setStatus("正在发送音频数据...");
                long startTime = System.currentTimeMillis();
                
                java.io.OutputStream os = conn.getOutputStream();
                os.write(pcmData);
                os.flush();
                os.close();

                setStatus("等待服务器响应...");
                int responseCode = conn.getResponseCode();
                long elapsed = System.currentTimeMillis() - startTime;
                logToJS("响应码: " + responseCode + " | 耗时: " + elapsed + "ms");

                String response = null;
                try {
                    java.io.InputStream is = (responseCode == 200) ? conn.getInputStream() : conn.getErrorStream();
                    if (is != null) {
                        ByteArrayOutputStream responseBaos = new ByteArrayOutputStream();
                        byte[] buf = new byte[4096];
                        int len;
                        while ((len = is.read(buf)) != -1) {
                            responseBaos.write(buf, 0, len);
                        }
                        response = responseBaos.toString("UTF-8");
                        is.close();
                    }
                } catch (Exception e) {
                    logToJS("读取响应失败: " + e.getMessage());
                }

                conn.disconnect();

                if (response != null && response.length() > 0) {
                    logToJS("响应长度: " + response.length() + " bytes");
                    // 打印完整服务器响应包体
                    logToJS("=== 完整服务器响应 ===");
                    // 分段打印，避免单条日志过长
                    int chunkSize = 2000;
                    for (int offset = 0; offset < response.length(); offset += chunkSize) {
                        String chunk = response.substring(offset, Math.min(offset + chunkSize, response.length()));
                        logToJS("[响应 " + offset + "-" + Math.min(offset + chunkSize, response.length()) + "] " + chunk);
                    }
                    logToJS("=== 响应结束 ===");
                    parseResults(response);
                } else {
                    logToJS("响应为空 | HTTP " + responseCode);
                    setStatus("请求失败: HTTP " + responseCode);
                    updateStartBtn("重新识别", false);
                }
            } catch (Exception e) {
                Log.e(TAG, "API error", e);
                String errorDetail = e.getClass().getSimpleName() + ": " + e.getMessage();
                logToJS("!!! API 错误: " + errorDetail);
                setStatus("网络错误: " + errorDetail);
                updateStartBtn("重新识别", false);
            }
        }).start();
    }

    private String md5(String input) {
        try {
            java.security.MessageDigest md = java.security.MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(input.getBytes("UTF-8"));
            StringBuilder sb = new StringBuilder();
            for (byte b : digest) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            Log.e(TAG, "MD5 error", e);
            return "";
        }
    }

    /**
     * 唤起应用到前台
     */
    private void bringAppToForeground() {
        try {
            Activity currentActivity = getCurrentActivity();
            if (currentActivity != null) {
                // 应用在前台但可能不在当前 Activity
                Intent intent = new Intent(reactContext, currentActivity.getClass());
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                reactContext.startActivity(intent);
            } else {
                // 应用在后台，通过包名启动
                String packageName = reactContext.getPackageName();
                Intent launchIntent = reactContext.getPackageManager().getLaunchIntentForPackage(packageName);
                if (launchIntent != null) {
                    launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
                    reactContext.startActivity(launchIntent);
                }
            }
            log("已唤起应用到前台");
        } catch (Exception e) {
            Log.e(TAG, "bringAppToForeground failed", e);
            log("唤起应用失败: " + e.getMessage());
        }
    }

    /**
     * 从 JSONObject 中按优先级依次尝试取字符串值，返回第一个非空的值
     * 对应 EchoMusic mapper 中的 pickValue 逻辑
     */
    private String pickString(JSONObject obj, String... keys) {
        for (String key : keys) {
            String val = obj.optString(key, "");
            if (val != null && !val.isEmpty()) return val;
        }
        return "";
    }

    /**
     * 打开酷狗音乐歌曲播放详情页
     * 优先尝试酷狗App深度链接，若未安装则打开酷狗网页版
     */
    private void openKugouSongPage(String hash, String albumId) {
        if (hash == null || hash.isEmpty()) {
            logToJS("hash 为空，无法跳转酷狗音乐");
            return;
        }

        // 构建酷狗网页版歌曲详情URL
        StringBuilder webUrlBuilder = new StringBuilder("https://www.kugou.com/song/#hash=");
        webUrlBuilder.append(hash);
        if (albumId != null && !albumId.isEmpty()) {
            webUrlBuilder.append("&album_id=").append(albumId);
        }
        final String webUrl = webUrlBuilder.toString();

        // 优先尝试酷狗App深度链接
        String deepLink = "kugou://song/play?hash=" + hash;
        if (albumId != null && !albumId.isEmpty()) {
            deepLink += "&album_id=" + albumId;
        }

        try {
            Intent kugouIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(deepLink));
            kugouIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            if (kugouIntent.resolveActivity(reactContext.getPackageManager()) != null) {
                reactContext.startActivity(kugouIntent);
                logToJS("已打开酷狗音乐App: " + deepLink);
            } else {
                // 酷狗App未安装，回退到网页版
                Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(webUrl));
                webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(webIntent);
                logToJS("酷狗App未安装，已打开网页版: " + webUrl);
            }
        } catch (Exception e) {
            Log.e(TAG, "Open Kugou failed", e);
            logToJS("打开酷狗音乐失败: " + e.getMessage());
            // 最终回退：尝试直接打开网页版
            try {
                Intent webIntent = new Intent(Intent.ACTION_VIEW, Uri.parse(webUrl));
                webIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                reactContext.startActivity(webIntent);
            } catch (Exception ex) {
                Log.e(TAG, "Open web fallback failed", ex);
                logToJS("打开网页版也失败: " + ex.getMessage());
            }
        }
    }

    private void parseResults(String json) {
        log("解析响应...");
        try {
            if (json == null || json.isEmpty()) {
                log("响应为空");
                mainHandler.post(() -> setStatus("响应为空"));
                return;
            }

            JSONObject obj = new JSONObject(json);
            int status = obj.optInt("status", 0);
            log("status=" + status);

            if (status != 1) {
                log("未识别到歌曲 (status != 1)");
                String errorMsg = obj.optString("msg", "未知错误");
                log("错误信息: " + errorMsg);
                mainHandler.post(() -> { setStatus("未识别到歌曲: " + errorMsg); updateStartBtn("开始识别", false); });
                return;
            }

            JSONArray dataArray = obj.optJSONArray("data");
            if (dataArray == null || dataArray.length() == 0) {
                log("data 数组为空");
                mainHandler.post(() -> { setStatus("未识别到歌曲"); updateStartBtn("开始识别", false); });
                return;
            }

            log("识别到 " + dataArray.length() + " 个结果");
            // 打印每条结果的完整JSON用于调试
            for (int i = 0; i < dataArray.length(); i++) {
                logToJS("原始结果[" + i + "]: " + dataArray.getJSONObject(i).toString());
            }
            int count = Math.min(dataArray.length(), 5);
            // [0]=songname, [1]=singername, [2]=album, [3]=dist, [4]=hash, [5]=duration, [6]=albumId, [7]=songId
            final String[][] songs = new String[count][8];

            for (int i = 0; i < count; i++) {
                try {
                    JSONObject item = dataArray.getJSONObject(i);

                    // 歌名：songname > filename > name
                    String songname = pickString(item, "songname", "filename", "name");
                    songs[i][0] = songname.isEmpty() ? "未知" : songname;

                    // 歌手：singername > author_name > singer
                    String singername = pickString(item, "singername", "author_name", "singer");
                    songs[i][1] = singername.isEmpty() ? "未知歌手" : singername;

                    // dist 匹配距离
                    String dist = "0";
                    try {
                        double distVal = item.optDouble("dist", -1);
                        if (distVal >= 0) {
                            dist = String.valueOf(distVal);
                        } else {
                            dist = item.optString("dist", "0");
                        }
                    } catch (Exception e) {
                        dist = item.optString("dist", "0");
                    }
                    songs[i][3] = dist;

                    // hash：hash > hash_128 > FileHash > hash_320 > hash_flac（多字段兜底）
                    String hash = pickString(item, "hash", "hash_128", "FileHash", "hash_320", "hash_flac");
                    songs[i][4] = hash;
                    logToJS("结果[" + i + "] hash提取: hash=" + item.optString("hash", "")
                            + " | hash_128=" + item.optString("hash_128", "")
                            + " | FileHash=" + item.optString("FileHash", "")
                            + " | hash_320=" + item.optString("hash_320", "")
                            + " | hash_flac=" + item.optString("hash_flac", "")
                            + " => 最终=" + hash);

                    // 时长：timelength > timelength_128 > timelength_320 > duration
                    long timeLength = 0;
                    String tlField = pickString(item, "timelength", "timelength_128", "timelength_320", "duration");
                    if (!tlField.isEmpty()) {
                        try { timeLength = Long.parseLong(tlField); } catch (NumberFormatException e) { timeLength = 0; }
                    }
                    if (timeLength == 0) {
                        timeLength = item.optLong("timelength_128", 0);
                    }
                    songs[i][5] = String.valueOf(timeLength);

                    // 专辑信息
                    String album = "";
                    String albumId = "";
                    JSONArray albumArr = item.optJSONArray("album");
                    if (albumArr != null && albumArr.length() > 0) {
                        JSONObject albumObj = albumArr.getJSONObject(0);
                        album = pickString(albumObj, "albumname", "album_name");
                        albumId = pickString(albumObj, "albumid", "album_id");
                    }
                    // 顶层兜底
                    if (album.isEmpty()) album = pickString(item, "album_name", "albumname");
                    if (albumId.isEmpty()) albumId = pickString(item, "album_id", "albumid");
                    songs[i][2] = album;
                    songs[i][6] = albumId;

                    // songId：songid > song_id > audio_id > album_audio_id > mixsongid
                    String songId = pickString(item, "songid", "song_id", "audio_id", "album_audio_id", "mixsongid");
                    songs[i][7] = songId;

                    logToJS("结果[" + i + "]: " + songs[i][0] + " - " + songs[i][1]
                            + " | album=" + album + " | dist=" + dist
                            + " | hash=" + hash + " | albumId=" + albumId
                            + " | songId=" + songId + " | duration=" + timeLength);
                } catch (Exception e) {
                    log("解析第 " + (i + 1) + " 个结果失败: " + e.getMessage());
                    songs[i][0] = "解析失败";
                    songs[i][1] = "";
                    songs[i][2] = "";
                    songs[i][3] = "";
                }
            }

            final int finalCount = count;
            mainHandler.post(() -> {
                try {
                    if (resultsContainer == null) return;
                    resultsContainer.removeAllViews();

                    // 更新按钮文字（结果数量已在状态文字展示，不重复显示）
                    if (finalCount > 0) {
                        setStatus("识别完成，找到 " + finalCount + " 首歌曲");
                        updateStartBtn("重新识别", false);
                    } else {
                        setStatus("未识别到歌曲，请重试");
                        updateStartBtn("重新识别", false);
                    }

                    for (int i = 0; i < finalCount; i++) {
                        final int idx = i;

                        // 横向布局：封面 + 文字信息
                        LinearLayout row = new LinearLayout(reactContext);
                        row.setOrientation(LinearLayout.HORIZONTAL);
                        row.setPadding(14, 12, 14, 12);
                        row.setGravity(android.view.Gravity.CENTER_VERTICAL);
                        row.setClickable(true);
                        row.setFocusable(true);
                        // 小清新行背景：白色圆角卡片
                        android.graphics.drawable.GradientDrawable rowBg = new android.graphics.drawable.GradientDrawable();
                        rowBg.setCornerRadius(14);
                        rowBg.setColor(0x18AAAAAA); // 极浅灰底
                        row.setBackground(rowBg);
                        LinearLayout.LayoutParams rowParams = new LinearLayout.LayoutParams(
                                LinearLayout.LayoutParams.MATCH_PARENT,
                                LinearLayout.LayoutParams.WRAP_CONTENT
                        );
                        rowParams.topMargin = (i > 0) ? 8 : 0;
                        row.setLayoutParams(rowParams);

                        // 封面图 - 小巧圆角
                        ImageView cover = new ImageView(reactContext);
                        LinearLayout.LayoutParams coverParams = new LinearLayout.LayoutParams(96, 96);
                        coverParams.setMarginEnd(14);
                        cover.setLayoutParams(coverParams);
                        cover.setScaleType(ImageView.ScaleType.CENTER_CROP);
                        // 小清新封面占位
                        android.graphics.drawable.GradientDrawable coverBg = new android.graphics.drawable.GradientDrawable();
                        coverBg.setCornerRadius(10);
                        coverBg.setColor(0xFFF0F0F0); // 浅灰占位
                        cover.setBackground(coverBg);
                        // 加载封面：union_cover > album.sizable_cover > album_sizable_cover > cover
                        String coverUrlRaw = "";
                        try {
                            JSONObject item = dataArray.getJSONObject(i);
                            coverUrlRaw = pickString(item, "union_cover", "album_sizable_cover", "cover", "image");
                            if (coverUrlRaw.isEmpty()) {
                                JSONArray albumArr2 = item.optJSONArray("album");
                                if (albumArr2 != null && albumArr2.length() > 0) {
                                    coverUrlRaw = pickString(albumArr2.getJSONObject(0), "sizable_cover", "cover");
                                }
                            }
                        } catch (Exception ignored) {}
                        final String coverUrl = coverUrlRaw;
                        if (!coverUrl.isEmpty()) {
                            new Thread(() -> {
                                try {
                                    java.net.URL imgUrl = new java.net.URL(coverUrl.replace("{size}", "200"));
                                    java.net.HttpURLConnection imgConn = (java.net.HttpURLConnection) imgUrl.openConnection();
                                    imgConn.setConnectTimeout(5000);
                                    imgConn.setReadTimeout(5000);
                                    java.io.InputStream imgIs = imgConn.getInputStream();
                                    android.graphics.Bitmap bmp = android.graphics.BitmapFactory.decodeStream(imgIs);
                                    imgIs.close();
                                    imgConn.disconnect();
                                    if (bmp != null) {
                                        mainHandler.post(() -> cover.setImageBitmap(bmp));
                                    }
                                } catch (Exception e) {
                                    Log.e(TAG, "Load cover failed", e);
                                }
                            }).start();
                        }
                        row.addView(cover);

                        // 封面点击事件：在软件内部播放歌曲（与文字区域点击行为一致）
                        cover.setClickable(true);
                        cover.setOnClickListener(v -> {
                            bringAppToForeground();
                            String hash = songs[idx][4];
                            String albumIdStr = songs[idx][6];
                            String songIdStr = songs[idx][7];
                            logToJS("=== 点击封面，播放歌曲 ===");
                            logToJS("歌曲: " + songs[idx][0] + " - " + songs[idx][1]
                                    + " | hash: " + hash + " | albumId: " + albumIdStr
                                    + " | songId: " + songIdStr + " | cover: " + coverUrl);
                            try {
                                WritableMap event = Arguments.createMap();
                                event.putString("action", "play");
                                event.putString("songname", songs[idx][0]);
                                event.putString("singername", songs[idx][1]);
                                event.putString("album", songs[idx][2]);
                                event.putString("hash", hash);
                                event.putString("duration", songs[idx][5]);
                                event.putString("cover", coverUrl);
                                event.putString("albumId", albumIdStr);
                                event.putString("songId", songIdStr);
                                reactContext
                                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                                    .emit("MusicRecognitionEvent", event);
                                logToJS("play 事件已发送到 JS");
                            } catch (Exception e) {
                                Log.e(TAG, "emit play event failed", e);
                                logToJS("emit 失败: " + e.getMessage());
                            }
                        });

                        // 文字区域
                        LinearLayout textArea = new LinearLayout(reactContext);
                        textArea.setOrientation(LinearLayout.VERTICAL);
                        textArea.setLayoutParams(new LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f));

                        TextView songName = new TextView(reactContext);
                        songName.setText(songs[i][0]);
                        songName.setTextSize(15);
                        songName.setTextColor(0xFF444444);
                        songName.setMaxLines(1);
                        songName.setEllipsize(android.text.TextUtils.TruncateAt.END);
                        textArea.addView(songName);

                        TextView artist = new TextView(reactContext);
                        String artistText = songs[i][1] + (songs[i][2].isEmpty() ? "" : " · " + songs[i][2]);
                        artist.setText(artistText);
                        artist.setTextSize(12);
                        artist.setTextColor(0xFFAAAAAA);
                        artist.setMaxLines(1);
                        textArea.addView(artist);

                        // 匹配度
                        try {
                            double distVal = Double.parseDouble(songs[i][3]);
                            if (distVal > 0) {
                                TextView distView = new TextView(reactContext);
                                distView.setText(String.format("%.0f%%", distVal * 100));
                                distView.setTextSize(11);
                                distView.setTextColor(0xFF7EB6FF); // 柔和蓝
                                textArea.addView(distView);
                            }
                        } catch (NumberFormatException e) { /* ignore */ }

                        row.addView(textArea);

                        // 长按复制歌曲名称和作者
                        row.setOnLongClickListener(v -> {
                            String copyText = songs[idx][0] + " - " + songs[idx][1];
                            android.content.ClipboardManager clipboard = (android.content.ClipboardManager) reactContext.getSystemService(Context.CLIPBOARD_SERVICE);
                            android.content.ClipData clip = android.content.ClipData.newPlainText("歌曲信息", copyText);
                            clipboard.setPrimaryClip(clip);
                            android.widget.Toast.makeText(reactContext, "已复制: " + copyText, android.widget.Toast.LENGTH_SHORT).show();
                            return true;
                        });

                        // 点击事件（文字区域）
                        row.setOnClickListener(v -> {
                            bringAppToForeground();
                            logToJS("=== 点击歌曲（文字区域）===");
                            logToJS("歌曲: " + songs[idx][0] + " - " + songs[idx][1]
                                    + " | hash: " + songs[idx][4] + " | albumId: " + songs[idx][6]
                                    + " | songId: " + songs[idx][7] + " | cover: " + coverUrl);
                            try {
                                WritableMap event = Arguments.createMap();
                                event.putString("action", "play");
                                event.putString("songname", songs[idx][0]);
                                event.putString("singername", songs[idx][1]);
                                event.putString("album", songs[idx][2]);
                                event.putString("hash", songs[idx][4]);
                                event.putString("duration", songs[idx][5]);
                                event.putString("cover", coverUrl);
                                event.putString("albumId", songs[idx][6]);
                                event.putString("songId", songs[idx][7]);
                                reactContext
                                    .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class)
                                    .emit("MusicRecognitionEvent", event);
                                logToJS("play 事件已发送到 JS");
                            } catch (Exception e) {
                                Log.e(TAG, "emit play event failed", e);
                                logToJS("emit 失败: " + e.getMessage());
                            }
                        });

                        resultsContainer.addView(row);

                        // 不再需要分隔线，行间距由 rowParams.topMargin 控制
                    }
                    setStatus("识别完成，共 " + finalCount + " 个结果");
                } catch (Exception e) {
                    Log.e(TAG, "UI update error", e);
                    log("UI 更新错误: " + e.getMessage());
                }
            });

        } catch (Exception e) {
            Log.e(TAG, "Parse error", e);
            log("解析错误: " + e.getClass().getSimpleName() + ": " + e.getMessage());
            log("原始响应: " + (json != null ? json.substring(0, Math.min(json.length(), 200)) : "null"));
            mainHandler.post(() -> {
                setStatus("解析结果失败: " + e.getMessage());
                updateStartBtn("重新识别", false);
            });
        }
    }
}
