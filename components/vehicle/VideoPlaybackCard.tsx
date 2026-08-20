/**
 * 實時影像回放卡片元件
 * 
 * 在 video-test 頁面顯示錄像回放功能
 * 支援：
 * - 按日期範圍查詢錄像
 * - 選擇通道
 * - 查看錄像列表
 * - 播放/下載錄像
 */

import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { 
  Video, 
  Search, 
  Calendar, 
  Clock, 
  HardDrive, 
  Play, 
  RefreshCw,
  AlertCircle,
  WifiOff,
  Monitor,
  Stethoscope,
  ChevronDown,
  ChevronUp,
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react-native';
import { gps808Api, type VideoFileInfo, type VideoDiagnosticResult, type DiagnosticCheck } from '@/utils/gps808Api';
import { useGps808Store } from '@/store/gps808Store';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { defaultColors } from '@/store/themeStore';

const IS_WEB = Platform.OS === 'web';

/** 診斷狀態圖示元件 */
function DiagnosticStatusIcon({ status }: { status: DiagnosticCheck['status'] }) {
  const size = 16;
  switch (status) {
    case 'pass':
      return <CheckCircle size={size} color="#22C55E" />;
    case 'warn':
      return <AlertTriangle size={size} color="#F59E0B" />;
    case 'fail':
      return <XCircle size={size} color="#EF4444" />;
    case 'error':
      return <AlertCircle size={size} color="#EF4444" />;
    default:
      return <ActivityIndicator size={12} color={colors.textTertiary} />;
  }
}

/** 診斷狀態標籤 */
function DiagnosticStatusBadge({ status }: { status: DiagnosticCheck['status'] }) {
  const labels: Record<DiagnosticCheck['status'], string> = {
    pass: '通過',
    warn: '警告',
    fail: '失敗',
    error: '錯誤',
    pending: '檢查中',
  };
  const bgColors: Record<DiagnosticCheck['status'], string> = {
    pass: 'rgba(34, 197, 94, 0.15)',
    warn: 'rgba(245, 158, 11, 0.15)',
    fail: 'rgba(239, 68, 68, 0.15)',
    error: 'rgba(239, 68, 68, 0.15)',
    pending: colors.surface,
  };
  const textColors: Record<DiagnosticCheck['status'], string> = {
    pass: '#22C55E',
    warn: '#F59E0B',
    fail: '#EF4444',
    error: '#EF4444',
    pending: colors.textTertiary,
  };
  return (
    <View style={[styles.diagBadge, { backgroundColor: bgColors[status] }]}>
      <Text style={[styles.diagBadgeText, { color: textColors[status] }]}>
        {labels[status]}
      </Text>
    </View>
  );
}

interface VideoPlaybackCardProps {
  /** GPS 設備 ID */
  devIdno: string;
  /** 車牌號 */
  plateNumber?: string;
  /** 容器高度 */
  height?: number | string;
}

type RecordType = -1 | 0 | 1;
type StorageLocation = 1 | 2;

interface QueryParams {
  year: number;
  month: number;
  day: number;
  yearE: number;
  monthE: number;
  dayE: number;
  begHour: number;
  begMinute: number;
  endHour: number;
  endMinute: number;
  channel: number;
  recType: RecordType;
  store: StorageLocation;
}

function formatFileSize(bytes: number | undefined): string {
  if (!bytes) return '--';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDateTime(timestamp: number | undefined): string {
  if (!timestamp) return '--';
  return new Date(timestamp).toLocaleString('zh-TW', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDateShort(year: number, month: number, day: number): string {
  return `${year}/${month.toString().padStart(2, '0')}/${day.toString().padStart(2, '0')}`;
}

function getToday(): { year: number; month: number; day: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

export function VideoPlaybackCard({
  devIdno,
  plateNumber,
  height = 400,
}: VideoPlaybackCardProps) {
  const { t } = useTranslation();
  const { isConnected } = useGps808Store();
  const [isLoading, setIsLoading] = useState(false);
  const [videoFiles, setVideoFiles] = useState<VideoFileInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  
  // 診斷相關狀態
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosisResult, setDiagnosisResult] = useState<VideoDiagnosticResult | null>(null);
  const [showDiagnosis, setShowDiagnosis] = useState(false);

  const today = getToday();
  const [params, setParams] = useState<QueryParams>({
    year: today.year,
    month: today.month,
    day: today.day,
    yearE: today.year,
    monthE: today.month,
    dayE: today.day,
    begHour: 0,
    begMinute: 0,
    endHour: 23,
    endMinute: 59,
    channel: 0,
    recType: -1,
    store: 2,
  });

  const channelLabels: Record<number, string> = {
    0: 'AV 01',
    1: 'ADAS',
    2: '前視',
    3: 'AV 04',
    4: '後視',
    5: '前視圖',
  };

  const handleSearch = useCallback(async () => {
    if (!isConnected) {
      setError('GPS 尚未連線');
      return;
    }

    setIsLoading(true);
    setError(null);
    setShowResults(false);

    try {
      const begSeconds = params.begHour * 3600 + params.begMinute * 60;
      const endSeconds = params.endHour * 3600 + params.endMinute * 60;

      console.log('[VideoPlayback] 查詢參數:', {
        devIdno,
        year: params.year,
        month: params.month,
        day: params.day,
        yearE: params.yearE,
        monthE: params.monthE,
        dayE: params.dayE,
        channel: params.channel,
        beg: `${params.begHour}:${params.begMinute} (${begSeconds}s)`,
        end: `${params.endHour}:${params.endMinute} (${endSeconds}s)`,
        recType: params.recType,
        store: params.store,
      });

      // 使用 fallback 查詢：先查設備，再查服務器
      const result = await gps808Api.queryVideoHistoryFileWithFallback(devIdno, {
        year: params.year,
        month: params.month,
        day: params.day,
        yearE: params.yearE,
        monthE: params.monthE,
        dayE: params.dayE,
        channel: params.channel,
        beg: begSeconds,
        end: endSeconds,
        recType: params.recType,
      });

      console.log('[VideoPlayback] 查詢結果:', result);

      if (result.result === 0) {
        const files = result.videoFiles || [];
        setVideoFiles(files);
        setShowResults(true);
        
        // 顯示存儲位置資訊
        if (result.usedFallback) {
          console.log(`[VideoPlayback] 已自動切換：設備→服務器，最終使用 store=${result.effectiveStore}`);
        }
        
        if (files.length === 0) {
          setError('查詢時間範圍內沒有找到錄像檔案');
        }
      } else {
        setError(result.error || `查詢失敗 (錯誤碼: ${result.result})`);
      }
    } catch (err) {
      console.error('[VideoPlayback] 查詢錯誤:', err);
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [devIdno, params, isConnected]);
  
  /** 執行錄像診斷 */
  const handleDiagnose = useCallback(async () => {
    if (!isConnected) {
      setError('GPS 尚未連線');
      return;
    }

    setIsDiagnosing(true);
    setShowDiagnosis(true);

    try {
      const result = await gps808Api.diagnoseVideoRecording(devIdno);
      setDiagnosisResult(result);
    } catch (err) {
      console.error('[VideoPlayback] 診斷錯誤:', err);
      setError(String(err));
    } finally {
      setIsDiagnosing(false);
    }
  }, [devIdno, isConnected]);

  const handleOpenVideoUrl = useCallback(async (file: VideoFileInfo) => {
    if (file.playUrl) {
      const canOpen = await Linking.canOpenURL(file.playUrl);
      if (canOpen) {
        await Linking.openURL(file.playUrl);
      } else if (IS_WEB) {
        window.open(file.playUrl, '_blank');
      }
    } else if (file.downUrl) {
      if (IS_WEB) {
        window.open(file.downUrl, '_blank');
      } else {
        await Linking.openURL(file.downUrl);
      }
    } else if (file.PlaybackUrlWs) {
      if (IS_WEB) {
        window.open(file.PlaybackUrlWs, '_blank');
      }
    } else {
      setError('該錄像檔案沒有可用的播放連結');
    }
  }, []);

  const adjustDate = (type: 'start' | 'end', delta: number) => {
    setParams(p => {
      const newParams = { ...p };
      if (type === 'start') {
        let newDay = p.day + delta;
        let newMonth = p.month;
        let newYear = p.year;
        
        if (newDay < 1) {
          newMonth--;
          if (newMonth < 1) {
            newMonth = 12;
            newYear--;
          }
          newDay = new Date(newYear, newMonth, 0).getDate();
        } else if (newDay > new Date(p.year, p.month, 0).getDate()) {
          newMonth++;
          if (newMonth > 12) {
            newMonth = 1;
            newYear++;
          }
          newDay = 1;
        }
        
        newParams.day = newDay;
        newParams.month = newMonth;
        newParams.year = newYear;
      } else {
        let newDayE = p.dayE + delta;
        let newMonthE = p.monthE;
        let newYearE = p.yearE;
        
        if (newDayE < 1) {
          newMonthE--;
          if (newMonthE < 1) {
            newMonthE = 12;
            newYearE--;
          }
          newDayE = new Date(newYearE, newMonthE, 0).getDate();
        } else if (newDayE > new Date(p.yearE, p.monthE, 0).getDate()) {
          newMonthE++;
          if (newMonthE > 12) {
            newMonthE = 1;
            newYearE++;
          }
          newDayE = 1;
        }
        
        newParams.dayE = newDayE;
        newParams.monthE = newMonthE;
        newParams.yearE = newYearE;
      }
      return newParams;
    });
  };

  return (
    <View style={[styles.container, { height: typeof height === 'number' ? height : height }]}>
      {/* 標題區 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Monitor size={18} color={defaultColors.primary} />
          <Text style={styles.title}>實時影像回放</Text>
        </View>
        <View style={styles.headerRight}>
          {/* 診斷按鈕 */}
          <Pressable
            style={[styles.diagnoseBtn, isDiagnosing && styles.diagnoseBtnDisabled]}
            onPress={handleDiagnose}
            disabled={!isConnected || isDiagnosing}
          >
            {isDiagnosing ? (
              <ActivityIndicator size={12} color={defaultColors.primary} />
            ) : (
              <Stethoscope size={12} color={defaultColors.primary} />
            )}
            <Text style={styles.diagnoseBtnText}>診斷</Text>
          </Pressable>
          
          {isConnected ? (
            <View style={[styles.statusBadge, styles.onlineBadge]}>
              <View style={styles.onlineDot} />
              <Text style={styles.onlineText}>就緒</Text>
            </View>
          ) : (
            <View style={[styles.statusBadge, styles.offlineBadge]}>
              <WifiOff size={12} color="#EF4444" />
              <Text style={styles.offlineText}>離線</Text>
            </View>
          )}
        </View>
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {/* 錯誤提示 */}
        {error && (
          <View style={styles.errorBox}>
            <AlertCircle size={14} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <Pressable onPress={() => setError(null)}>
              <Text style={styles.errorClose}>關閉</Text>
            </Pressable>
          </View>
        )}

        {/* 查詢區域 */}
        <View style={styles.section}>
          {/* 設備資訊 */}
          <View style={styles.deviceInfo}>
            <View style={styles.deviceInfoItem}>
              <Text style={styles.deviceInfoLabel}>設備 ID</Text>
              <Text style={styles.deviceInfoValue}>{devIdno}</Text>
            </View>
            {plateNumber && (
              <View style={styles.deviceInfoItem}>
                <Text style={styles.deviceInfoLabel}>車牌</Text>
                <Text style={styles.deviceInfoValue}>{plateNumber}</Text>
              </View>
            )}
          </View>

          {/* 日期範圍 */}
          <View style={styles.dateRange}>
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>開始</Text>
              <View style={styles.dateControls}>
                <Pressable style={styles.dateArrow} onPress={() => adjustDate('start', -1)}>
                  <Text style={styles.dateArrowText}>-</Text>
                </Pressable>
                <Text style={styles.dateValue}>
                  {formatDateShort(params.year, params.month, params.day)}
                </Text>
                <Pressable style={styles.dateArrow} onPress={() => adjustDate('start', 1)}>
                  <Text style={styles.dateArrowText}>+</Text>
                </Pressable>
              </View>
            </View>
            
            <Text style={styles.dateSeparator}>~</Text>
            
            <View style={styles.dateItem}>
              <Text style={styles.dateLabel}>結束</Text>
              <View style={styles.dateControls}>
                <Pressable style={styles.dateArrow} onPress={() => adjustDate('end', -1)}>
                  <Text style={styles.dateArrowText}>-</Text>
                </Pressable>
                <Text style={styles.dateValue}>
                  {formatDateShort(params.yearE, params.monthE, params.dayE)}
                </Text>
                <Pressable style={styles.dateArrow} onPress={() => adjustDate('end', 1)}>
                  <Text style={styles.dateArrowText}>+</Text>
                </Pressable>
              </View>
            </View>
          </View>

          {/* 時段選擇 */}
          <View style={styles.timeSection}>
            <Text style={styles.timeLabel}>時段</Text>
            <View style={styles.timeRow}>
              <View style={styles.timePicker}>
                <Text style={styles.timePickerLabel}>開始</Text>
                <View style={styles.timePickerControls}>
                  <Pressable 
                    style={styles.timeArrow}
                    onPress={() => setParams(p => ({ 
                      ...p, 
                      begHour: p.begHour > 0 ? p.begHour - 1 : 23 
                    }))}
                  >
                    <Text style={styles.timeArrowText}>-</Text>
                  </Pressable>
                  <Text style={styles.timeValue}>
                    {params.begHour.toString().padStart(2, '0')}:{params.begMinute.toString().padStart(2, '0')}
                  </Text>
                  <Pressable 
                    style={styles.timeArrow}
                    onPress={() => setParams(p => ({ 
                      ...p, 
                      begHour: p.begHour < 23 ? p.begHour + 1 : 0 
                    }))}
                  >
                    <Text style={styles.timeArrowText}>+</Text>
                  </Pressable>
                </View>
              </View>
              
              <Text style={styles.timeSeparator}>~</Text>
              
              <View style={styles.timePicker}>
                <Text style={styles.timePickerLabel}>結束</Text>
                <View style={styles.timePickerControls}>
                  <Pressable 
                    style={styles.timeArrow}
                    onPress={() => setParams(p => ({ 
                      ...p, 
                      endHour: p.endHour > 0 ? p.endHour - 1 : 23 
                    }))}
                  >
                    <Text style={styles.timeArrowText}>-</Text>
                  </Pressable>
                  <Text style={styles.timeValue}>
                    {params.endHour.toString().padStart(2, '0')}:{params.endMinute.toString().padStart(2, '0')}
                  </Text>
                  <Pressable 
                    style={styles.timeArrow}
                    onPress={() => setParams(p => ({ 
                      ...p, 
                      endHour: p.endHour < 23 ? p.endHour + 1 : 0 
                    }))}
                  >
                    <Text style={styles.timeArrowText}>+</Text>
                  </Pressable>
                </View>
              </View>
            </View>
            
            {/* 快速時段按鈕 */}
            <View style={styles.quickTimeRow}>
              <Pressable 
                style={styles.quickTimeBtn}
                onPress={() => setParams(p => ({ ...p, begHour: 0, begMinute: 0, endHour: 23, endMinute: 59 }))}
              >
                <Text style={styles.quickTimeBtnText}>全天</Text>
              </Pressable>
              <Pressable 
                style={styles.quickTimeBtn}
                onPress={() => setParams(p => ({ ...p, begHour: 8, begMinute: 0, endHour: 18, endMinute: 0 }))}
              >
                <Text style={styles.quickTimeBtnText}>08:00-18:00</Text>
              </Pressable>
              <Pressable 
                style={styles.quickTimeBtn}
                onPress={() => setParams(p => ({ ...p, begHour: 0, begMinute: 0, endHour: 8, endMinute: 0 }))}
              >
                <Text style={styles.quickTimeBtnText}>00:00-08:00</Text>
              </Pressable>
              <Pressable 
                style={styles.quickTimeBtn}
                onPress={() => setParams(p => ({ ...p, begHour: 18, begMinute: 0, endHour: 23, endMinute: 59 }))}
              >
                <Text style={styles.quickTimeBtnText}>18:00-24:00</Text>
              </Pressable>
            </View>
          </View>

          {/* 通道選擇 */}
          <View style={styles.channelSection}>
            <Text style={styles.channelLabel}>通道</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.channelScroll}>
              {[0, 1, 2, 3, 4, 5].map(ch => (
                <Pressable
                  key={ch}
                  style={[
                    styles.channelChip,
                    params.channel === ch && styles.channelChipActive
                  ]}
                  onPress={() => setParams(p => ({ ...p, channel: ch }))}
                >
                  <Text style={[
                    styles.channelChipText,
                    params.channel === ch && styles.channelChipTextActive
                  ]}>
                    {channelLabels[ch] || `CH${ch}`}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          {/* 存儲位置 */}
          <View style={styles.storeSection}>
            <Pressable
              style={[
                styles.storeBtn,
                params.store === 1 && styles.storeBtnActive
              ]}
              onPress={() => setParams(p => ({ ...p, store: 1 }))}
            >
              <Text style={[
                styles.storeBtnText,
                params.store === 1 && styles.storeBtnTextActive
              ]}>
                設備
              </Text>
            </Pressable>
            <Pressable
              style={[
                styles.storeBtn,
                params.store === 2 && styles.storeBtnActive
              ]}
              onPress={() => setParams(p => ({ ...p, store: 2 }))}
            >
              <Text style={[
                styles.storeBtnText,
                params.store === 2 && styles.storeBtnTextActive
              ]}>
                服務器
              </Text>
            </Pressable>
          </View>

          {/* 查詢按鈕 */}
          <Pressable
            style={[styles.searchBtn, (!isConnected || isLoading) && styles.searchBtnDisabled]}
            onPress={handleSearch}
            disabled={!isConnected || isLoading}
          >
            {isLoading ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <RefreshCw size={16} color="#FFFFFF" />
                <Text style={styles.searchBtnText}>查詢錄像</Text>
              </>
            )}
          </Pressable>

          {/* 查詢結果 */}
          {showResults && (
            <View style={styles.resultsSection}>
              <View style={styles.resultsHeader}>
                <Text style={styles.resultsTitle}>
                  查到 {videoFiles.length} 個錄像檔案
                </Text>
              </View>
              
              {videoFiles.length === 0 ? (
                <View style={styles.emptyResults}>
                  <Video size={32} color={colors.textTertiary} />
                  <Text style={styles.emptyText}>查詢時間範圍內沒有錄像</Text>
                  <Text style={styles.emptySubtext}>請嘗試調整時間範圍或通道</Text>
                </View>
              ) : (
                <ScrollView 
                  style={styles.resultsList}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {videoFiles.slice(0, 10).map((file, index) => (
                    <View key={file.filePath || index} style={styles.resultItem}>
                      <View style={styles.resultInfo}>
                        <View style={styles.resultHeader}>
                          <View style={styles.resultChannel}>
                            <Text style={styles.resultChannelText}>
                              {channelLabels[file.chn || params.channel] || `CH${file.chn || params.channel}`}
                            </Text>
                          </View>
                          {file.recType === 1 && (
                            <View style={styles.alarmBadge}>
                              <Text style={styles.alarmBadgeText}>報警</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.resultMeta}>
                          <View style={styles.metaItem}>
                            <Clock size={12} color={colors.textTertiary} />
                            <Text style={styles.metaText}>
                              {formatDateTime(file.beginTime)}
                            </Text>
                          </View>
                          <View style={styles.metaItem}>
                            <HardDrive size={12} color={colors.textTertiary} />
                            <Text style={styles.metaText}>
                              {formatFileSize(file.fileSize)}
                            </Text>
                          </View>
                        </View>
                      </View>
                      <View style={styles.resultActions}>
                        <Pressable
                          style={styles.playBtn}
                          onPress={() => handleOpenVideoUrl(file)}
                        >
                          <Play size={14} color="#FFFFFF" />
                          <Text style={styles.playBtnText}>播放</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  {videoFiles.length > 10 && (
                    <Text style={styles.moreText}>
                      還有 {videoFiles.length - 10} 個檔案...
                    </Text>
                  )}
                </ScrollView>
              )}
            </View>
          )}

          {/* 錄像診斷面板 */}
          {showDiagnosis && (
            <View style={styles.diagnosisPanel}>
              <Pressable
                style={styles.diagnosisHeader}
                onPress={() => setShowDiagnosis(false)}
              >
                <View style={styles.diagnosisHeaderLeft}>
                  <Stethoscope size={16} color={defaultColors.primary} />
                  <Text style={styles.diagnosisTitle}>錄像診斷報告</Text>
                </View>
                <ChevronUp size={18} color={colors.textSecondary} />
              </Pressable>
              
              {isDiagnosing ? (
                <View style={styles.diagnosisLoading}>
                  <ActivityIndicator size={24} color={defaultColors.primary} />
                  <Text style={styles.diagnosisLoadingText}>正在檢測設備錄像狀態...</Text>
                </View>
              ) : diagnosisResult ? (
                <View style={styles.diagnosisContent}>
                  {/* 診斷摘要 */}
                  <View style={styles.diagnosisSummary}>
                    <Text style={[
                      styles.diagnosisSummaryText,
                      diagnosisResult.summary.hasIssue ? styles.diagnosisSummaryWarn : styles.diagnosisSummaryPass
                    ]}>
                      {diagnosisResult.summary.hasIssue
                        ? `發現 ${diagnosisResult.summary.issues.length} 個問題`
                        : '所有檢查通過'}
                    </Text>
                  </View>
                  
                  {/* 檢查項目列表 */}
                  <View style={styles.diagnosisChecks}>
                    {(Object.entries(diagnosisResult.checks) as [keyof typeof diagnosisResult.checks, DiagnosticCheck][]).map(([key, check]) => (
                      <View key={key} style={styles.diagnosisCheckItem}>
                        <View style={styles.diagnosisCheckLeft}>
                          <DiagnosticStatusIcon status={check.status} />
                          <Text style={styles.diagnosisCheckLabel}>
                            {key === 'deviceOnline' && '設備在線'}
                            {key === 'deviceStatus' && '設備狀態'}
                            {key === 'storageDevice' && '本地存儲'}
                            {key === 'storageServer' && '雲端存儲'}
                            {key === 'channelSupport' && '通道支援'}
                            {key === 'todayRecordings' && '今天錄像'}
                            {key === 'last7DaysRecordings' && '近7天錄像'}
                          </Text>
                        </View>
                        <View style={styles.diagnosisCheckRight}>
                          <DiagnosticStatusBadge status={check.status} />
                          <Text style={styles.diagnosisCheckDetail} numberOfLines={2}>
                            {check.detail}
                          </Text>
                        </View>
                      </View>
                    ))}
                  </View>
                  
                  {/* 建議操作 */}
                  {diagnosisResult.summary.recommendations.length > 0 && (
                    <View style={styles.diagnosisRecommendations}>
                      <Text style={styles.diagnosisRecommendationsTitle}>建議操作</Text>
                      {diagnosisResult.summary.recommendations.map((rec, i) => (
                        <Text key={i} style={styles.diagnosisRecommendationText}>
                          • {rec}
                        </Text>
                      ))}
                    </View>
                  )}
                  
                  {/* 詳細問題列表 */}
                  {diagnosisResult.summary.issues.length > 0 && (
                    <View style={styles.diagnosisIssues}>
                      <Text style={styles.diagnosisIssuesTitle}>發現問題</Text>
                      {diagnosisResult.summary.issues.map((issue, i) => (
                        <View key={i} style={styles.diagnosisIssueItem}>
                          <AlertTriangle size={12} color="#F59E0B" />
                          <Text style={styles.diagnosisIssueText}>{issue}</Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              ) : null}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.card,
    borderRadius: borderRadius.lg,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.cardHover,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  title: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.full,
  },
  onlineBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
  },
  offlineBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
  },
  onlineDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22C55E',
  },
  onlineText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#22C55E',
  },
  offlineText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#EF4444',
  },
  content: {
    flex: 1,
    padding: spacing.md,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: borderRadius.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: '#EF4444',
  },
  errorClose: {
    fontSize: typography.fontSize.xs,
    color: '#EF4444',
    fontWeight: '600',
  },
  section: {
    gap: spacing.md,
  },
  deviceInfo: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.sm,
    backgroundColor: colors.background,
    borderRadius: borderRadius.md,
  },
  deviceInfoItem: {
    flex: 1,
  },
  deviceInfoLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginBottom: 2,
  },
  deviceInfoValue: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    fontFamily: 'monospace',
  },
  dateRange: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dateItem: {
    flex: 1,
  },
  dateLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  dateControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dateArrow: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  dateArrowText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  dateValue: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  dateSeparator: {
    fontSize: typography.fontSize.lg,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  timeSection: {
    gap: spacing.sm,
  },
  timeLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  timeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  timePicker: {
    flex: 1,
  },
  timePickerLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  timePickerControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  timeArrow: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  timeArrowText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  timeValue: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textPrimary,
    textAlign: 'center',
  },
  timeSeparator: {
    fontSize: typography.fontSize.lg,
    color: colors.textTertiary,
    marginTop: spacing.md,
  },
  quickTimeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  quickTimeBtn: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickTimeBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  channelSection: {
    gap: spacing.xs,
  },
  channelLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  channelScroll: {
    flexDirection: 'row',
  },
  channelChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    marginRight: spacing.xs,
    borderWidth: 1,
    borderColor: colors.border,
  },
  channelChipActive: {
    backgroundColor: defaultColors.primary,
    borderColor: defaultColors.primary,
  },
  channelChipText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  channelChipTextActive: {
    color: '#FFFFFF',
  },
  storeSection: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  storeBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  storeBtnActive: {
    backgroundColor: defaultColors.primary,
    borderColor: defaultColors.primary,
  },
  storeBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  storeBtnTextActive: {
    color: '#FFFFFF',
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    backgroundColor: defaultColors.primary,
    borderRadius: borderRadius.md,
  },
  searchBtnDisabled: {
    opacity: 0.5,
  },
  searchBtnText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resultsSection: {
    marginTop: spacing.md,
  },
  resultsHeader: {
    marginBottom: spacing.sm,
  },
  resultsTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  emptyResults: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    gap: spacing.sm,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textTertiary,
  },
  emptySubtext: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  resultsList: {
    maxHeight: 300,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.sm,
  },
  resultInfo: {
    flex: 1,
    gap: spacing.xs,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  resultChannel: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: defaultColors.primary,
    borderRadius: 4,
  },
  resultChannelText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  alarmBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    backgroundColor: '#F59E0B',
    borderRadius: 4,
  },
  alarmBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  resultMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  metaText: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  resultActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  playBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: defaultColors.primary,
    borderRadius: borderRadius.sm,
  },
  playBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  moreText: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  // 診斷按鈕
  diagnoseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: borderRadius.sm,
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
  },
  diagnoseBtnDisabled: {
    opacity: 0.5,
  },
  diagnoseBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: defaultColors.primary,
  },
  // 診斷面板
  diagnosisPanel: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.3)',
    overflow: 'hidden',
  },
  diagnosisHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(99, 102, 241, 0.05)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(99, 102, 241, 0.2)',
  },
  diagnosisHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  diagnosisTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    color: defaultColors.primary,
  },
  diagnosisLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  diagnosisLoadingText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
  },
  diagnosisContent: {
    padding: spacing.md,
    gap: spacing.md,
  },
  diagnosisSummary: {
    padding: spacing.sm,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
  },
  diagnosisSummaryText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  diagnosisSummaryPass: {
    color: '#22C55E',
  },
  diagnosisSummaryWarn: {
    color: '#F59E0B',
  },
  diagnosisChecks: {
    gap: spacing.sm,
  },
  diagnosisCheckItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  diagnosisCheckLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  diagnosisCheckLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: colors.textPrimary,
    minWidth: 60,
  },
  diagnosisCheckRight: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  diagnosisCheckDetail: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
  },
  diagBadge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
  },
  diagBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  diagnosisRecommendations: {
    padding: spacing.sm,
    backgroundColor: 'rgba(59, 130, 246, 0.1)',
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  diagnosisRecommendationsTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: '#3B82F6',
  },
  diagnosisRecommendationText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  diagnosisIssues: {
    padding: spacing.sm,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
    borderRadius: borderRadius.sm,
    gap: spacing.xs,
  },
  diagnosisIssuesTitle: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    color: '#F59E0B',
  },
  diagnosisIssueItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.xs,
  },
  diagnosisIssueText: {
    flex: 1,
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    lineHeight: 18,
  },
});
