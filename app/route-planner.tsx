import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Image,
  RefreshControl,
  TextInput,
  Platform,
} from 'react-native';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import Animated, {
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import {
  ChevronRight,
  MapPin,
  Navigation,
  Clock,
  Route,
  Zap,
  ArrowUpDown,
  ArrowRightLeft,
  Car,
  DollarSign,
  Info,
  RefreshCw,
  Plus,
  GripVertical,
  Trash2,
  ExternalLink,
  Check,
  AlertCircle,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { useThemeStore } from '@/store/themeStore';
import { useRouteConfigStore } from '@/store/routeConfigStore';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useAuthStore } from '@/store/authStore';
import { useTranslation } from '@/i18n';
import { spacing, typography, borderRadius } from '@/constants/theme';
import type { RouteWaypoint, RouteOption, DeliveryOrderRoute } from '@/types';
import {
  optimizeDeliverySequence,
  ordersToWaypoints,
  generateRouteSuggestions,
  buildDistanceMatrix,
  calculateRouteSummary,
  getCoordsFromAddress,
} from '@/utils/routeOptimizer';
import {
  generateMockRouteSuggestions,
  openExternalNavigation,
  formatDuration,
  formatDistance,
} from '@/utils/routeApi';
import { getWarehouseCoords } from '@/utils/warehouseCoords';
import { RoutePlannerMap } from '@/components/delivery/RoutePlannerMap';

function DevelopmentNotice({ onDismiss }: { onDismiss: () => void }) {
  const opacity = useSharedValue(0);
  const router = useRouter();
  const { locale } = useTranslation();

  useEffect(() => {
    // 淡入 300ms → 顯示 1500ms，總共 1800ms 後開始淡出並跳轉
    opacity.value = withSequence(
      withTiming(1, { duration: 300 }),
      withTiming(1, { duration: 1500 }),
      withTiming(0, { duration: 300 })
    );

    // 在淡出開始時（1800ms後）執行跳轉
    const timeout = setTimeout(() => {
      onDismiss();
      router.replace('/(tabs)');
    }, 1800);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <Animated.View style={[styles.devNoticeOverlay, { opacity }]}>
      <View style={styles.devNoticeContent}>
        <Text style={styles.devNoticeIcon}>🚧</Text>
        <Text style={styles.devNoticeTitle}>路線規劃</Text>
        <Text style={styles.devNoticeText}>此功能僅限管理員使用</Text>
        <Text style={styles.devNoticeSubtext}>
          {locale === 'zh-TW' ? '其他角色功能開發中，即將返回...' : 'Feature under development, returning...'}
        </Text>
      </View>
    </Animated.View>
  );
}

interface RouteStop {
  id: string;
  type: 'pickup' | 'dropoff';
  address: string;
  lat?: number;
  lng?: number;
  orderId?: string;
  orderNo?: string;
  customerName?: string;
  isCompleted?: boolean;
}

export default function RoutePlannerScreen() {
  const router = useRouter();
  const { t, locale } = useTranslation();
  const { colors } = useThemeStore();
  const { config, isConfigured, loadConfig } = useRouteConfigStore();
  const { deliveries, loadDeliveries, getDeliveriesForDriver, isLoading } = useDeliveryStore();
  const role = useAuthStore((s) => s.role);

  // 檢查是否為管理員
  const isAdmin = role === 'admin';

  // 狀態
  const [refreshing, setRefreshing] = useState(false);
  const [currentLocation, setCurrentLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(false);
  
  // 起點/終點
  const [origin, setOrigin] = useState<RouteWaypoint | null>(null);
  const [destination, setDestination] = useState<RouteWaypoint | null>(null);
  const [showOriginPicker, setShowOriginPicker] = useState(false);
  const [showDestPicker, setShowDestPicker] = useState(false);
  
  // 配送單列表
  const [stops, setStops] = useState<RouteStop[]>([]);
  const [selectedStops, setSelectedStops] = useState<string[]>([]);
  
  // 路線建議
  const [routeSuggestions, setRouteSuggestions] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [currentStopIndex, setCurrentStopIndex] = useState(0);

  // 獲取司機的配送單
  const driverDeliveries = getDeliveriesForDriver(''); // 空字串會返回所有配送單

  // 載入資料
  useEffect(() => {
    loadConfig();
    loadDeliveries();
    getCurrentLocation();
  }, []);

  // 根據配送單初始化路線
  useEffect(() => {
    if (deliveries.length > 0) {
      initRouteFromDeliveries();
    }
  }, [deliveries]);

  // 獲取目前位置
  const getCurrentLocation = async () => {
    setIsLoadingLocation(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const location = await Location.getCurrentPositionAsync({});
        setCurrentLocation({
          lat: location.coords.latitude,
          lng: location.coords.longitude,
        });
      }
    } catch (error) {
      console.error('[RoutePlanner] getCurrentLocation error:', error);
    } finally {
      setIsLoadingLocation(false);
    }
  };

  // 從配送單初始化路線
  const initRouteFromDeliveries = useCallback(() => {
    // 只取得當天的訂單
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const activeOrders = deliveries.filter((d) => {
      const orderDate = new Date(d.pickupDate || d.createdAt || Date.now());
      return orderDate >= today && orderDate < tomorrow &&
        (d.status === 'assigned' || d.status === 'pending' || d.status === 'in_transit');
    });

    if (activeOrders.length === 0) return;

    // 創建 stops
    const newStops: RouteStop[] = [];
    for (const order of activeOrders) {
      newStops.push({
        id: `${order.id}-pickup`,
        type: 'pickup',
        address: order.pickupAddress,
        lat: order.pickupLatitude,
        lng: order.pickupLongitude,
        orderId: order.id,
        orderNo: order.orderNo,
        customerName: order.customerName,
        isCompleted: order.status === 'in_transit' || order.status === 'delivered' || order.status === 'signed',
      });
      newStops.push({
        id: `${order.id}-dropoff`,
        type: 'dropoff',
        address: order.dropoffAddress,
        lat: order.dropoffLatitude,
        lng: order.dropoffLongitude,
        orderId: order.id,
        orderNo: order.orderNo,
        customerName: order.customerName,
        isCompleted: order.status === 'delivered' || order.status === 'signed',
      });
    }

    setStops(newStops);
    setSelectedStops(newStops.map((s) => s.id));

    // 設置起點和終點
    if (config.defaultStartLocation === 'driver_gps' && currentLocation) {
      setOrigin({
        type: 'start',
        address: '目前位置',
        lat: currentLocation.lat,
        lng: currentLocation.lng,
      });
    } else if (config.defaultStartLocation === 'depot' && config.depotAddress) {
      const depotCoords = config.depotCoords || getCoordsFromAddress(config.depotAddress);
      setOrigin({
        type: 'depot',
        address: config.depotAddress,
        lat: depotCoords.lat,
        lng: depotCoords.lng,
      });
    } else {
      // 使用第一個取貨點
      setOrigin({
        type: 'start',
        address: activeOrders[0].pickupAddress,
        lat: activeOrders[0].pickupLatitude,
        lng: activeOrders[0].pickupLongitude,
      });
    }

    if (config.defaultEndLocation === 'depot' && config.depotAddress) {
      const depotCoords = config.depotCoords || getCoordsFromAddress(config.depotAddress);
      setDestination({
        type: 'end',
        address: config.depotAddress,
        lat: depotCoords.lat,
        lng: depotCoords.lng,
      });
    } else if (config.defaultEndLocation === 'last_task_destination') {
      const lastOrder = activeOrders[activeOrders.length - 1];
      setDestination({
        type: 'end',
        address: lastOrder.dropoffAddress,
        lat: lastOrder.dropoffLatitude,
        lng: lastOrder.dropoffLongitude,
      });
    }
  }, [deliveries, config, currentLocation]);

  // 切換起點/終點
  const swapOriginDestination = () => {
    const tempOrigin = origin;
    setOrigin(destination);
    setDestination(tempOrigin);
  };

  // 計算路線
  const calculateRoutes = async () => {
    if (selectedStops.length < 2) {
      Alert.alert('提示', '請選擇至少 2 個配送點');
      return;
    }

    setIsCalculating(true);
    try {
      // 構建途經點
      const waypoints: RouteWaypoint[] = stops
        .filter((s) => selectedStops.includes(s.id))
        .map((s) => ({
          type: s.type,
          address: s.address,
          lat: s.lat,
          lng: s.lng,
          orderId: s.orderId,
          orderNo: s.orderNo,
          customerName: s.customerName,
        }));

      // 如果有起點，加入到前面
      if (origin) {
        waypoints.unshift(origin);
      }

      // 如果有終點，加入到最後
      if (destination) {
        waypoints.push(destination);
      }

      // 生成路線建議
      const suggestions = generateMockRouteSuggestions(waypoints);
      setRouteSuggestions(suggestions);
      
      // 自動選擇推薦路線
      const recommended = suggestions.find((s) => s.isRecommended);
      setSelectedRoute(recommended || suggestions[0]);
    } catch (error) {
      console.error('[RoutePlanner] calculateRoutes error:', error);
      Alert.alert('錯誤', '路線計算失敗');
    } finally {
      setIsCalculating(false);
    }
  };

  // AI 自動優化順序
  const optimizeSequence = async () => {
    if (selectedStops.length < 2) return;

    setIsCalculating(true);
    try {
      const selectedStopsData = stops.filter((s) => selectedStops.includes(s.id));
      const waypoints: RouteWaypoint[] = selectedStopsData.map((s) => ({
        type: s.type,
        address: s.address,
        lat: s.lat,
        lng: s.lng,
        orderId: s.orderId,
        orderNo: s.orderNo,
        customerName: s.customerName,
      }));

      const optimizedOrder = optimizeDeliverySequence(waypoints);
      
      // 重新排序 selectedStops
      const newOrder = optimizedOrder.map((idx) => selectedStopsData[idx].id);
      setSelectedStops(newOrder);
      
      // 重新計算路線
      await calculateRoutes();
    } catch (error) {
      console.error('[RoutePlanner] optimizeSequence error:', error);
    } finally {
      setIsCalculating(false);
    }
  };

  // 導航到下一站
  const navigateToNext = () => {
    if (!selectedRoute || currentStopIndex >= selectedRoute.waypoints.length - 1) return;

    const nextWaypoint = selectedRoute.waypoints[currentStopIndex + 1];
    if (nextWaypoint.lat !== undefined && nextWaypoint.lng !== undefined) {
      openExternalNavigation({
        lat: nextWaypoint.lat,
        lng: nextWaypoint.lng,
        address: nextWaypoint.address,
      });
    }
  };

  // 刷新
  const onRefresh = async () => {
    setRefreshing(true);
    await loadDeliveries();
    await getCurrentLocation();
    setRefreshing(false);
  };

  // 切換配送點選擇
  const toggleStopSelection = (stopId: string) => {
    setSelectedStops((prev) =>
      prev.includes(stopId)
        ? prev.filter((id) => id !== stopId)
        : [...prev, stopId]
    );
  };

  // 渲染起點/終點選擇器
  const renderLocationSelector = (
    label: string,
    value: RouteWaypoint | null,
    onPress: () => void,
    icon: 'origin' | 'destination'
  ) => (
    <Pressable
      style={[styles.locationSelector, { backgroundColor: colors.surface, borderColor: colors.border }]}
      onPress={onPress}
    >
      <View style={[styles.locationIcon, { backgroundColor: icon === 'origin' ? `${colors.success}20` : `${colors.danger}20` }]}>
        {icon === 'origin' ? (
          <MapPin size={16} color={colors.success} />
        ) : (
          <Navigation size={16} color={colors.danger} />
        )}
      </View>
      <View style={styles.locationInfo}>
        <Text style={[styles.locationLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Text style={[styles.locationValue, { color: colors.textPrimary }]} numberOfLines={1}>
          {value?.address || '點擊選擇'}
        </Text>
      </View>
      <ChevronRight size={16} color={colors.textTertiary} />
    </Pressable>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="路線規劃"
        showBack
      />

      {/* 非管理員顯示開發中提示 */}
      {!isAdmin && <DevelopmentNotice onDismiss={() => {}} />}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* 起點/終點選擇器 */}
        <Card style={styles.card}>
          <View style={styles.originDestRow}>
            <View style={styles.originPicker}>
              {renderLocationSelector('起點', origin, () => setShowOriginPicker(true), 'origin')}
            </View>
            <Pressable style={styles.swapButton} onPress={swapOriginDestination}>
              <ArrowRightLeft size={18} color={colors.primary} />
            </Pressable>
            <View style={styles.destPicker}>
              {renderLocationSelector('終點', destination, () => setShowDestPicker(true), 'destination')}
            </View>
          </View>
        </Card>

        {/* 地圖顯示 */}
        <Card style={styles.card}>
          <Text style={[styles.cardTitle, { color: colors.textPrimary }]}>
            路線地圖
          </Text>
          <RoutePlannerMap
            waypoints={selectedStops.length > 0
              ? stops.filter((s) => selectedStops.includes(s.id)).map((s) => ({
                  address: s.address,
                  lat: s.lat,
                  lng: s.lng,
                  type: s.type,
                  orderNo: s.orderNo,
                }))
              : stops.map((s) => ({
                  address: s.address,
                  lat: s.lat,
                  lng: s.lng,
                  type: s.type,
                  orderNo: s.orderNo,
                }))
            }
            style={styles.routeMap}
          />
        </Card>

        {/* 快速切換按鈕 */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.quickChips}>
          {(() => {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);
            const todayDeliveries = deliveries.filter((d) => {
              const orderDate = new Date(d.pickupDate || d.createdAt || Date.now());
              return orderDate >= today && orderDate < tomorrow;
            });
            return todayDeliveries.slice(0, 5).map((delivery) => (
              <Pressable
                key={delivery.id}
                style={[styles.quickChip, { backgroundColor: colors.surface, borderColor: colors.border }]}
                onPress={() => {
                  setOrigin({
                    type: 'start',
                    address: delivery.pickupAddress,
                    lat: delivery.pickupLatitude,
                    lng: delivery.pickupLongitude,
                  });
                  setDestination({
                    type: 'end',
                    address: delivery.dropoffAddress,
                    lat: delivery.dropoffLatitude,
                    lng: delivery.dropoffLongitude,
                  });
                }}
              >
                <Text style={[styles.quickChipText, { color: colors.textPrimary }]}>{delivery.orderNo}</Text>
              </Pressable>
            ));
          })()}
        </ScrollView>

        {/* 配送點列表 */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              配送點 ({selectedStops.length}/{stops.length})
            </Text>
            {config.enableTspOptimization && (
              <Pressable style={styles.optimizeButton} onPress={optimizeSequence}>
                <Zap size={14} color={colors.accentSecondary} />
                <Text style={[styles.optimizeButtonText, { color: colors.accentSecondary }]}>
                  AI 優化
                </Text>
              </Pressable>
            )}
          </View>

          {stops.map((stop, index) => (
            <Pressable
              key={stop.id}
              style={[
                styles.stopItem,
                {
                  backgroundColor: selectedStops.includes(stop.id) ? colors.card : 'transparent',
                  borderColor: selectedStops.includes(stop.id) ? colors.primary : colors.border,
                },
              ]}
              onPress={() => toggleStopSelection(stop.id)}
            >
              <View style={styles.stopIndex}>
                {selectedStops.includes(stop.id) ? (
                  <Text style={[styles.stopIndexText, { color: colors.primary }]}>
                    {selectedStops.indexOf(stop.id) + 1}
                  </Text>
                ) : (
                  <GripVertical size={14} color={colors.textTertiary} />
                )}
              </View>
              <View style={[styles.stopTypeIcon, { backgroundColor: stop.type === 'pickup' ? `${colors.success}20` : `${colors.primary}20` }]}>
                {stop.type === 'pickup' ? (
                  <ArrowUpDown size={12} color={colors.success} />
                ) : (
                  <Navigation size={12} color={colors.primary} style={{ transform: [{ rotate: '45deg' }] }} />
                )}
              </View>
              <View style={styles.stopInfo}>
                <Text style={[styles.stopType, { color: stop.type === 'pickup' ? colors.success : colors.primary }]}>
                  {stop.type === 'pickup' ? '取貨' : '送貨'}
                </Text>
                <Text style={[styles.stopAddress, { color: colors.textPrimary }]} numberOfLines={2}>
                  {stop.address}
                </Text>
                <Text style={[styles.stopMeta, { color: colors.textTertiary }]}>
                  {stop.orderNo} · {stop.customerName}
                </Text>
              </View>
              {stop.isCompleted && (
                <View style={[styles.completedBadge, { backgroundColor: `${colors.success}20` }]}>
                  <Check size={12} color={colors.success} />
                </View>
              )}
              <Pressable
                style={styles.deleteStop}
                onPress={() => setStops((prev) => prev.filter((s) => s.id !== stop.id))}
              >
                <Trash2 size={14} color={colors.danger} />
              </Pressable>
            </Pressable>
          ))}

          {stops.length === 0 && (
            <View style={[styles.emptyState, { backgroundColor: colors.surface }]}>
              <Info size={24} color={colors.textTertiary} />
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
                目前沒有待配送的訂單
              </Text>
              <Button
                title="刷新"
                variant="ghost"
                onPress={onRefresh}
                style={{ marginTop: spacing.md }}
              />
            </View>
          )}
        </View>

        {/* 計算路線按鈕 */}
        <Button
          title={isCalculating ? '計算中...' : '計算最佳路線'}
          onPress={calculateRoutes}
          loading={isCalculating}
          disabled={selectedStops.length < 2}
          style={{ marginTop: spacing.lg }}
          icon={<Route size={18} color="#FFFFFF" />}
        />

        {/* 路線建議卡片 */}
        {routeSuggestions.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
              建議路線
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {routeSuggestions.map((route) => (
                <Pressable
                  key={route.id}
                  style={[
                    styles.routeCard,
                    {
                      backgroundColor: selectedRoute?.id === route.id ? colors.primaryGlow : colors.surface,
                      borderColor: selectedRoute?.id === route.id ? colors.primary : colors.border,
                    },
                  ]}
                  onPress={() => setSelectedRoute(route)}
                >
                  {route.isRecommended && (
                    <Badge label="推薦" variant="active" style={styles.recommendedBadge} />
                  )}
                  <View style={styles.routeCardContent}>
                    <Text style={[styles.routeTitle, { color: colors.textPrimary }]}>
                      {route.title}
                    </Text>
                    <Text style={[styles.routeSubtitle, { color: colors.textSecondary }]}>
                      {route.subtitle}
                    </Text>
                    <View style={styles.routeStats}>
                    <View style={styles.routeStat}>
                      <Clock size={14} color={colors.textTertiary} />
                      <Text style={[styles.routeStatText, { color: colors.textPrimary }]}>
                        {formatDuration(route.totalDurationMin)}
                      </Text>
                    </View>
                    <View style={styles.routeStat}>
                      <MapPin size={14} color={colors.textTertiary} />
                      <Text style={[styles.routeStatText, { color: colors.textPrimary }]}>
                        {formatDistance(route.totalDistanceKm)}
                      </Text>
                    </View>
                  </View>
                  {route.tollFeeEstimated !== undefined && route.tollFeeEstimated > 0 && (
                    <View style={styles.routeStat}>
                      <DollarSign size={14} color={colors.accentSecondary} />
                      <Text style={[styles.routeStatText, { color: colors.accentSecondary }]}>
                        HKD {route.tollFeeEstimated}
                      </Text>
                    </View>
                  )}
                  {route.hasHighway && (
                    <View style={styles.routeTag}>
                      <Car size={10} color={colors.secondary} />
                      <Text style={[styles.routeTagText, { color: colors.secondary }]}>高速</Text>
                    </View>
                  )}
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* 已選擇路線的詳細視圖 */}
        {selectedRoute && (
          <Card style={styles.card}>
            <View style={styles.selectedRouteHeader}>
              <Text style={[styles.selectedRouteTitle, { color: colors.textPrimary }]}>
                {selectedRoute.title}
              </Text>
              <Text style={[styles.selectedRouteSubtitle, { color: colors.textSecondary }]}>
                {selectedRoute.subtitle}
              </Text>
            </View>

            {/* 路線概覽 */}
            <View style={styles.routeOverview}>
              <View style={styles.overviewItem}>
                <Text style={[styles.overviewValue, { color: colors.primary }]}>
                  {formatDuration(selectedRoute.totalDurationMin)}
                </Text>
                <Text style={[styles.overviewLabel, { color: colors.textSecondary }]}>預計時間</Text>
              </View>
              <View style={[styles.overviewDivider, { backgroundColor: colors.border }]} />
              <View style={styles.overviewItem}>
                <Text style={[styles.overviewValue, { color: colors.primary }]}>
                  {formatDistance(selectedRoute.totalDistanceKm)}
                </Text>
                <Text style={[styles.overviewLabel, { color: colors.textSecondary }]}>總距離</Text>
              </View>
              <View style={[styles.overviewDivider, { backgroundColor: colors.border }]} />
              <View style={styles.overviewItem}>
                <Text style={[styles.overviewValue, { color: colors.primary }]}>
                  {selectedRoute.waypoints.length}
                </Text>
                <Text style={[styles.overviewLabel, { color: colors.textSecondary }]}>站點數</Text>
              </View>
            </View>

            {/* 站點列表 */}
            <View style={styles.waypointsList}>
              {selectedRoute.waypoints.map((waypoint, index) => (
                <View key={`${waypoint.address}-${index}`} style={styles.waypointItem}>
                  <View style={[styles.waypointLine, { backgroundColor: colors.border }]}>
                    <View style={[
                      styles.waypointDot,
                      {
                        backgroundColor: index === currentStopIndex ? colors.primary : colors.surface,
                        borderColor: colors.primary,
                      },
                    ]}>
                      {index < currentStopIndex && <Check size={10} color="#FFFFFF" />}
                    </View>
                  </View>
                  <Pressable
                    style={[
                      styles.waypointContent,
                      index === currentStopIndex && { backgroundColor: colors.primaryGlow },
                    ]}
                    onPress={() => {
                      if (waypoint.lat !== undefined && waypoint.lng !== undefined) {
                        openExternalNavigation({
                          lat: waypoint.lat,
                          lng: waypoint.lng,
                          address: waypoint.address,
                        });
                      }
                    }}
                  >
                    <Text style={[styles.waypointType, { color: colors.textSecondary }]}>
                      {index === 0 ? '起點' : index === selectedRoute.waypoints.length - 1 ? '終點' : `站點 ${index}`}
                    </Text>
                    <Text style={[styles.waypointAddress, { color: colors.textPrimary }]} numberOfLines={2}>
                      {waypoint.address}
                    </Text>
                    {waypoint.orderNo && (
                      <Text style={[styles.waypointOrder, { color: colors.primary }]}>
                        {waypoint.orderNo}
                      </Text>
                    )}
                  </Pressable>
                </View>
              ))}
            </View>

            {/* 導航按鈕 */}
            <View style={styles.navActions}>
              <Button
                title={`前往下一站 (${currentStopIndex + 1}/${selectedRoute.waypoints.length})`}
                onPress={navigateToNext}
                disabled={currentStopIndex >= selectedRoute.waypoints.length - 1}
                icon={<Navigation size={18} color="#FFFFFF" />}
                style={{ flex: 1 }}
              />
            </View>
          </Card>
        )}

        {/* API 狀態提示 */}
        {!isConfigured && (
          <View style={[styles.apiWarning, { backgroundColor: `${colors.warning}15` }]}>
            <AlertCircle size={18} color={colors.warning} />
            <Text style={[styles.apiWarningText, { color: colors.textPrimary }]}>
              地圖 API 未設定，路線計算使用估算模式。
              {'\n'}
              <Text
                style={{ color: colors.primary }}
                onPress={() => router.push('/onefleet-system-admin/settings/route-config')}
              >
                前往設定
              </Text>
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { padding: spacing.lg, paddingBottom: 100 },
  // Development Notice styles
  devNoticeOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.92)',
    zIndex: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devNoticeContent: {
    alignItems: 'center',
    padding: spacing['3xl'],
  },
  devNoticeIcon: {
    fontSize: 64,
    marginBottom: spacing.lg,
  },
  devNoticeTitle: {
    fontSize: typography.fontSize['2xl'],
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: spacing.md,
  },
  devNoticeText: {
    fontSize: typography.fontSize.lg,
    color: '#FFFFFF',
    marginBottom: spacing.sm,
  },
  devNoticeSubtext: {
    fontSize: typography.fontSize.base,
    color: 'rgba(255, 255, 255, 0.6)',
  },
  card: { marginBottom: spacing.lg, padding: spacing.lg },
  section: { marginBottom: spacing.lg },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  originDestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  originPicker: { flex: 1 },
  destPicker: { flex: 1 },
  swapButton: {
    padding: spacing.sm,
  },
  locationSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: spacing.sm,
    gap: spacing.sm,
  },
  locationIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationInfo: { flex: 1 },
  locationLabel: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
  },
  locationValue: {
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  quickChips: {
    marginBottom: spacing.md,
    marginHorizontal: -spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  cardTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  routeMap: {
    height: 280,
  },
  quickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: 20,
    marginRight: spacing.sm,
    borderWidth: 1,
  },
  quickChipText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '500',
  },
  optimizeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: 16,
  },
  optimizeButtonText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
  },
  stopItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    borderWidth: 1,
    borderRadius: spacing.sm,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  stopIndex: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopIndexText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
  },
  stopTypeIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stopInfo: { flex: 1 },
  stopType: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
  },
  stopAddress: {
    fontSize: typography.fontSize.sm,
    marginTop: 2,
  },
  stopMeta: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  completedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteStop: {
    padding: spacing.xs,
  },
  emptyState: {
    padding: spacing.xl,
    borderRadius: spacing.md,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: typography.fontSize.sm,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  routeCard: {
    width: 200,
    padding: spacing.md,
    borderRadius: spacing.md,
    borderWidth: 1,
    marginRight: spacing.md,
  },
  recommendedBadge: {
    marginBottom: spacing.sm,
  },
  routeCardContent: {
    marginTop: spacing.xs,
  },
  routeTitle: {
    fontSize: typography.fontSize.base,
    fontWeight: '700',
    marginBottom: 4,
  },
  routeSubtitle: {
    fontSize: typography.fontSize.xs,
    marginBottom: spacing.sm,
  },
  routeStats: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.xs,
  },
  routeStat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  routeStatText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  routeTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.xs,
  },
  routeTagText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '500',
  },
  selectedRouteHeader: {
    marginBottom: spacing.md,
  },
  selectedRouteTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
  },
  selectedRouteSubtitle: {
    fontSize: typography.fontSize.sm,
    marginTop: 4,
  },
  routeOverview: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  overviewItem: { alignItems: 'center' },
  overviewValue: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
  },
  overviewLabel: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  overviewDivider: {
    width: 1,
    height: '100%',
  },
  waypointsList: {
    marginTop: spacing.md,
  },
  waypointItem: {
    flexDirection: 'row',
    minHeight: 80,
  },
  waypointLine: {
    width: 2,
    marginRight: spacing.md,
    alignItems: 'center',
  },
  waypointDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  waypointContent: {
    flex: 1,
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: spacing.sm,
    marginBottom: spacing.sm,
  },
  waypointType: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
    marginBottom: 2,
  },
  waypointAddress: {
    fontSize: typography.fontSize.sm,
  },
  waypointOrder: {
    fontSize: typography.fontSize.xs,
    marginTop: 4,
    fontWeight: '500',
  },
  navActions: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  apiWarning: {
    flexDirection: 'row',
    padding: spacing.md,
    borderRadius: spacing.sm,
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  apiWarningText: {
    flex: 1,
    fontSize: typography.fontSize.sm,
    lineHeight: 20,
  },
});
