/**
 * 錄像下載卡片元件
 * 
 * 在車輛詳情頁的實時監控區域顯示錄像下載功能
 * 支援：
 * - 按日期範圍查詢錄像
 * - 選擇通道
 * - 創建下載任務
 * - 查看下載任務狀態
 */

import { useState, useCallback, useEffect } from 'react';
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
  Download, 
  Calendar, 
  Clock, 
  HardDrive, 
  ChevronRight, 
  AlertCircle, 
  CheckCircle, 
  Play,
  RefreshCw,
  WifiOff,
  Trash2,
  ExternalLink,
} from 'lucide-react-native';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { gps808Api, type VideoFileInfo, type DownloadTask } from '@/utils/gps808Api';
import { useGps808Store } from '@/store/gps808Store';
import { colors, borderRadius, spacing, typography } from '@/constants/theme';
import { useTranslation } from '@/i18n';
import { defaultColors } from '@/store/themeStore';

const IS_WEB = Platform.OS === 'web';

interface VideoRecordingCardProps {
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
  // 時段選擇
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

export function VideoRecordingCard({
  devIdno,
  plateNumber,
  height = 320,
}: VideoRecordingCardProps) {
  const { t } = useTranslation();
  const { isConnected } = useGps808Store();
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [videoFiles, setVideoFiles] = useState<VideoFileInfo[]>([]);
  const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showResults, setShowResults] = useState(false);
  const [expandedSection, setExpandedSection] = useState<'search' | 'tasks' | null>(null);

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

