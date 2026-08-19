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
} from 'lucide-react-native';
import { gps808Api, type VideoFileInfo } from '@/utils/gps808Api';
import { useGps808Store } from '@/store/gps808Store';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { defaultColors } from '@/store/themeStore';

const IS_WEB = Platform.OS === 'web';

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

      const result = await gps808Api.queryVideoHistoryFile(devIdno, {
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
        store: params.store,
      });

      console.log('[VideoPlayback] 查詢結果:', result);

      if (result.result === 0) {
        const files = result.videoFiles || [];
        setVideoFiles(files);
        setShowResults(true);
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
});
