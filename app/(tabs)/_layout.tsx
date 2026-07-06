import { Tabs } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Platform } from 'react-native';
import { colors } from '@/constants/theme';
import { LayoutDashboard, User, ClipboardList, Car } from 'lucide-react-native';
import { Text } from 'react-native';
import { useDeliveryStore } from '@/store/deliveryStore';
import { useTranslation } from '@/i18n';
import { useLayout } from '@/hooks/useLayout';
import { Sidebar, SIDEBAR_WIDTH_PX } from '@/components/shell/Sidebar';

function Badge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text>
    </View>
  );
}

function TabBarIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  const icons: Record<string, React.ReactNode> = {
    dashboard: <LayoutDashboard size={22} color={color} />,
    vehicle: <Car size={22} color={color} />,
    delivery: <ClipboardList size={22} color={color} />,
    profile: <User size={22} color={color} />,
  };

  if (name === 'delivery') {
    const deliveries = useDeliveryStore((s) => s.deliveries);
    const today = new Date().toISOString().slice(0, 10);
    const todayCount = deliveries.filter((d) => d.pickupTime.slice(0, 10) === today).length;

    return (
      <View style={[styles.iconContainer, focused && styles.iconContainerFocused]}>
        {icons[name]}
        <Badge count={todayCount} />
      </View>
    );
  }

  return (
    <View style={[styles.iconContainer, focused && styles.iconContainerFocused]}>
      {icons[name]}
    </View>
  );
}

export default function TabLayout() {
  const { t } = useTranslation();
  const { isDesktop } = useLayout();

  const tabContent = (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarItemStyle: styles.tabBarItem,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.dashboard'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="dashboard" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="vehicle"
        options={{
          title: t('nav.vehicles'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="vehicle" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="delivery"
        options={{
          title: t('nav.delivery'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="delivery" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="onefleet-system-admin"
        options={{
          title: t('nav.profile'),
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="profile" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );

  // Desktop/tablet (≥ 768px): show Sidebar on the left + content fills remaining space.
  // Mobile (< 768px): show bottom tab bar (the default Tabs behaviour).
  if (isDesktop) {
    return (
      <View style={styles.desktopShell}>
        <Sidebar />
        <View style={[styles.desktopContent, { width: `calc(100% - ${SIDEBAR_WIDTH_PX}px)` }]}>
          {tabContent}
        </View>
      </View>
    );
  }

  return tabContent;
}

const styles = StyleSheet.create({
  desktopShell: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopContent: {
    flex: 1,
    // On web, fill remaining viewport height to make content area scrollable.
    ...(Platform.OS === 'web' ? { height: '100vh' } : {}),
    overflow: 'hidden',
  },
  tabBar: {
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    height: 70,
    paddingTop: 8,
    paddingBottom: 8,
  },
  tabBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
  },
  tabBarItem: {
    height: 50,
  },
  iconContainer: {
    width: 40,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
  },
  iconContainerFocused: {
    backgroundColor: colors.primaryGlow,
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -8,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#fff',
  },
});