  const handleSearch = useCallback(async () => {
    if (!isConnected) {
      setError('GPS 尚未連線');
      return;
    }

    setIsLoading(true);
    setError(null);
    setShowResults(false);

    try {
      // 將時分轉換為秒數
      const begSeconds = params.begHour * 3600 + params.begMinute * 60;
      const endSeconds = params.endHour * 3600 + params.endMinute * 60;

      // 除錯：列印查詢參數
      console.log('[VideoRecording] 查詢參數:', {
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

      console.log('[VideoRecording] 查詢結果:', result);

      if (result.result === 0 && result.videoFiles) {
        setVideoFiles(result.videoFiles);
        setShowResults(true);
        if (result.videoFiles.length === 0) {
          setError('查詢時間範圍內沒有找到錄像檔案');
        }
      } else {
        setError(result.error || `查詢失敗 (錯誤碼: ${result.result})`);
      }
    } catch (err) {
      console.error('[VideoRecording] 查詢錯誤:', err);
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
        // 只顯示該設備的任務
        const deviceTasks = result.tasks.filter(task => 
          task.devIdno === devIdno || task.did === devIdno
        );
        setDownloadTasks(deviceTasks);
      }
    } catch (err) {
      console.error('刷新下載任務失敗:', err);
    }
  }, [devIdno]);

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

  // 組件掛載時刷新任務列表
  useEffect(() => {
    if (isConnected) {
      handleRefreshTasks();
    }
  }, [isConnected, handleRefreshTasks]);

  const adjustDate = (type: 'start' | 'end', delta: number) => {
    setParams(p => {
      const newParams = { ...p };
      if (type === 'start') {
        // 調整日期
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

  // 計算選中日期的錄像統計
  const activeTasksCount = downloadTasks.filter(t => t.taskStatus === 1).length;
  const completedTasksCount = downloadTasks.filter(t => t.taskStatus === 4).length;

  return (
    <View style={[styles.container, { height }]}>
      {/* 標題區 */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Video size={18} color={defaultColors.primary} />
          <Text style={styles.title}>錄像下載</Text>
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
        {/* 快速操作區 */}
        <View style={styles.quickActions}>
          <Pressable
            style={[
              styles.quickActionBtn,
              expandedSection === 'search' && styles.quickActionBtnActive
            ]}
            onPress={() => setExpandedSection(expandedSection === 'search' ? null : 'search')}
          >
            <Calendar size={16} color={expandedSection === 'search' ? '#FFFFFF' : defaultColors.primary} />
            <Text style={[
              styles.quickActionText,
              expandedSection === 'search' && styles.quickActionTextActive
            ]}>
              查詢錄像
            </Text>
          </Pressable>
          
          <Pressable
            style={[
              styles.quickActionBtn,
              expandedSection === 'tasks' && styles.quickActionBtnActive
            ]}
            onPress={() => {
              setExpandedSection(expandedSection === 'tasks' ? null : 'tasks');
              if (expandedSection !== 'tasks') {
                handleRefreshTasks();
              }
            }}
          >
            <Download size={16} color={expandedSection === 'tasks' ? '#FFFFFF' : defaultColors.primary} />
            <Text style={[
              styles.quickActionText,
              expandedSection === 'tasks' && styles.quickActionTextActive
            ]}>
              下載任務 {downloadTasks.length > 0 && `(${downloadTasks.length})`}
            </Text>
          </Pressable>
        </View>

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
        {expandedSection === 'search' && (
          <View style={styles.section}>
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
            {showResults && videoFiles.length > 0 && (
              <View style={styles.resultsSection}>
                <View style={styles.resultsHeader}>
                  <Text style={styles.resultsTitle}>查到 {videoFiles.length} 個檔案</Text>
                </View>
                <ScrollView 
                  style={styles.resultsList}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {videoFiles.slice(0, 5).map((file, index) => (
                    <View key={file.filePath || index} style={styles.resultItem}>
                      <View style={styles.resultInfo}>
                        <View style={styles.resultChannel}>
                          <Text style={styles.resultChannelText}>
                            {channelLabels[file.chn || params.channel] || `CH${file.chn || params.channel}`}
                          </Text>
                        </View>
                        <Text style={styles.resultTime}>
                          {formatDateTime(file.beginTime)}
                        </Text>
                        <Text style={styles.resultSize}>
                          {formatFileSize(file.fileSize)}
                        </Text>
                      </View>
                      <View style={styles.resultActions}>
                        {file.playUrl && (
                          <Pressable
                            style={styles.resultBtn}
                            onPress={() => handleOpenVideoUrl(file)}
                          >
                            <Play size={12} color={defaultColors.primary} />
                          </Pressable>
                        )}
                        <Pressable
                          style={styles.resultDownloadBtn}
                          onPress={() => handleDownload(file)}
                          disabled={isDownloading}
                        >
                          <Download size={12} color="#FFFFFF" />
                        </Pressable>
                      </View>
                    </View>
                  ))}
                  {videoFiles.length > 5 && (
                    <Text style={styles.moreText}>
                      還有 {videoFiles.length - 5} 個檔案...
                    </Text>
                  )}
                </ScrollView>
              </View>
            )}
          </View>
        )}

        {/* 下載任務區域 */}
        {expandedSection === 'tasks' && (
          <View style={styles.section}>
            <View style={styles.tasksHeader}>
              <Text style={styles.tasksTitle}>
                下載任務 ({activeTasksCount > 0 && `下載中 ${activeTasksCount}, `}已完成 {completedTasksCount})
              </Text>
              <Pressable onPress={handleRefreshTasks} style={styles.refreshBtn}>
                <RefreshCw size={14} color={colors.textSecondary} />
              </Pressable>
            </View>
            
            {downloadTasks.length === 0 ? (
              <View style={styles.emptyTasks}>
                <Text style={styles.emptyText}>暫無下載任務</Text>
                <Text style={styles.emptySubtext}>查詢並下載錄像後，任務會顯示在這裡</Text>
              </View>
            ) : (
              <ScrollView 
                style={styles.tasksList}
                nestedScrollEnabled
                showsVerticalScrollIndicator={false}
              >
                {downloadTasks.map((task, index) => (
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
                        {task.beginTime ? task.beginTime.split(' ')[0] : '--'} ~ {task.endTime ? task.endTime.split(' ')[0] : '--'}
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
                          style={styles.taskDownloadBtn}
                          onPress={() => handleDownloadTaskFile(task)}
                        >
                          <Download size={12} color="#FFFFFF" />
                        </Pressable>
                      )}
                      <Pressable
                        style={styles.taskDeleteBtn}
                        onPress={() => handleDeleteTask(task.TaskID || task.id || '')}
                      >
                        <Trash2 size={12} color="#EF4444" />
                      </Pressable>
                    </View>
                  </View>
                ))}
              </ScrollView>
            )}
          </View>
        )}

        {/* 快捷入口提示 */}
        {!expandedSection && (
          <View style={styles.hint}>
            <Text style={styles.hintText}>
              點擊上方按鈕查詢錄像或查看下載任務
            </Text>
          </View>
        )}
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
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  quickActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  quickActionBtnActive: {
    backgroundColor: defaultColors.primary,
    borderColor: defaultColors.primary,
  },
  quickActionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: defaultColors.primary,
  },
  quickActionTextActive: {
    color: '#FFFFFF',
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
  // 時段選擇器樣式
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
  resultsList: {
    maxHeight: 180,
  },
  resultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  resultInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
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
  resultTime: {
    fontSize: typography.fontSize.xs,
    color: colors.textSecondary,
    flex: 1,
  },
  resultSize: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
  },
  resultActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  resultBtn: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultDownloadBtn: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    backgroundColor: defaultColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreText: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  tasksHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  tasksTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  refreshBtn: {
    padding: spacing.xs,
  },
  emptyTasks: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    color: colors.textTertiary,
    fontWeight: '600',
  },
  emptySubtext: {
    fontSize: typography.fontSize.xs,
    color: colors.textTertiary,
    marginTop: spacing.xs,
  },
  tasksList: {
    maxHeight: 200,
  },
  taskItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm,
    backgroundColor: colors.surface,
    borderRadius: borderRadius.sm,
    marginBottom: spacing.xs,
  },
  taskInfo: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    marginBottom: 2,
  },
  taskStatus: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: 4,
  },
  taskStatusText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
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
    height: 16,
    backgroundColor: colors.background,
    borderRadius: 8,
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
    borderRadius: 8,
  },
  progressText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  taskActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  taskDownloadBtn: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    backgroundColor: defaultColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskDeleteBtn: {
    width: 28,
    height: 28,
    borderRadius: borderRadius.sm,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  hint: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  hintText: {
    fontSize: typography.fontSize.sm,
    color: colors.textTertiary,
  },
});
