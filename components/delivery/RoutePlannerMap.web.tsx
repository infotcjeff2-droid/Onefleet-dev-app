import React from 'react';
import { View, StyleSheet, Text, StyleProp, ViewStyle } from 'react-native';
import { colors } from '@/constants/theme';
import { MapPin, Navigation } from 'lucide-react-native';

interface Waypoint {
  address: string;
  lat?: number;
  lng?: number;
  type: 'pickup' | 'dropoff' | 'start' | 'end' | 'stop';
  orderNo?: string;
}

interface RoutePlannerMapProps {
  waypoints: Waypoint[];
  style?: StyleProp<ViewStyle>;
}

export function RoutePlannerMap({ waypoints, style }: RoutePlannerMapProps) {
  const validWaypoints = waypoints.filter(
    (wp): wp is Waypoint & { lat: number; lng: number } =>
      typeof wp.lat === 'number' && Number.isFinite(wp.lat) &&
      typeof wp.lng === 'number' && Number.isFinite(wp.lng)
  );

  const getMarkerColor = (type: Waypoint['type']) => {
    switch (type) {
      case 'start':
      case 'pickup':
        return colors.primary;
      case 'end':
      case 'dropoff':
        return colors.danger;
      default:
        return colors.accent;
    }
  };

  return (
    <View style={[styles.container, style]}>
      <View style={styles.webContainer}>
        <View style={styles.header}>
          <MapPin size={20} color={colors.primary} />
          <Text style={styles.headerText}>路線預覽</Text>
          <Text style={styles.headerSubtext}>
            {validWaypoints.length} 個站點
          </Text>
        </View>

        <View style={styles.stopsList}>
          {validWaypoints.length === 0 ? (
            <View style={styles.emptyState}>
              <MapPin size={28} color={colors.textTertiary} />
              <Text style={styles.emptyText}>尚無站點資料</Text>
              <Text style={styles.emptySubtext}>請選擇配送點以顯示路線</Text>
            </View>
          ) : (
            validWaypoints.map((wp, i) => (
              <View key={`${wp.type}-${i}-${wp.address}`} style={styles.stopRow}>
                <View
                  style={[
                    styles.stopNumber,
                    { backgroundColor: getMarkerColor(wp.type) },
                  ]}
                >
                  <Text style={styles.stopNumberText}>{i + 1}</Text>
                </View>
                <View style={styles.stopContent}>
                  <Text style={styles.stopType}>
                    {wp.type === 'pickup' ? '取貨點' : wp.type === 'dropoff' ? '送貨點' : '站點'}
                  </Text>
                  <Text style={styles.stopAddress} numberOfLines={2}>
                    {wp.address}
                  </Text>
                </View>
                {typeof wp.lat === 'number' && Number.isFinite(wp.lat) &&
                  typeof wp.lng === 'number' && Number.isFinite(wp.lng) && (
                  <View style={styles.coordsContainer}>
                    <Text style={styles.coords}>
                      {wp.lat.toFixed(4)}
                    </Text>
                    <Text style={styles.coords}>
                      {wp.lng.toFixed(4)}
                    </Text>
                  </View>
                )}
              </View>
            ))
          )}
        </View>

        {/* 模擬地圖視覺 */}
        {validWaypoints.length > 0 && (
          <View style={styles.miniMap}>
            <View style={styles.miniMapGrid}>
              {validWaypoints.map((wp, i) => {
                const lats = validWaypoints.map((w) => w.lat);
                const lngs = validWaypoints.map((w) => w.lng);
                const minLat = Math.min(...lats);
                const maxLat = Math.max(...lats);
                const minLng = Math.min(...lngs);
                const maxLng = Math.max(...lngs);
                const rangeLat = maxLat - minLat || 0.01;
                const rangeLng = maxLng - minLng || 0.01;
                const x = ((wp.lng - minLng) / rangeLng) * 80 + 10;
                const y = 80 - ((wp.lat - minLat) / rangeLat) * 60 + 10;

                return (
                  <View
                    key={`dot-${i}`}
                    style={[
                      styles.mapDot,
                      {
                        left: `${x}%`,
                        top: `${y}%`,
                        backgroundColor: getMarkerColor(wp.type),
                      },
                    ]}
                  >
                    <Text style={styles.mapDotText}>{i + 1}</Text>
                  </View>
                );
              })}
              {/* 連接線 */}
              {validWaypoints.map((wp, i) => {
                if (i === validWaypoints.length - 1) return null;
                const next = validWaypoints[i + 1];
                const lats = validWaypoints.map((w) => w.lat);
                const lngs = validWaypoints.map((w) => w.lng);
                const minLat = Math.min(...lats);
                const maxLat = Math.max(...lats);
                const minLng = Math.min(...lngs);
                const maxLng = Math.max(...lngs);
                const rangeLat = maxLat - minLat || 0.01;
                const rangeLng = maxLng - minLng || 0.01;
                const x1 = ((wp.lng - minLng) / rangeLng) * 80 + 10;
                const y1 = 80 - ((wp.lat - minLat) / rangeLat) * 60 + 10;
                const x2 = ((next.lng - minLng) / rangeLng) * 80 + 10;
                const y2 = 80 - ((next.lat - minLat) / rangeLat) * 60 + 10;
                const length = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
                const angle = Math.atan2(y2 - y1, x2 - x1) * (180 / Math.PI);

                return (
                  <View
                    key={`line-${i}`}
                    style={[
                      styles.mapLine,
                      {
                        left: `${x1}%`,
                        top: `${y1}%`,
                        width: `${length}%`,
                        transform: [{ rotate: `${angle}deg` }],
                      },
                    ]}
                  />
                );
              })}
            </View>
            <Text style={styles.miniMapLabel}>
              <Navigation size={12} color={colors.textTertiary} /> 座標預覽
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  webContainer: {
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerText: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    flex: 1,
  },
  headerSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
    backgroundColor: colors.surface,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  stopsList: {
    gap: 8,
  },
  emptyState: {
    paddingVertical: 32,
    alignItems: 'center',
    gap: 4,
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  emptySubtext: {
    fontSize: 12,
    color: colors.textTertiary,
  },
  stopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    backgroundColor: colors.surface,
    borderRadius: 8,
  },
  stopNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  stopNumberText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  stopContent: {
    flex: 1,
  },
  stopType: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textTertiary,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  stopAddress: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  coordsContainer: {
    alignItems: 'flex-end',
  },
  coords: {
    fontSize: 10,
    color: colors.textTertiary,
    fontFamily: 'monospace',
  },
  miniMap: {
    backgroundColor: colors.surface,
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  miniMapGrid: {
    width: '100%',
    aspectRatio: 1.5,
    backgroundColor: colors.background,
    borderRadius: 6,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
  },
  mapDot: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 3,
  },
  mapDotText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  mapLine: {
    position: 'absolute',
    height: 2,
    backgroundColor: colors.primary,
    opacity: 0.5,
    transformOrigin: 'left center',
  },
  miniMapLabel: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 8,
    textAlign: 'center',
  },
});

export default RoutePlannerMap;
