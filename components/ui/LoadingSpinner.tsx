'use client';

import { View, Image, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
  withSequence,
  withDelay,
  Easing,
} from 'react-native-reanimated';
import { colors } from '@/constants/theme';

interface LoadingSpinnerProps {
  size?: number;
  fullScreen?: boolean;
}

function Dot({ delay = 0 }: { delay?: number }) {
  const opacity = useSharedValue(0.3);
  opacity.value = withDelay(
    delay,
    withRepeat(
      withSequence(
        withTiming(1, { duration: 400, easing: Easing.inOut(Easing.ease) }),
        withTiming(0.3, { duration: 400, easing: Easing.inOut(Easing.ease) }),
      ),
      -1,
      true,
    ),
  );
  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.dot, animatedStyle]} />;
}

export function LoadingSpinner({ size = 80, fullScreen = false }: LoadingSpinnerProps) {
  const rotation = useSharedValue(0);
  const scale = useSharedValue(1);

  rotation.value = withRepeat(
    withTiming(360, { duration: 1200, easing: Easing.linear }),
    -1,
    false,
  );

  scale.value = withRepeat(
    withSequence(
      withTiming(1.05, { duration: 600, easing: Easing.inOut(Easing.ease) }),
      withTiming(1, { duration: 600, easing: Easing.inOut(Easing.ease) }),
    ),
    -1,
    true,
  );

  const logoStyle = useAnimatedStyle(() => ({
    transform: [
      { rotate: `${rotation.value}deg` },
      { scale: scale.value },
    ],
  }));

  if (fullScreen) {
    return (
      <View style={styles.fullScreen}>
        <Animated.View style={[styles.logoContainer, { width: size, height: size }, logoStyle]}>
          <Image
            source={require('@/assets/images/favicon_512.png')}
            style={[styles.logo, { width: size, height: size }]}
            resizeMode="contain"
          />
        </Animated.View>
        <View style={styles.dotsRow}>
          <Dot delay={0} />
          <Dot delay={200} />
          <Dot delay={400} />
        </View>
      </View>
    );
  }

  return (
    <Animated.View style={[styles.logoContainer, { width: size, height: size }, logoStyle]}>
      <Image
        source={require('@/assets/images/favicon_512.png')}
        style={[styles.logo, { width: size, height: size }]}
        resizeMode="contain"
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullScreen: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 24,
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    borderRadius: 16,
  },
  dotsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.primary,
  },
});
