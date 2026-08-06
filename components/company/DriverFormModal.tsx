'use client';

import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  Pressable,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { X, Mail, Lock, Phone, User, Building2, ChevronDown } from 'lucide-react-native';
import { TextInput } from '@/components/ui/TextInput';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useTranslation } from '@/i18n';
import { colors, spacing, borderRadius, typography } from '@/constants/theme';
import type { User as UserType } from '@/types';
import * as ImagePicker from 'expo-image-picker';
import { useThemeStore } from '@/store/themeStore';

const isWeb = Platform.OS === 'web';

async function pickImage(): Promise<string | null> {
  if (isWeb) {
    return new Promise<string | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) { resolve(null); return; }
        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : null;
          if (result && result.length > 300000) {
            Alert.alert('錯誤', '圖片太大，請選擇較小的圖片');
            resolve(null);
            return;
          }
          resolve(result);
        };
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      };
      input.click();
    });
  }
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    Alert.alert('錯誤', '需要相簿權限才能上傳圖片');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.5,
    base64: true,
  });
  if (result.canceled || !result.assets?.length) return null;
  const asset = result.assets[0];
  if (asset.base64) {
    const mimeType = asset.mimeType || 'image/jpeg';
    return `data:${mimeType};base64,${asset.base64}`;
  }
  return asset.uri;
}

interface DriverFormModalProps {
  visible: boolean;
  onClose: () => void;
  driver?: UserType | null;
  onSave?: (updates: Partial<UserType>) => Promise<void>;
}

export function DriverFormModal({ visible, onClose, driver, onSave }: DriverFormModalProps) {
  const { t } = useTranslation();
  const { colors: themeColors } = useThemeStore();
  const { addUser, updateUser, users, loadUsers } = useUserManagementStore();
  const isEditing = !!driver;
  const companies = users.filter((u) => u.role === 'company');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    // Ensure users are loaded when modal opens
    loadUsers();
  }, [visible]);

  useEffect(() => {
    if (driver) {
      setName(driver.name || '');
      setEmail(driver.email || '');
      setPassword('');
      setPhone(driver.phone || '');
      setAvatar(driver.avatar || '');
      setCompanyId(driver.companyId || driver.companyId2 || '');
    } else {
      resetForm();
    }
  }, [driver, visible]);

  const resetForm = () => {
    setName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setAvatar('');
    setCompanyId('');
    setErrors({});
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = t('error.nameRequired');
    }

    if (!email.trim()) {
      newErrors.email = t('error.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('error.invalidEmailFormat');
    }

    if (!isEditing && !password.trim()) {
      newErrors.password = t('error.passwordRequired');
    } else if (password && password.length < 6) {
      newErrors.password = t('error.passwordMinLength');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      if (isEditing) {
        const updates: Partial<UserType> = {
          name,
          email,
          phone: phone || undefined,
          avatar: avatar || undefined,
          companyId: companyId || undefined,
        };
        if (password) {
          (updates as any).password = password;
        }

        if (onSave) {
          await onSave(updates);
        } else {
          await updateUser(driver.id, updates);
        }
        Alert.alert(t('common.success'), isEditing ? t('company.driverUpdated') || '司機已更新' : t('company.driverCreated') || '司機已建立');
      } else {
        const result = await addUser(
          name,
          email,
          password,
          'driver',
          phone || undefined,
          avatar || undefined,
          undefined, // nameZh
          undefined, // nameEn
          undefined, // address
          companyId || undefined
        );
        if (result.success) {
          Alert.alert(t('common.success'), t('company.driverCreated') || '司機已建立');
        } else {
          Alert.alert(t('common.error'), result.error);
          return;
        }
      }
      onClose();
      resetForm();
    } catch (error) {
      Alert.alert(t('common.error'), error instanceof Error ? error.message : String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={handleClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />
        <View style={styles.container}>
          <View style={[styles.header, { borderBottomColor: colors.border }]}>
            <Text style={[styles.title, { color: colors.textPrimary }]}>
              {isEditing ? t('company.editDriver') : t('company.addDriver') || (isEditing ? '編輯司機' : '新增司機')}
            </Text>
            <Pressable onPress={handleClose} hitSlop={8}>
              <X size={24} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            style={styles.content}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.iconContainer}>
              <Pressable onPress={async () => {
                try {
                  setUploadingImage(true);
                  const uri = await pickImage();
                  if (uri) setAvatar(uri);
                } finally {
                  setUploadingImage(false);
                }
              }} disabled={uploadingImage}>
                {avatar ? (
                  <Image source={{ uri: avatar }} style={styles.avatarImage} />
                ) : (
                  <View style={[styles.avatarPlaceholder, { backgroundColor: `${themeColors.primary}20` }]}>
                    <User size={32} color={themeColors.primary} />
                  </View>
                )}
              </Pressable>
              <Text style={[styles.uploadHint, { color: themeColors.textSecondary }]}>
                {t('profile.uploadImageHint') || '點擊上傳圖片'}
              </Text>
            </View>

            <TextInput
              label={`${t('auth.name')} *`}
              placeholder={t('auth.namePlaceholder')}
              value={name}
              onChangeText={setName}
              error={errors.name}
              icon={<User size={18} color={colors.textTertiary} />}
              autoCapitalize="words"
            />

            {/* Company Select Field */}
            <SelectField
              label={t('company.title') || '公司'}
              placeholder={t('company.selectCompany') || '選擇公司'}
              value={companyId || ''}
              options={companies.map((c) => ({
                value: c.id,
                label: c.nameZh || c.name || c.email,
              }))}
              onValueChange={setCompanyId}
            />

            <TextInput
              label={`${t('auth.email')} *`}
              placeholder={t('auth.emailPlaceholder')}
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              keyboardType="email-address"
              icon={<Mail size={18} color={colors.textTertiary} />}
              autoComplete="email"
            />

            <TextInput
              label={`${t('auth.phone')}`}
              placeholder={t('company.phonePlaceholder') || '+852 XXXX XXXX'}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              icon={<Phone size={18} color={colors.textTertiary} />}
            />

            <TextInput
              label={`${t('auth.password')} ${isEditing ? `(${t('company.passwordEditHint')})` : '*'}`}
              placeholder={t('auth.passwordPlaceholder')}
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              secureTextEntry
              icon={<Lock size={18} color={colors.textTertiary} />}
              autoComplete="new-password"
            />
          </ScrollView>

          <View style={[styles.footer, { borderTopColor: colors.border }]}>
            <Button
              title={t('common.cancel')}
              variant="secondary"
              onPress={handleClose}
              style={styles.cancelButton}
            />
            <Button
              title={t('common.save')}
              onPress={handleSave}
              loading={loading}
              style={styles.saveButton}
            />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.overlay,
    pointerEvents: 'box-none',
  },
  container: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: borderRadius['2xl'],
    borderTopRightRadius: borderRadius['2xl'],
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
  },
  title: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
  },
  content: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
  },
  iconContainer: {
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadHint: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.sm,
  },
  formField: {
    marginBottom: spacing.md,
  },
  formLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.xs,
  },
  formInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  selectWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  selectText: {
    flex: 1,
    fontSize: typography.fontSize.base,
  },
  formInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.md,
    borderTopWidth: 1,
  },
  cancelButton: {
    flex: 1,
  },
  saveButton: {
    flex: 1,
  },
});
