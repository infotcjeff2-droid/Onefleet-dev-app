import { Tabs } from 'expo-router';
import { colors } from '@/constants/theme';
import { Car, LayoutDashboard, User, ClipboardList } from 'lucide-react-native';
import { Text, View, StyleSheet } from 'react-native';

function TabBarIcon({ name, color, focused }: { name: string; color: string; focused: boolean }) {
  const icons: Record<string, React.ReactNode> = {
    car: <Car size={22} color={color} />,
    dashboard: <LayoutDashboard size={22} color={color} />,
    profile: <User size={22} color={color} />,
    delivery: <ClipboardList size={22} color={color} />,
  };
  return (
    <View style={[styles.iconContainer, focused && styles.iconContainerFocused]}>
      {icons[name]}
    </View>
  );
}

export default function TabLayout() {
  return (
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
        name="dashboard"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="dashboard" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: 'Vehicles',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="car" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="delivery"
        options={{
          title: 'Delivery',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="delivery" color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, focused }) => (
            <TabBarIcon name="profile" color={color} focused={focused} />
          ),
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
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
});
