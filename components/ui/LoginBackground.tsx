import React from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { colors } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface LoginBackgroundProps {
  children: React.ReactNode;
}

export function LoginBackground({ children }: LoginBackgroundProps) {
  return (
    <View style={styles.container}>
      {/* Base gradient background */}
      <LinearGradient
        colors={[
          colors.muted,
          colors.background,
          colors.background,
        ]}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
      />

      {/* Grid pattern overlay */}
      <View style={styles.gridContainer}>
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '4.16%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '8.33%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '12.5%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '16.67%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '20.83%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '25%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '29.17%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '33.33%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '37.5%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '41.67%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '45.83%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '50%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '54.17%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '58.33%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '62.5%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '66.67%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '70.83%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '75%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '79.17%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '83.33%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '87.5%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '91.67%' }]} />
        <View style={[styles.gridLine, styles.gridLineVertical, { left: '95.83%' }]} />

        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '4.16%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '8.33%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '12.5%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '16.67%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '20.83%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '25%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '29.17%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '33.33%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '37.5%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '41.67%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '45.83%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '50%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '54.17%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '58.33%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '62.5%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '66.67%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '70.83%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '75%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '79.17%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '83.33%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '87.5%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '91.67%' }]} />
        <View style={[styles.gridLine, styles.gridLineHorizontal, { top: '95.83%' }]} />
      </View>

      {/* Top center glow */}
      <View style={styles.glowTopCenter}>
        <BlurView
          intensity={40}
          tint="light"
          style={styles.glowBlur}
        >
          <LinearGradient
            colors={[colors.primary + '20', 'transparent']}
            style={styles.glowGradient}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
          />
        </BlurView>
      </View>

      {/* Violet glow - top left */}
      <View style={styles.glowViolet}>
        <BlurView
          intensity={30}
          tint="light"
          style={styles.glowBlur}
        />
      </View>

      {/* Cyan glow - top right */}
      <View style={styles.glowCyan}>
        <BlurView
          intensity={25}
          tint="light"
          style={styles.glowBlur}
        />
      </View>

      {/* Fuchsia glow - bottom left */}
      <View style={styles.glowFuchsia}>
        <BlurView
          intensity={30}
          tint="light"
          style={styles.glowBlur}
        />
      </View>

      {/* Content */}
      <View style={styles.content}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  gridContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  gridLine: {
    position: 'absolute',
    backgroundColor: 'rgba(128, 128, 128, 0.03)',
  },
  gridLineVertical: {
    width: 1,
    height: '100%',
  },
  gridLineHorizontal: {
    width: '100%',
    height: 1,
  },
  glowTopCenter: {
    position: 'absolute',
    top: -100,
    left: SCREEN_WIDTH / 2 - 400,
    width: 800,
    height: 600,
    overflow: 'hidden',
  },
  glowViolet: {
    position: 'absolute',
    top: -100,
    left: -200,
    width: 700,
    height: 700,
    borderRadius: 350,
    overflow: 'hidden',
  },
  glowCyan: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.15,
    right: -100,
    width: 600,
    height: 500,
    borderRadius: 300,
    overflow: 'hidden',
    transform: [{ scale: 1.05 }],
  },
  glowFuchsia: {
    position: 'absolute',
    bottom: -200,
    left: SCREEN_WIDTH * 0.1,
    width: 600,
    height: 600,
    borderRadius: 300,
    overflow: 'hidden',
  },
  glowBlur: {
    width: '100%',
    height: '100%',
    backgroundColor: 'transparent',
  },
  glowGradient: {
    width: '100%',
    height: '100%',
  },
  content: {
    flex: 1,
    zIndex: 1,
  },
});
