'use client';

import { useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert, Image, Platform } from 'react-native';
import { Plus, Building2, X } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { CompanyFormModal } from './CompanyFormModal';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useDriverStore } from '@/store/driverStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography, borderRadius } from '@/constants/theme';
import type { User } from '@/types';

const isWeb = Platform.OS === 'web';

function AvatarPreview({
  name,
  avatar,
  size = 36,
}: {
  name?: string;
  avatar?: string;
  size?: number;
}) {
  const colors = useThemeStore((s) => s.colors);
  const getInitials = (n?: string) => n?.charAt(0)?.toUpperCase() || 'C';
  const avatarUri = avatar?.trim();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.secondary,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {avatarUri ? (
        <Image source={{ uri: avatarUri }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Text style={{ color: '#FFFFFF', fontSize: size * 0.35, fontWeight: '700' }}>
          {getInitials(name)}
        </Text>
      )}
    </View>
  );
}

export function CompanyList() {
  const { t } = useTranslation();
  const colors = useThemeStore((s) => s.colors);
  const { getCompanies, softDeleteUser } = useUserManagementStore();
  const { getDriversByCompanyId } = useDriverStore();
  const [modalVisible, setModalVisible] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState<User | null>(null);

  const companies = getCompanies();

  const handleAdd = () => {
    setSelectedCompany(null);
    setModalVisible(true);
  };

  const handleEdit = (company: User) => {
    setSelectedCompany(company);
    setModalVisible(true);
  };

  const handleDelete = (company: User) => {
    const drivers = getDriversByCompanyId(company.id);
    const warningMsg = drivers.length > 0
      ? `${t('company.deleteWarning')}\n\n${t('company.driversCount', { count: drivers.length })}`
      : t('company.confirmDelete');

    const doDelete = async () => {
      await softDeleteUser(company.id);
      if (isWeb) {
        window.alert(`✅ ${t('company.companyDeleted')}`);
      } else {
        Alert.alert(t('common.success'), t('company.companyDeleted'));
      }
    };

    if (isWeb) {
      if (window.confirm(warningMsg)) {
        void doDelete();
      }
    } else {
      Alert.alert(t('company.title'), warningMsg, [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => void doDelete() },
      ]);
    }
  };

  const renderCompany = ({ item }: { item: User }) => {
    const drivers = getDriversByCompanyId(item.id);
    const driverCount = drivers.length;

    return (
      <View>
        <View style={styles.userRow}>
          <Pressable
            style={({ pressed }) => [
              styles.userRowContent,
              { backgroundColor: pressed ? colors.cardHover : 'transparent' },
            ]}
            onPress={() => handleEdit(item)}
          >
            <AvatarPreview
              name={item.nameZh || item.name}
              avatar={item.avatar}
              size={36}
            />
            <View style={styles.userInfo}>
              <Text style={[styles.userNameSmall, { color: colors.textPrimary }]}>
                {item.nameZh || item.name}
              </Text>
              <Text style={[styles.userEmailSmall, { color: colors.textTertiary }]}>
                {item.email}
              </Text>
              {driverCount > 0 && (
                <Text style={[styles.driverCountText, { color: colors.secondary }]}>
                  {t('company.driversCount', { count: driverCount })}
                </Text>
              )}
            </View>
          </Pressable>
          <Pressable
            style={styles.userDeleteBtn}
            onPress={() => handleDelete(item)}
            hitSlop={12}
          >
            <X size={16} color={colors.danger} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderEmpty = () => (
    <Card style={styles.emptyUsersCard}>
      <Building2 size={24} color={colors.textTertiary} />
      <Text style={[styles.emptyUsersText, { color: colors.textTertiary }]}>
        {t('company.noDrivers')}
      </Text>
    </Card>
  );

  return (
    <View style={styles.container}>
      <View style={styles.sectionHeader}>
        <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
          {t('company.management')}
        </Text>
        <Pressable
          style={[styles.addBtn, { backgroundColor: `${colors.primary}20` }]}
          onPress={handleAdd}
        >
          <Plus size={14} color={colors.primary} />
          <Text style={[styles.addBtnText, { color: colors.primary }]}>
            {t('company.addCompany')}
          </Text>
        </Pressable>
      </View>

      {companies.length === 0 ? (
        renderEmpty()
      ) : (
        <Card style={styles.settingsCard}>
          {companies.map((item, index) => (
            <View key={item.id}>
              {renderCompany({ item })}
              {index < companies.length - 1 && (
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
              )}
            </View>
          ))}
        </Card>
      )}
      <Text style={[styles.hintText, { color: colors.textTertiary }]}>
        {t('profile.tapToEdit')}
      </Text>

      <CompanyFormModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        company={selectedCompany}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginLeft: spacing.xs,
  },
  sectionTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    gap: spacing.xs,
  },
  addBtnText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
  },
  settingsCard: {
    padding: 0,
    overflow: 'hidden',
  },
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userRowContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingLeft: spacing.lg,
    gap: spacing.md,
  },
  userInfo: {
    flex: 1,
  },
  userNameSmall: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  userEmailSmall: {
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
  driverCountText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '500',
    marginTop: 2,
  },
  userDeleteBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  divider: {
    height: 1,
    marginLeft: spacing.lg + 36 + spacing.md,
  },
  emptyUsersCard: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyUsersText: {
    fontSize: typography.fontSize.sm,
  },
  hintText: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
});
