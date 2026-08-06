import React, { useRef, useEffect, useState } from 'react';
import { View, StyleSheet, Platform, ActivityIndicator, Text, StyleProp, ViewStyle } from 'react-native';
import { colors } from '@/constants/theme';
import { MapPin, Navigation } from 'lucide-react-native';

// Native map types (only available on native platforms)
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

const DEFAULT_REGION: Region = {
  latitude: 22.3193,
  longitude: 114.1694,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

interface RouteMapProps {
  pickupLatitude?: number;
  pickupLongitude?: number;
  pickupAddress: string;
  dropoffLatitude?: number;
  dropoffLongitude?: number;
  dropoffAddress: string;
  style?: StyleProp<ViewStyle>;
  mapType?: 'standard' | 'satellite' | 'hybrid';
}

export function RouteMap({
  pickupLatitude,
  pickupLongitude,
  pickupAddress,
  dropoffLatitude,
  dropoffLongitude,
  dropoffAddress,
  style,
  mapType = 'standard',
}: RouteMapProps) {
  // Dynamic import for native platforms
  const [mapsLoaded, setMapsLoaded] = useState(false);
  const [MapComponents, setMapComponents] = useState<{
    MapView: any;
    Marker: any;
    Polyline: any;
    PROVIDER_GOOGLE: any;
  } | null>(null);

  const mapRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasCoordinates, setHasCoordinates] = useState(false);

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
      }
    };
    loadMaps();
  }, []);

  const hasPickupCoords = pickupLatitude !== undefined && pickupLongitude !== undefined;
  const hasDropoffCoords = dropoffLatitude !== undefined && dropoffLongitude !== undefined;
  const hasValidCoordinates = hasPickupCoords || hasDropoffCoords;

  const initialRegion = React.useMemo((): Region => {
    if (hasPickupCoords && hasDropoffCoords) {
      const midLat = (pickupLatitude! + dropoffLatitude!) / 2;
      const midLng = (pickupLongitude! + dropoffLongitude!) / 2;
      const latDelta = Math.abs(pickupLatitude! - dropoffLatitude!) * 1.5 + 0.01;
      const lngDelta = Math.abs(pickupLongitude! - dropoffLongitude!) * 1.5 + 0.01;
      return {
        latitude: midLat,
        longitude: midLng,
        latitudeDelta: Math.max(latDelta, 0.02),
        longitudeDelta: Math.max(lngDelta, 0.02),
      };
    }
    if (hasPickupCoords) {
      return {
        latitude: pickupLatitude!,
        longitude: pickupLongitude!,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    if (hasDropoffCoords) {
      return {
        latitude: dropoffLatitude!,
        longitude: dropoffLongitude!,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      };
    }
    return DEFAULT_REGION;
  }, [pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude, hasPickupCoords, hasDropoffCoords]);

  const routeCoordinates = React.useMemo((): Coordinate[] => {
    if (hasPickupCoords && hasDropoffCoords) {
      return [
        { latitude: pickupLatitude!, longitude: pickupLongitude! },
        { latitude: dropoffLatitude!, longitude: dropoffLongitude! },
      ];
    }
    return [];
  }, [pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude, hasPickupCoords, hasDropoffCoords]);

  useEffect(() => {
    if (hasValidCoordinates && mapRef.current) {
      setTimeout(() => {
        if (hasPickupCoords && hasDropoffCoords) {
          mapRef.current?.fitToCoordinates(routeCoordinates, {
            edgePadding: { top: 80, right: 50, bottom: 50, left: 50 },
            animated: true,
          });
        } else if (hasPickupCoords) {
          mapRef.current?.animateToRegion({
            latitude: pickupLatitude!,
            longitude: pickupLongitude!,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }, 500);
        } else if (hasDropoffCoords) {
          mapRef.current?.animateToRegion({
            latitude: dropoffLatitude!,
            longitude: dropoffLongitude!,
            latitudeDelta: 0.02,
            longitudeDelta: 0.02,
          }, 500);
        }
      }, 100);
    }
  }, [hasValidCoordinates, hasPickupCoords, hasDropoffCoords, routeCoordinates, pickupLatitude, pickupLongitude, dropoffLatitude, dropoffLongitude]);

  const handleMapReady = () => {
    setIsLoading(false);
    setHasCoordinates(hasValidCoordinates);
  };

  if (!mapsLoaded || !MapComponents) {
    return (
      <View style={[styles.container, styles.noCoordsContainer, style]}>
        <View style={styles.noCoordsContent}>
          <MapPin size={32} color={colors.textSecondary} />
          <Text style={styles.noCoordsText}>載入地圖中...</Text>
        </View>
      </View>
    );
  }

  const { MapView, Marker, Polyline, PROVIDER_GOOGLE } = MapComponents;

  if (!hasCoordinates && !isLoading) {
    return (
      <View style={[styles.container, styles.noCoordsContainer, style]}>
        <View style={styles.noCoordsContent}>
          <MapPin size={32} color={colors.textSecondary} />
          <Text style={styles.noCoordsText}>尚無座標資料</Text>
          <Text style={styles.noCoordsSubtext}>
            {pickupAddress}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      {isLoading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      )}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={initialRegion}
        mapType={mapType}
        onMapReady={handleMapReady}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        showsScale={true}
      >
        {hasPickupCoords && (
          <Marker
            coordinate={{
              latitude: pickupLatitude!,
              longitude: pickupLongitude!,
            }}
            title="取貨點"
            description={pickupAddress}
            pinColor={colors.primary}
          >
            <View style={styles.pickupMarkerContainer}>
              <View style={[styles.markerCircle, { backgroundColor: colors.primary }]}>
                <MapPin size={16} color="#fff" />
              </View>
            </View>
          </Marker>
        )}
        {hasDropoffCoords && (
          <Marker
            coordinate={{
              latitude: dropoffLatitude!,
              longitude: dropoffLongitude!,
            }}
            title="送貨點"
            description={dropoffAddress}
            pinColor={colors.danger}
          >
            <View style={styles.dropoffMarkerContainer}>
              <View style={[styles.markerCircle, { backgroundColor: colors.danger }]}>
                <Navigation size={16} color="#fff" />
              </View>
            </View>
          </Marker>
        )}
        {routeCoordinates.length === 2 && (
          <Polyline
            coordinates={routeCoordinates}
            strokeWidth={4}
            strokeColor={colors.accent}
            lineDashPattern={[1]}
            lineCap="round"
            lineJoin="round"
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 250,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  map: {
    flex: 1,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.card,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
  noCoordsContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  noCoordsContent: {
    alignItems: 'center',
    padding: 20,
  },
  noCoordsText: {
    fontSize: 14,
    color: colors.textSecondary,
    marginTop: 8,
  },
  noCoordsSubtext: {
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 4,
    textAlign: 'center',
  },
  pickupMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropoffMarkerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  markerCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
});

export default RouteMap;
