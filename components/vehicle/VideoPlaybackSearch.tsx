import { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
  Alert,
} from 'react-native';
import { X, Search, Download, Calendar, Clock, HardDrive, ChevronRight, AlertCircle, CheckCircle, Play } from 'lucide-react-native';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { gps808Api, type VideoFileInfo, type DownloadTask } from '@/utils/gps808Api';
import { useGps808Store } from '@/store/gps808Store';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { defaultColors } from '@/store/themeStore';

const IS_WEB = Platform.OS === 'web';

interface VideoPlaybackSearchProps {
  visible: boolean;
  onClose: () => void;
  devIdno: string;
  plateNumber?: string;
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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function getToday(): { year: number; month: number; day: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
  };
}

export function VideoPlaybackSearch({
  visible,
  onClose,
  devIdno,
  plateNumber,
}: VideoPlaybackSearchProps) {
  const { t } = useTranslation();
  const { isConnected } = useGps808Store();
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [videoFiles, setVideoFiles] = useState<VideoFileInfo[]>([]);
  const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showDownloadTasks, setShowDownloadTasks] = useState(false);

  const today = getToday();
  const [params, setParams] = useState<QueryParams>({
    year: today.year,
    month: today.month,
    day: today.day,
    yearE: today.year,
    monthE: today.month,
    dayE: today.day,
    channel: 0,
    recType: -1,
    store: 2,
  });

  const handleSearch = useCallback(async () => {
    if (!isConnected) {
      setError('GPS 尚未連線');
      return;
    }

    setIsLoading(true);
    setError(null);
    setVideoFiles([]);

    try {
      const result = await gps808Api.queryVideoHistoryFile(devIdno, {
        year: params.year,
        month: params.month,
        day: params.day,
        yearE: params.yearE,
        monthE: params.monthE,
        dayE: params.dayE,
        channel: params.channel,
        recType: params.recType,
        store: params.store,
      });

      if (result.result === 0 && result.videoFiles) {
        setVideoFiles(result.videoFiles);
        if (result.videoFiles.length === 0) {
          setError('查詢時間範圍內沒有找到錄像檔案');
        }
      } else {
        setError(result.error || '查詢失敗');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  }, [devIdno, params, isConnected]);

  const handleDownload = useCallback(async (file: VideoFileInfo) => {
    if (!file.beginTime || !file.endTime || !file.filePath) {
      setError('錄像檔案資訊不完整，無法下載');
      return;
    }

    setIsDownloading(true);
    setError(null);

    try {
      const formatTime = (ts: number) => {
        const d = new Date(ts);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
      };

      const result = await gps808Api.addDownloadTask(devIdno, {
        fileBeginTime: formatTime(file.beginTime),
        fileEndTime: formatTime(file.endTime),
        serverBeginTime: formatTime(file.beginTime),
        serverEndTime: formatTime(file.endTime),
        filePath: file.filePath,
        fileLength: file.fileSize || 0,
        channel: file.chn || params.channel,
        label: `${plateNumber || devIdno}_CH${file.chn || params.channel}`,
      });

      if (result.result === 0) {
        Alert.alert(
          '下載任務已創建',
          result.downloadUrl
            ? '錄像將下載到服務器，完成後可下載'
            : '請在「下載任務」頁面查看進度',
          [{ text: '確定' }]
        );
        // 刷新下載任務列表
        handleRefreshTasks();
      } else {
        setError(result.error || '下載任務創建失敗');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setIsDownloading(false);
    }
  }, [devIdno, params.channel, plateNumber]);

  const handleOpenVideoUrl = useCallback(async (file: VideoFileInfo) => {
    if (file.playUrl) {
      const canOpen = await Linking.canOpenURL(file.playUrl);
      if (canOpen) {
        await Linking.openURL(file.playUrl);
      } else if (IS_WEB) {
        window.open(file.playUrl, '_blank');
      }
    } else if (file.downUrl) {
      // 嘗試直接下載或播放
      if (IS_WEB) {
        window.open(file.downUrl, '_blank');
      } else {
        await Linking.openURL(file.downUrl);
      }
    } else {
      setError('該錄像檔案沒有可用的播放或下載連結');
    }
  }, []);

  const handleRefreshTasks = useCallback(async () => {
    try {
      const result = await gps808Api.queryDownloadTaskList();
      if (result.result === 0 && result.tasks) {
        setDownloadTasks(result.tasks);
      }
    } catch (err) {
      console.error('刷新下載任務失敗:', err);
    }
  }, []);

  const handleDeleteTask = useCallback(async (taskId: string) => {
    try {
      const result = await gps808Api.deleteDownloadTask(taskId);
      if (result.result === 0) {
        handleRefreshTasks();
      } else {
        setError(result.error || '刪除失敗');
      }
    } catch (err) {
      setError(String(err));
    }
  }, [handleRefreshTasks]);

  const handleDownloadTaskFile = useCallback(async (task: DownloadTask) => {
    const url = task.downloadUrl || task.DownUrl;
    if (url) {
      if (IS_WEB) {
        window.open(url, '_blank');
      } else {
        await Linking.openURL(url);
      }
    } else {
      setError('下載連結不可用');
    }
  }, []);

  const handleQuickDownload = useCallback(async (file: VideoFileInfo) => {
    // 對於可以直接下載的檔案，直接打開下載連結
    if (file.downUrl) {
      if (IS_WEB) {
        window.open(file.downUrl, '_blank');
      } else {
        await Linking.openURL(file.downUrl);
      }
    } else {
      // 否則創建下載任務
      await handleDownload(file);
    }
  }, [file => handleDownload]);

  const channelLabels: Record<number, string> = {
    0: 'AV 01',
    1: 'ADAS駕駛',
    2: 'ADAS前視',
    3: 'AV 04',
    4: '後視圖',
    5: '前視圖',
  };

  const getTaskStatusText = (status: number | undefined) => {
    switch (status) {
      case 0: return '暫停';
      case 1: return '下載中';
      case 2: return '已取消';
      case 3: return '失敗';
      case 4: return '已完成';
      default: return '未知';
    }
  };

  const getTaskStatusColor = (status: number | undefined) => {
    switch (status) {
      case 0: return '#F59E0B';
      case 1: return '#3B82F6';
      case 2: return '#6B7280';
      case 3: return '#EF4444';
      case 4: return '#22C55E';
      default: return '#6B7280';
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.modalContainer}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <Text style={styles.headerTitle}>錄像查詢與下載</Text>
            <Text style={styles.headerSubtitle}>
              {plateNumber || devIdno}
            </Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <X size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        <ScrollView style={styles.content}>
          {/* Search Form */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>查詢條件</Text>

            {/* Date Range */}
            <View style={styles.formRow}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>開始日期</Text>
                <View style={styles.dateInputs}>
                  <Pressable style={styles.dateInput}>
                    <Calendar size={14} color={colors.textSecondary} />
                    <Text style={styles.dateText}>
                      {params.year}/{params.month.toString().padStart(2, '0')}/{params.day.toString().padStart(2, '0')}
                    </Text>
                  </Pressable>
                </View>
                <View style={styles.datePickers}>
                  <View style={styles.pickerGroup}>
                    <Text style={styles.pickerLabel}>月</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                        <Pressable
                          key={m}
                          style={[styles.pickerItem, params.month === m && styles.pickerItemActive]}
                          onPress={() => setParams(p => ({ ...p, month: m }))}
                        >
                          <Text style={[styles.pickerItemText, params.month === m && styles.pickerItemTextActive]}>
                            {m}月
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                  <View style={styles.pickerGroup}>
                    <Text style={styles.pickerLabel}>日</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <Pressable
                          key={d}
                          style={[styles.pickerItem, params.day === d && styles.pickerItemActive]}
                          onPress={() => setParams(p => ({ ...p, day: d }))}
                        >
                          <Text style={[styles.pickerItemText, params.day === d && styles.pickerItemTextActive]}>
                            {d}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.formRow}>
              <View style={styles.formGroup}>
                <Text style={styles.formLabel}>結束日期</Text>
                <View style={styles.datePickers}>
                  <View style={styles.pickerGroup}>
                    <Text style={styles.pickerLabel}>月</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => (
                        <Pressable
                          key={m}
                          style={[styles.pickerItem, params.monthE === m && styles.pickerItemActive]}
                          onPress={() => setParams(p => ({ ...p, monthE: m }))}
                        >
                          <Text style={[styles.pickerItemText, params.monthE === m && styles.pickerItemTextActive]}>
                            {m}月
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                  <View style={styles.pickerGroup}>
                    <Text style={styles.pickerLabel}>日</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pickerScroll}>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                        <Pressable
                          key={d}
                          style={[styles.pickerItem, params.dayE === d && styles.pickerItemActive]}
                          onPress={() => setParams(p => ({ ...p, dayE: d }))}
                        >
                          <Text style={[styles.pickerItemText, params.dayE === d && styles.pickerItemTextActive]}>
                            {d}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                </View>
              </View>
            </View>

            {/* Channel Selection */}
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>通道</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.channelScroll}>
                {[0, 1, 2, 3, 4, 5].map(ch => (
                  <Pressable
                    key={ch}
                    style={[styles.channelChip, params.channel === ch && styles.channelChipActive]}
                    onPress={() => setParams(p => ({ ...p, channel: ch }))}
                  >
                    <Text style={[styles.channelChipText, params.channel === ch && styles.channelChipTextActive]}>
                      {channelLabels[ch] || `CH${ch}`}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>

            {/* Storage Location */}
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>存儲位置</Text>
              <View style={styles.toggleGroup}>
                <Pressable
                  style={[styles.toggleBtn, params.store === 1 && styles.toggleBtnActive]}
                  onPress={() => setParams(p => ({ ...p, store: 1 }))}
                >
                  <Text style={[styles.toggleBtnText, params.store === 1 && styles.toggleBtnTextActive]}>
                    設備
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, params.store === 2 && styles.toggleBtnActive]}
                  onPress={() => setParams(p => ({ ...p, store: 2 }))}
                >
                  <Text style={[styles.toggleBtnText, params.store === 2 && styles.toggleBtnTextActive]}>
                    服務器
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Record Type */}
            <View style={styles.formRow}>
              <Text style={styles.formLabel}>錄像類型</Text>
              <View style={styles.toggleGroup}>
                <Pressable
                  style={[styles.toggleBtn, params.recType === -1 && styles.toggleBtnActive]}
                  onPress={() => setParams(p => ({ ...p, recType: -1 }))}
                >
                  <Text style={[styles.toggleBtnText, params.recType === -1 && styles.toggleBtnTextActive]}>
                    全部
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, params.recType === 0 && styles.toggleBtnActive]}
                  onPress={() => setParams(p => ({ ...p, recType: 0 }))}
                >
                  <Text style={[styles.toggleBtnText, params.recType === 0 && styles.toggleBtnTextActive]}>
                    一般
                  </Text>
                </Pressable>
                <Pressable
                  style={[styles.toggleBtn, params.recType === 1 && styles.toggleBtnActive]}
                  onPress={() => setParams(p => ({ ...p, recType: 1 }))}
                >
                  <Text style={[styles.toggleBtnText, params.recType === 1 && styles.toggleBtnTextActive]}>
                    報警
                  </Text>
                </Pressable>
              </View>
            </View>

            {/* Search Button */}
            <Pressable
              style={[styles.searchBtn, (!isConnected || isLoading) && styles.searchBtnDisabled]}
              onPress={handleSearch}
              disabled={!isConnected || isLoading}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <Search size={18} color="#FFFFFF" />
                  <Text style={styles.searchBtnText}>查詢錄像</Text>
                </>
              )}
            </Pressable>
          </View>

          {/* Error Message */}
          {error && (
            <View style={styles.errorBox}>
              <AlertCircle size={16} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          {/* Video Files List */}
          {videoFiles.length > 0 && (
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>
                  查詢結果 ({videoFiles.length} 個檔案)
                </Text>
              </View>

              {videoFiles.map((file, index) => (
                <View key={file.filePath || index} style={styles.videoItem}>
                  <View style={styles.videoInfo}>
                    <View style={styles.videoHeader}>
                      <View style={styles.channelBadge}>
                        <Text style={styles.channelBadgeText}>
                          {channelLabels[file.chn || params.channel] || `CH${file.chn || params.channel}`}
                        </Text>
                      </View>
                      {file.recType === 1 && (
                        <View style={styles.alarmBadge}>
                          <Text style={styles.alarmBadgeText}>報警</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.videoMeta}>
                      <View style={styles.metaItem}>
                        <Clock size={12} color={colors.textTertiary} />
                        <Text style={styles.metaText}>{formatDateTime(file.beginTime)}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <HardDrive size={12} color={colors.textTertiary} />
                        <Text style={styles.metaText}>{formatFileSize(file.fileSize)}</Text>
                      </View>
                    </View>
                  </View>
                  <View style={styles.videoActions}>
                    {file.playUrl && (
                      <Pressable
                        style={styles.actionBtn}
                        onPress={() => handleOpenVideoUrl(file)}
                      >
                        <Play size={14} color={defaultColors.primary} />
                        <Text style={styles.actionBtnText}>播放</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={[styles.actionBtn, styles.downloadBtn]}
                      onPress={() => handleDownload(file)}
                      disabled={isDownloading}
                    >
                      {isDownloading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <Download size={14} color="#FFFFFF" />
                          <Text style={styles.downloadBtnText}>下載</Text>
                        </>
                      )}
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Download Tasks Section */}
          <View style={styles.section}>
            <Pressable
              style={styles.sectionHeader}
              onPress={() => {
                setShowDownloadTasks(!showDownloadTasks);
                if (!showDownloadTasks) handleRefreshTasks();
              }}
            >
              <Text style={styles.sectionTitle}>下載任務</Text>
              <ChevronRight
                size={18}
                color={colors.textSecondary}
                style={{ transform: [{ rotate: showDownloadTasks ? '90deg' : '0deg' }] }}
              />
            </Pressable>

            {showDownloadTasks && (
              <View style={styles.tasksList}>
                {downloadTasks.length === 0 ? (
                  <Text style={styles.emptyText}>暫無下載任務</Text>
                ) : (
                  downloadTasks.map((task, index) => (
                    <View key={task.TaskID || task.id || index} style={styles.taskItem}>
                      <View style={styles.taskInfo}>
                        <View style={styles.taskHeader}>
                          <View style={[styles.taskStatus, { backgroundColor: getTaskStatusColor(task.taskStatus) }]}>
                            <Text style={styles.taskStatusText}>
                              {getTaskStatusText(task.taskStatus)}
                            </Text>
                          </View>
                          <Text style={styles.taskChannel}>CH{task.channel}</Text>
                        </View>
                        <Text style={styles.taskTime}>
                          {task.beginTime || '--'} ~ {task.endTime || '--'}
                        </Text>
                        {task.taskStatus === 1 && task.uploadProgress !== undefined && (
                          <View style={styles.progressBar}>
                            <View
                              style={[styles.progressFill, { width: `${task.uploadProgress}%` }]}
                            />
                            <Text style={styles.progressText}>{task.uploadProgress}%</Text>
                          </View>
                        )}
                      </View>
                      <View style={styles.taskActions}>
                        {task.taskStatus === 4 && (task.downloadUrl || task.DownUrl) && (
                          <Pressable
                            style={[styles.actionBtn, styles.downloadBtn]}
                            onPress={() => handleDownloadTaskFile(task)}
                          >
                            <Download size={14} color="#FFFFFF" />
                            <Text style={styles.downloadBtnText}>下載</Text>
                          </Pressable>
                        )}
                        {(task.taskStatus === 0 || task.taskStatus === 3 || task.taskStatus === 4) && (
                          <Pressable
                            style={styles.actionBtn}
                            onPress={() => handleDeleteTask(task.TaskID || task.id || '')}
                          >
                            <X size={14} color="#EF4444" />
                          </Pressable>
                        )}
                      </View>
                    </View>
                  ))
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    backgroundColor: '#0D0F14',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: '#161A23',
    borderBottomWidth: 1,
    borderBottomColor: '#2A3040',
  },
  headerLeft: {
    flex: 1,
  },
  headerTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flex: 1,
  },
  section: {
    padding: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: '#2A3040',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  formRow: {
    marginBottom: spacing.md,
  },
  formGroup: {
    flex: 1,
  },
  formLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
    marginBottom: spacing.xs,
  },
  dateInputs: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  dateInput: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    padding: spacing.sm,
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.sm,
    borderWidth: 1,
    borderColor: '#2A3040',
  },
  dateText: {
    fontSize: typography.fontSize.sm,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  datePickers: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  pickerGroup: {
    flex: 1,
  },
  pickerLabel: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginBottom: spacing.xs,
  },
  pickerScroll: {
    flexDirection: 'row',
  },
  pickerItem: {
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.sm,
    marginRight: spacing.xs,
    borderWidth: 1,
    borderColor: '#2A3040',
  },
  pickerItemActive: {
    backgroundColor: defaultColors.primary,
    borderColor: defaultColors.primary,
  },
  pickerItemText: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  pickerItemTextActive: {
    color: '#FFFFFF',
  },
  channelScroll: {
    flexDirection: 'row',
  },
  channelChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.sm,
    marginRight: spacing.sm,
    borderWidth: 1,
    borderColor: '#2A3040',
  },
  channelChipActive: {
    backgroundColor: defaultColors.primary,
    borderColor: defaultColors.primary,
  },
  channelChipText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  channelChipTextActive: {
    color: '#FFFFFF',
  },
  toggleGroup: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.sm,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2A3040',
  },
  toggleBtnActive: {
    backgroundColor: defaultColors.primary,
    borderColor: defaultColors.primary,
  },
  toggleBtnText: {
    fontSize: typography.fontSize.sm,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },
  searchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    backgroundColor: defaultColors.primary,
    borderRadius: borderRadius.md,
    marginTop: spacing.md,
  },
  searchBtnDisabled: {
    opacity: 0.5,
  },
  searchBtnText: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderRadius: borderRadius.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
  },
  errorText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    color: '#EF4444',
  },
  videoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  videoInfo: {
    flex: 1,
  },
  videoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  channelBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: defaultColors.primary,
    borderRadius: 4,
  },
  channelBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  alarmBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    backgroundColor: '#F59E0B',
    borderRadius: 4,
  },
  alarmBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  videoMeta: {
    flexDirection: 'row',
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
  videoActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    backgroundColor: '#2A3040',
    borderRadius: borderRadius.sm,
  },
  actionBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: defaultColors.primary,
  },
  downloadBtn: {
    backgroundColor: defaultColors.primary,
  },
  downloadBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tasksList: {
    marginTop: spacing.md,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.lg,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    backgroundColor: '#1a1a2e',
    borderRadius: borderRadius.md,
    marginBottom: spacing.sm,
  },
  taskInfo: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  taskStatus: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 4,
  },
  taskStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  taskChannel: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  taskTime: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  progressBar: {
    height: 20,
    backgroundColor: '#2A3040',
    borderRadius: 10,
    marginTop: spacing.xs,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  progressFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: defaultColors.primary,
    borderRadius: 10,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  taskActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
});
