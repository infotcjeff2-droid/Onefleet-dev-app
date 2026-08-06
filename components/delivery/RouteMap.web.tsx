import React from 'react';
import { View, StyleSheet, Text, StyleProp, ViewStyle } from 'react-native';
import { colors } from '@/constants/theme';
import { MapPin, Navigation } from 'lucide-react-native';

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
}: RouteMapProps) {
  const hasPickupCoords = pickupLatitude !== undefined && pickupLongitude !== undefined;
  const hasDropoffCoords = dropoffLatitude !== undefined && dropoffLongitude !== undefined;
  const hasValidCoordinates = hasPickupCoords || hasDropoffCoords;

  if (!hasValidCoordinates) {
    return (
      <View style={[styles.container, styles.noCoordsContainer, style]}>
        <View style={styles.noCoordsContent}>
          <MapPin size={32} color={colors.textSecondary} />
          <Text style={styles.noCoordsText}>尚無座標資料</Text>
          <Text style={styles.noCoordsSubtext}>{pickupAddress}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.mapFallback}>
        <View style={styles.mapPlaceholder}>
          <MapPin size={32} color={colors.textTertiary} />
          <Text style={styles.mapPlaceholderText}>地圖預覽（僅在行動裝置上可用）</Text>
        </View>
      </View>
      <View style={styles.routeContainer}>
        <View style={styles.routeStop}>
          <View style={[styles.routeIconCircle, { backgroundColor: `${colors.primary}20` }]}>
            <View style={[styles.routeIconDot, { backgroundColor: colors.primary }]} />
          </View>
          <View style={styles.routeStopInfo}>
            <Text style={styles.routeStopLabel}>取貨點</Text>
            <Text style={styles.routeStopAddress}>{pickupAddress}</Text>
            {hasPickupCoords && (
              <Text style={styles.coordinates}>
                {pickupLatitude?.toFixed(5)}, {pickupLongitude?.toFixed(5)}
              </Text>
            )}
          </View>
        </View>
        <View style={styles.routeConnector}>
          <View style={[styles.routeConnectorLine, { backgroundColor: colors.border }]} />
        </View>
        <View style={styles.routeStop}>
          <View style={[styles.routeIconCircle, { backgroundColor: `${colors.danger}20` }]}>
            <View style={[styles.routeIconDot, { backgroundColor: colors.danger }]} />
          </View>
          <View style={styles.routeStopInfo}>
            <Text style={styles.routeStopLabel}>送貨點</Text>
            <Text style={styles.routeStopAddress}>{dropoffAddress}</Text>
            {hasDropoffCoords && (
              <Text style={styles.coordinates}>
                {dropoffLatitude?.toFixed(5)}, {dropoffLongitude?.toFixed(5)}
              </Text>
            )}
          </View>
        </View>
      </View>
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
  mapFallback: {
    flex: 1,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  mapPlaceholder: {
    alignItems: 'center',
    padding: 16,
    gap: 8,
  },
  mapPlaceholderText: {
    fontSize: 12,
    color: colors.textTertiary,
    textAlign: 'center',
  },
  routeContainer: {
    padding: 12,
    gap: 4,
  },
  routeStop: {
    flexDirection: 'row',
    gap: 12,
  },
  routeIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  routeIconDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  routeStopInfo: {
    flex: 1,
  },
  routeStopLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textTertiary,
    marginBottom: 2,
    textTransform: 'uppercase',
  },
  routeStopAddress: {
    fontSize: 13,
    color: colors.textPrimary,
  },
  coordinates: {
    fontSize: 11,
    color: colors.textTertiary,
    marginTop: 2,
  },
  routeConnector: {
    paddingLeft: 11,
    height: 16,
  },
  routeConnectorLine: {
    width: 2,
    flex: 1,
  },
});

export default RouteMap;
