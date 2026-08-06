import { View, Text, StyleSheet, ScrollView, Pressable, Image } from 'react-native';
import { useRouter } from 'expo-router';
import { Globe, Check, Type, ChevronRight } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Header } from '@/components/ui/Header';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography } from '@/constants/theme';
import { useFontScale, FontScale } from '@/contexts/FontScaleContext';

type Locale = 'zh-TW' | 'en';

const LANGUAGES: { locale: Locale; label: string; native: string }[] = [
  { locale: 'zh-TW', label: '繁體中文', native: 'Chinese (Traditional)' },
  { locale: 'en', label: 'English', native: 'English' },
];

const FONT_SCALES: { scale: FontScale; label: string; labelEn: string }[] = [
  { scale: 'normal', label: '標準', labelEn: 'Normal' },
  { scale: 'large', label: '放大', labelEn: 'Large' },
  { scale: 'larger', label: '更大', labelEn: 'Larger' },
];

export default function PreferencesScreen() {
  const router = useRouter();
  const colors = useThemeStore((s) => s.colors);
  const { locale, setLocale } = useTranslation();
  const { fontScale, setFontScale } = useFontScale();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="偏好設定"
        showBack
        onBackPress={() => router.back()}
        leftElement={
          <Pressable onPress={() => router.back()} hitSlop={8}>
            <Image
              source={require('@/assets/onefleet_2560.png')}
              style={{ width: 90, height: 30 }}
              resizeMode="contain"
            />
          </Pressable>
        }
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            🌐 語言
          </Text>
          <Card style={styles.settingsCard}>
            {LANGUAGES.map((lang, i) => (
              <View key={lang.locale}>
                <Pressable
                  onPress={() => setLocale(lang.locale)}
                  style={({ pressed }) => [
                    styles.settingItem,
                    { backgroundColor: pressed ? colors.cardHover : 'transparent' },
                  ]}
                >
                  <View style={styles.settingLeft}>
                    <View style={[styles.settingIconWrap, { backgroundColor: `${colors.primary}15` }]}>
                      <Globe size={18} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                        {lang.label}
                      </Text>
                      <Text style={[styles.settingSub, { color: colors.textTertiary }]}>
                        {lang.native}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.settingRight}>
                    {locale === lang.locale && <Check size={18} color={colors.primary} />}
                    <ChevronRight size={16} color={colors.textTertiary} />
                  </View>
                </Pressable>
                {i < LANGUAGES.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                )}
              </View>
            ))}
          </Card>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
            🔤 字體大小
          </Text>
          <Card style={styles.settingsCard}>
            {FONT_SCALES.map((item, i) => (
              <View key={item.scale}>
                <Pressable
                  onPress={() => setFontScale(item.scale)}
                  style={({ pressed }) => [
                    styles.settingItem,
                    { backgroundColor: pressed ? colors.cardHover : 'transparent' },
                  ]}
                >
                  <View style={styles.settingLeft}>
                    <View style={[styles.settingIconWrap, { backgroundColor: `${colors.primary}15` }]}>
                      <Type size={18} color={colors.primary} />
                    </View>
                    <View>
                      <Text style={[styles.settingLabel, { color: colors.textPrimary }]}>
                        {locale === 'zh-TW' ? item.label : item.labelEn}
                      </Text>
                      <Text style={[styles.settingSub, { color: colors.textTertiary }]}>
                        {locale === 'zh-TW' ? '變更介面文字大小' : 'Change interface text size'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.settingRight}>
                    {fontScale === item.scale && <Check size={18} color={colors.primary} />}
                    <ChevronRight size={16} color={colors.textTertiary} />
                  </View>
                </Pressable>
                {i < FONT_SCALES.length - 1 && (
                  <View style={[styles.divider, { backgroundColor: colors.border }]} />
                )}
              </View>
            ))}
          </Card>
        </View>

        <View style={styles.spacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  settingsCard: {
    padding: 0,
    overflow: 'hidden',
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    flex: 1,
  },
  settingIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
  },
  settingSub: {
    fontSize: typography.fontSize.xs,
    marginTop: 1,
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  divider: {
    height: 1,
    marginLeft: spacing.lg + 36 + spacing.md,
  },
  spacer: { height: 80 },
});
