import React, { useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  interpolate,
} from 'react-native-reanimated';
import { colors } from '@/constants/theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const FLOATING_ORBS = [
  { x: 15, y: 20, size: 120, duration: 8000, delay: 0, moveX: 60, moveY: 40 },
  { x: 75, y: 60, size: 80, duration: 10000, delay: 500, moveX: -50, moveY: 50 },
  { x: 85, y: 15, size: 100, duration: 9000, delay: 1000, moveX: -40, moveY: 60 },
  { x: 10, y: 70, size: 90, duration: 11000, delay: 250, moveX: 70, moveY: -45 },
  { x: 60, y: 85, size: 70, duration: 8500, delay: 750, moveX: -55, moveY: -35 },
  { x: 40, y: 40, size: 60, duration: 9500, delay: 1250, moveX: 45, moveY: 55 },
  { x: 25, y: 55, size: 50, duration: 7500, delay: 2000, moveX: -35, moveY: -50 },
  { x: 70, y: 30, size: 65, duration: 10500, delay: 1500, moveX: 50, moveY: 40 },
];

interface LoginBackgroundProps {
  children: React.ReactNode;
}

function FloatingOrb({ x, y, size, duration, delay, moveX, moveY }: typeof FLOATING_ORBS[0]) {
  const progress = useSharedValue(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      progress.value = withRepeat(
        withSequence(
          withTiming(1, { duration, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    }, delay);
    return () => clearTimeout(timeout);
  }, [duration, delay]);

  const animatedStyle = useAnimatedStyle(() => {
    const translateX = interpolate(progress.value, [0, 0.5, 1], [0, moveX, 0]);
    const translateY = interpolate(progress.value, [0, 0.5, 1], [0, moveY, 0]);
    const scale = interpolate(progress.value, [0, 0.5, 1], [0.6, 1.0, 0.6]);
    const opacity = interpolate(progress.value, [0, 0.5, 1], [0.08, 0.2, 0.08]);

    return {
      transform: [
        { translateX },
        { translateY },
        { scale },
      ],
      opacity,
    };
  });

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          left: `${x}%`,
          top: `${y}%`,
          width: size,
          height: size,
          borderRadius: size / 2,
        },
        animatedStyle,
      ]}
    >
      <LinearGradient
        colors={['#ff6b6b40', '#54a0ff40', '#ff9ff340']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      />
    </Animated.View>
  );
}

function AnimatedGlows() {
  const glow1Progress = useSharedValue(0);
  const glow2Progress = useSharedValue(0);
  const glow3Progress = useSharedValue(0);

  useEffect(() => {
    glow1Progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 3000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    glow2Progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 4000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );

    glow3Progress.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 3500, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 3500, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, []);

  const glow1Style = useAnimatedStyle(() => {
    const translateX = interpolate(glow1Progress.value, [0, 1], [-50, 50]);
    const translateY = interpolate(glow1Progress.value, [0, 1], [-30, 30]);
    const opacity = interpolate(glow1Progress.value, [0, 1], [0.3, 0.6]);
    return {
      transform: [{ translateX }, { translateY }],
      opacity,
    };
  });

  const glow2Style = useAnimatedStyle(() => {
    const translateX = interpolate(glow2Progress.value, [0, 1], [30, -30]);
    const translateY = interpolate(glow2Progress.value, [0, 1], [20, -20]);
    const opacity = interpolate(glow2Progress.value, [0, 1], [0.2, 0.5]);
    return {
      transform: [{ translateX }, { translateY }],
      opacity,
    };
  });

  const glow3Style = useAnimatedStyle(() => {
    const translateX = interpolate(glow3Progress.value, [0, 1], [-20, 40]);
    const translateY = interpolate(glow3Progress.value, [0, 1], [30, -30]);
    const opacity = interpolate(glow3Progress.value, [0, 1], [0.25, 0.55]);
    return {
      transform: [{ translateX }, { translateY }],
      opacity,
    };
  });

  return (
    <>
      <Animated.View style={[styles.animatedGlow1, glow1Style]}>
        <BlurView intensity={40} tint="light" style={styles.glowBlur} />
      </Animated.View>
      <Animated.View style={[styles.animatedGlow2, glow2Style]}>
        <BlurView intensity={30} tint="light" style={styles.glowBlur} />
      </Animated.View>
      <Animated.View style={[styles.animatedGlow3, glow3Style]}>
        <BlurView intensity={35} tint="light" style={styles.glowBlur} />
      </Animated.View>
    </>
  );
}

function AnimatedColorOverlay() {
  const colorProgress = useSharedValue(0);

  useEffect(() => {
    colorProgress.value = withRepeat(
      withTiming(1, { duration: 5000, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => {
    const hue = interpolate(colorProgress.value, [0, 1], [0, 360]);
    return {
      backgroundColor: `hsla(${hue}, 70%, 50%, 0.08)`,
    };
  });

  return <Animated.View style={[styles.colorOverlay, animatedStyle]} />;
}

export function LoginBackground({ children }: LoginBackgroundProps) {
  return (
    <View style={styles.container}>
      {/* Base gradient background */}
      <View style={styles.gradientBg}>
        <LinearGradient
          colors={[colors.muted, colors.background, colors.background]}
          style={StyleSheet.absoluteFill}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
        />
      </View>

      {/* Animated color overlay for gradient transitions */}
      <AnimatedColorOverlay />

      {/* Floating orbs */}
      {FLOATING_ORBS.map((orb, index) => (
        <FloatingOrb key={index} {...orb} />
      ))}

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

      {/* Animated glows */}
      <AnimatedGlows />

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
  gradientBg: {
    ...StyleSheet.absoluteFillObject,
  },
  colorOverlay: {
    ...StyleSheet.absoluteFillObject,
  },
  orb: {
    position: 'absolute',
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  animatedGlow1: {
    position: 'absolute',
    top: -100,
    left: -200,
    width: 700,
    height: 700,
    borderRadius: 350,
    overflow: 'hidden',
  },
  animatedGlow2: {
    position: 'absolute',
    top: SCREEN_HEIGHT * 0.15,
    right: -100,
    width: 600,
    height: 500,
    borderRadius: 300,
    overflow: 'hidden',
  },
  animatedGlow3: {
    position: 'absolute',
    bottom: -200,
    left: SCREEN_WIDTH * 0.1,
    width: 600,
    height: 600,
    borderRadius: 300,
    overflow: 'hidden',
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
