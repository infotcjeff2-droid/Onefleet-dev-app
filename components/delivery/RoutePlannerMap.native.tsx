import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, Text, StyleProp, ViewStyle } from 'react-native';
import { colors } from '@/constants/theme';
import { MapPin, Navigation } from 'lucide-react-native';

interface Region {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

interface Coordinate {
  latitude: number;
  longitude: number;
}

interface Waypoint {
  address: string;
  lat?: number;
  lng?: number;
  type: 'pickup' | 'dropoff' | 'start' | 'end' | 'stop';
  orderNo?: string;
}

interface RoutePlannerMapProps {
  waypoints: Waypoint[];
  routeCoordinates?: Coordinate[];
  style?: StyleProp<ViewStyle>;
  mapType?: 'standard' | 'satellite' | 'hybrid';
}

const DEFAULT_REGION: Region = {
  latitude: 22.3193,
  longitude: 114.1694,
  latitudeDelta: 0.1,
  longitudeDelta: 0.1,
};

export function RoutePlannerMap({
  waypoints,
  routeCoordinates,
  style,
  mapType = 'standard',
}: RoutePlannerMapProps) {
  const mapRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [mapComponents, setMapComponents] = useState<any>(null);

  useEffect(() => {
    const loadMaps = async () => {
      try {
        const Maps = await import('react-native-maps');
        setMapComponents({
          MapView: Maps.default,
          Marker: Maps.Marker,
          Polyline: Maps.Polyline,
          PROVIDER_GOOGLE: Maps.PROVIDER_GOOGLE,
        });
        setMapsLoaded(true);
      } catch (error) {
        console.error('Failed to load react-native-maps:', error);
        setIsLoading(false);
      }
    };
    loadMaps();
  }, []);

  const validWaypoints = waypoints.filter(
    (wp): wp is Waypoint & { lat: number; lng: number } =>
      typeof wp.lat === 'number' && Number.isFinite(wp.lat) &&
      typeof wp.lng === 'number' && Number.isFinite(wp.lng)
  );

  const initialRegion = React.useMemo((): Region => {
    if (validWaypoints.length === 0) return DEFAULT_REGION;

    const lats = validWaypoints.map((wp) => wp.lat);
    const lngs = validWaypoints.map((wp) => wp.lng);

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const midLat = (minLat + maxLat) / 2;
    const midLng = (minLng + maxLng) / 2;
    const latDelta = Math.max((maxLat - minLat) * 1.5, 0.02);
    const lngDelta = Math.max((maxLng - minLng) * 1.5, 0.02);

    return {
      latitude: midLat,
      longitude: midLng,
      latitudeDelta: Math.min(latDelta, 2),
      longitudeDelta: Math.min(lngDelta, 2),
    };
  }, [validWaypoints]);

  useEffect(() => {
    if (mapsLoaded && validWaypoints.length > 0 && mapRef.current) {
      const coords = validWaypoints.map((wp) => ({
        latitude: wp.lat,
        longitude: wp.lng,
      }));
      setTimeout(() => {
        if (coords.length > 1) {
          mapRef.current?.fitToCoordinates(coords, {
            edgePadding: { top: 80, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        } else {
          mapRef.current?.animateToRegion(
            {
              latitude: coords[0].latitude,
              longitude: coords[0].longitude,
              latitudeDelta: 0.02,
              longitudeDelta: 0.02,
            },
            500
          );
        }
      }, 300);
    }
  }, [mapsLoaded, validWaypoints]);

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

  const getMarkerTitle = (type: Waypoint['type'], index: number) => {
    switch (type) {
      case 'start':
        return '起點';
      case 'end':
        return '終點';
      case 'pickup':
        return `取貨 ${index + 1}`;
      case 'dropoff':
        return `送貨 ${index + 1}`;
      default:
        return `站點 ${index + 1}`;
    }
  };

  if (!mapsLoaded || !mapComponents) {
    return (
      <View style={[styles.container, styles.centerContainer, style]}>
        {isLoading ? (
          <>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>載入地圖中...</Text>
          </>
        ) : (
          <View style={styles.errorContainer}>
            <MapPin size={32} color={colors.textSecondary} />
            <Text style={styles.errorText}>地圖載入失敗</Text>
          </View>
        )}
      </View>
    );
  }

  if (validWaypoints.length === 0) {
    return (
      <View style={[styles.container, styles.centerContainer, style]}>
        <MapPin size={32} color={colors.textSecondary} />
        <Text style={styles.errorText}>尚無路線資料</Text>
        <Text style={styles.errorSubtext}>請選擇配送點以顯示路線</Text>
      </View>
    );
  }

  const { MapView, Marker, Polyline, PROVIDER_GOOGLE } = mapComponents;

  return (
    <View style={[styles.container, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        mapType={mapType}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={true}
      >
        {routeCoordinates && routeCoordinates.length >= 2 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeWidth={4}
            strokeColor={colors.primary}
            lineDashPattern={[1]}
            lineCap="round"
            lineJoin="round"
          />
        )}

        {validWaypoints.map((wp, index) => (
          <Marker
            key={`${wp.type}-${index}-${wp.address}`}
            coordinate={{
              latitude: wp.lat,
              longitude: wp.lng,
            }}
            title={getMarkerTitle(wp.type, index)}
            description={wp.address}
            pinColor={getMarkerColor(wp.type)}
          >
            <View style={styles.markerContainer}>
              <View
                style={[
                  styles.markerCircle,
                  { backgroundColor: getMarkerColor(wp.type) },
                ]}
              >
                <Text style={styles.markerIndex}>{index + 1}</Text>
              </View>
              <View
                style={[
                  styles.markerArrow,
                  { borderTopColor: getMarkerColor(wp.type) },
                ]}
              />
            </View>
          </Marker>
        ))}
      </MapView>

      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.primary }]} />
          <Text style={styles.legendText}>取貨</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: colors.danger }]} />
          <Text style={styles.legendText}>送貨</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 280,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  map: {
    flex: 1,
  },
  centerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    color: colors.textSecondary,
  },
  errorContainer: {
    alignItems: 'center',
  },
  errorText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  errorSubtext: {
    fontSize: 12,
    color: colors.textTertiary,
    marginTop: 4,
  },
  markerContainer: {
    alignItems: 'center',
  },
  markerCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  markerIndex: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
  markerArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -2,
  },
  legend: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    gap: 12,
    backgroundColor: 'rgba(255,255,255,0.95)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
});
