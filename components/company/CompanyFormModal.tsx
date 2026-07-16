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
import { X, Mail, Lock, Phone, MapPin, Globe, Building2, Upload, Image as ImageIcon } from 'lucide-react-native';
import { TextInput } from '@/components/ui/TextInput';
import { Button } from '@/components/ui/Button';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useTranslation } from '@/i18n';
import { colors, spacing, borderRadius, typography } from '@/constants/theme';
import type { User } from '@/types';
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

interface CompanyFormModalProps {
  visible: boolean;
  onClose: () => void;
  company?: User | null;
}

export function CompanyFormModal({ visible, onClose, company }: CompanyFormModalProps) {
  const { t } = useTranslation();
  const { colors: themeColors } = useThemeStore();
  const { addUser, updateUser, getCompanies } = useUserManagementStore();
  const isEditing = !!company;

  const [nameZh, setNameZh] = useState('');
  const [nameEn, setNameEn] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [avatar, setAvatar] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (company) {
      setNameZh(company.nameZh || '');
      setNameEn(company.nameEn || '');
      setEmail(company.email || '');
      setPassword('');
      setPhone(company.phone || '');
      setAddress(company.address || '');
      setAvatar(company.avatar || '');
    } else {
      resetForm();
    }
  }, [company, visible]);

  const resetForm = () => {
    setNameZh('');
    setNameEn('');
    setEmail('');
    setPassword('');
    setPhone('');
    setAddress('');
    setAvatar('');
    setErrors({});
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!nameZh.trim()) {
      newErrors.nameZh = t('company.nameZhRequired');
    }

    if (!email.trim()) {
      newErrors.email = t('error.emailRequired');
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.email = t('error.invalidEmailFormat');
    } else {
      const existingCompanies = getCompanies();
      const duplicate = existingCompanies.find(
        (c) => c.email.toLowerCase() === email.toLowerCase() && c.id !== company?.id
      );
      if (duplicate) {
        newErrors.email = t('error.emailAlreadyExists');
      }
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
        const updates: Partial<User> = {
          name: nameZh,
          nameZh,
          nameEn: nameEn || undefined,
          email,
          phone: phone || undefined,
          address: address || undefined,
          avatar: avatar || undefined,
        };
        if (password) {
          (updates as any).password = password;
        }
        await updateUser(company.id, updates);
        Alert.alert(t('common.success'), t('company.companyUpdated'));
      } else {
        const result = await addUser(
          nameZh,
          email,
          password,
          'company',
          phone || undefined,
          avatar || undefined,
          nameZh,
          nameEn || undefined,
          address || undefined
        );
        if (result.success) {
          Alert.alert(t('common.success'), t('company.companyCreated'));
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
              {isEditing ? t('company.editCompany') : t('company.addCompany')}
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
                  <Image source={{ uri: avatar }} style={styles.companyImage} />
                ) : (
                  <View style={[styles.companyImagePlaceholder, { backgroundColor: `${themeColors.primary}20` }]}>
                    <Building2 size={32} color={themeColors.primary} />
                    <Text style={[styles.uploadImageText, { color: themeColors.primary }]}>
                      {uploadingImage ? t('common.loading') : t('profile.uploadImage')}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Text style={[styles.uploadHint, { color: themeColors.textSecondary }]}>
                {t('company.companyImageHint')}
              </Text>
            </View>

            <TextInput
              label={`${t('company.companyNameZh')} *`}
              placeholder={t('company.companyNameZhPlaceholder')}
              value={nameZh}
              onChangeText={setNameZh}
              error={errors.nameZh}
              autoCapitalize="words"
              autoComplete="organization-title"
            />

            <TextInput
              label={t('company.companyNameEn')}
              placeholder={t('company.companyNameEnPlaceholder')}
              value={nameEn}
              onChangeText={setNameEn}
              autoCapitalize="words"
            />

            <TextInput
              label={`${t('company.emailAsAccount')} *`}
              placeholder={t('company.emailPlaceholder')}
              value={email}
              onChangeText={setEmail}
              error={errors.email}
              keyboardType="email-address"
              icon={<Mail size={18} color={colors.textTertiary} />}
              autoComplete="email"
            />

            <TextInput
              label={`${t('company.password')} ${isEditing ? `(${t('company.passwordEditHint')})` : '*'}`}
              placeholder={t('company.passwordPlaceholder')}
              value={password}
              onChangeText={setPassword}
              error={errors.password}
              secureTextEntry
              icon={<Lock size={18} color={colors.textTertiary} />}
              autoComplete={isEditing ? 'new-password' : 'new-password'}
            />

            <TextInput
              label={t('company.phone')}
              placeholder={t('company.phonePlaceholder')}
              value={phone}
              onChangeText={setPhone}
              keyboardType="phone-pad"
              icon={<Phone size={18} color={colors.textTertiary} />}
            />

            <TextInput
              label={t('company.address')}
              placeholder={t('company.addressPlaceholder')}
              value={address}
              onChangeText={setAddress}
              icon={<MapPin size={18} color={colors.textTertiary} />}
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
  companyImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  companyImagePlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadImageText: {
    fontSize: 10,
    fontWeight: '600',
    marginTop: 4,
    textAlign: 'center',
  },
  uploadHint: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.sm,
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
