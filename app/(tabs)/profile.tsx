import { View, Text, StyleSheet, ScrollView, Alert, Pressable, Modal, TextInput as RNTextInput, TouchableOpacity, Image } from 'react-native';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LogOut, Shield, Settings, ChevronRight, User, Mail, Award, Truck, Plus, X, Users, Globe, Image as ImageIcon, Upload, Cpu, Link2, Warehouse, Package, Zap, RefreshCw, Trash2, RotateCcw, AlertCircle, Building2 } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SelectField } from '@/components/ui/SelectField';
import { useAuthStore } from '@/store/authStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useDriverStore } from '@/store/driverStore';
import { useVehicleStore } from '@/store/vehicleStore';
import { useGps808Store } from '@/store/gps808Store';
import { useTrashStore } from '@/store/trashStore';
import { useTranslation } from '@/i18n';
import { spacing, typography, borderRadius } from '@/constants/theme';
import { Header } from '@/components/ui/Header';
import { CompanyList } from '@/components/company/CompanyList';
import { useState, useEffect } from 'react';
import { User as AppUser } from '@/types';

const isWeb = Platform.OS === 'web';

type ManagedUser = { id: string; name: string; email: string; phone?: string; role: string; password?: string; avatar?: string; companyId?: string };

function getInitials(name?: string) {
  return name?.charAt(0)?.toUpperCase() || 'U';
}

async function pickAvatarImage() {
  if (isWeb) {
    return new Promise<string | null>((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';

      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }

        const reader = new FileReader();
        reader.onload = () => {
          const result = typeof reader.result === 'string' ? reader.result : null;
          if (!result) {
            reject(new Error('image-read-failed'));
            return;
          }

          if (result.length > 300000) {
            reject(new Error('image-too-large'));
            return;
          }

          resolve(result);
        };
        reader.onerror = () => reject(new Error('image-read-failed'));
        reader.readAsDataURL(file);
      };

      input.click();
    });
  }

  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('permission-denied');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ImagePicker.MediaTypeOptions.Images,
    allowsEditing: true,
    aspect: [1, 1],
    quality: 0.35,
    base64: true,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];
  if (asset.base64) {
    const mimeType = asset.mimeType || 'image/jpeg';
    const dataUrl = `data:${mimeType};base64,${asset.base64}`;

    if (dataUrl.length > 300000) {
      throw new Error('image-too-large');
    }

    return dataUrl;
  }

  return asset.uri;
}

function AvatarPreview({
  name,
  avatar,
  size = 80,
  backgroundColor,
}: {
  name?: string;
  avatar?: string;
  size?: number;
  backgroundColor: string;
}) {
  const avatarUri = avatar?.trim();

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
      }}
    >
      {avatarUri ? (
        <Image key={avatarUri} source={{ uri: avatarUri }} style={{ width: size, height: size }} resizeMode="cover" />
      ) : (
        <Text style={{ color: '#FFFFFF', fontSize: size * 0.35, fontWeight: '700' }}>
          {getInitials(name)}
        </Text>
      )}
    </View>
  );
}

function AvatarField({
  name,
  avatar,
  onChange,
  label,
}: {
  name?: string;
  avatar: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const colors = useThemeStore((state) => state.colors);
  const { t } = useTranslation();
  const [uploading, setUploading] = useState(false);

  const handlePickImage = async () => {
    try {
      setUploading(true);
      const uri = await pickAvatarImage();
      if (uri) {
        onChange(uri);
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'permission-denied') {
        Alert.alert(t('common.error'), t('profile.photoPermissionDenied'));
      } else if (error instanceof Error && error.message === 'image-too-large') {
        Alert.alert(t('common.error'), '圖片太大，請選擇較小的圖片後再試一次');
      } else if (error instanceof Error && error.message === 'image-read-failed') {
        Alert.alert(t('common.error'), '圖片讀取失敗，請重新選擇圖片');
      } else {
        Alert.alert(t('common.error'), t('error.unknownError'));
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <View style={styles.formFieldCenter}>
        <AvatarPreview name={name} avatar={avatar} backgroundColor={colors.primary} />
      </View>

      <View style={styles.formField}>
        <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{label}</Text>
        <Pressable
          onPress={handlePickImage}
          style={({ pressed }) => [
            styles.uploadButton,
            {
              backgroundColor: pressed ? colors.cardHover : colors.background,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.uploadButtonLeft}>
            <Upload size={16} color={colors.primary} />
            <Text style={[styles.uploadButtonText, { color: colors.textPrimary }]}>
              {uploading ? t('common.loading') : t('profile.uploadImage')}
            </Text>
          </View>
          <ChevronRight size={16} color={colors.textTertiary} />
        </Pressable>
        <Text style={[styles.uploadHint, { color: colors.textTertiary }]}>
          {t('profile.uploadImageHint')}
        </Text>
      </View>

      <View style={styles.formField}>
        <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('profile.imageUrlFallback')}</Text>
        <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
          <ImageIcon size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
          <RNTextInput
            placeholder={t('profile.imageUrlPlaceholder')}
            placeholderTextColor={colors.textTertiary}
            value={avatar}
            onChangeText={onChange}
            autoCapitalize="none"
            style={[styles.formInput, { color: colors.textPrimary }]}
          />
        </View>
      </View>
    </>
  );
}

function SettingItem({
  icon,
  label,
  value,
  danger = false,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  danger?: boolean;
  onPress?: () => void;
}) {
  const colors = useThemeStore((state) => state.colors);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.settingItem,
        { backgroundColor: pressed ? colors.cardHover : 'transparent' },
      ]}
    >
      <View style={styles.settingLeft}>
        <View style={styles.settingIcon}>{icon}</View>
        <Text style={[styles.settingLabel, { color: danger ? colors.danger : colors.textPrimary }]}>
          {label}
        </Text>
      </View>
      <View style={styles.settingRight}>
        {value && (
          <Text style={[styles.settingValue, { color: colors.textSecondary }]} numberOfLines={1}>
            {value}
          </Text>
        )}
        <ChevronRight size={16} color={colors.textTertiary} />
      </View>
    </Pressable>
  );
}

function AccountEditModal({
  visible,
  user,
  onClose,
  onSaved,
}: {
  visible: boolean;
  user: AppUser | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const colors = useThemeStore((state) => state.colors);
  const updateCurrentUser = useAuthStore((state) => state.updateCurrentUser);
  const updateUser = useUserManagementStore((state) => state.updateUser);
  const updateDriver = useDriverStore((state) => state.updateDriver);
  const { t } = useTranslation();
  const [name, setName] = useState(user?.name || '');
  const [email, setEmail] = useState(user?.email || '');
  const [avatar, setAvatar] = useState(user?.avatar || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(user?.name || '');
      setEmail(user?.email || '');
      setAvatar(user?.avatar || '');
      setError('');
    }
  }, [visible, user]);

  const handleSubmit = async () => {
    if (!name.trim()) {
      setError(t('error.required'));
      return;
    }
    if (!email.trim() || !email.includes('@')) {
      setError(t('error.invalidEmail'));
      return;
    }
    if (!user) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const updates = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        avatar: avatar.trim() || undefined,
      };

      await updateCurrentUser(updates);

      if (user.role === 'driver' || user.role === 'company') {
        await updateUser(user.id, updates);
      }

      if (user.role === 'driver') {
        await updateDriver(user.id, { ...updates });
      }

      onClose();
      await onSaved();
      Alert.alert(t('common.success'), '更新成功');
    } catch {
      setError(t('error.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.centeredModalOverlay}>
        <Animated.View entering={FadeInDown.springify()} style={[styles.centeredModalContent, { backgroundColor: colors.card }]}>
          <View style={[styles.centeredModalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.centeredModalTitle, { color: colors.textPrimary }]}>
              {t('profile.editAccount')}
            </Text>
            <Pressable onPress={onClose}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>

          <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
            <AvatarField name={name} avatar={avatar} onChange={setAvatar} label={t('profile.profileImage')} />

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('profile.displayName')}</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <User size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                <RNTextInput
                  placeholder={t('auth.name')}
                  placeholderTextColor={colors.textTertiary}
                  value={name}
                  onChangeText={setName}
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('auth.email')}</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <Mail size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                <RNTextInput
                  placeholder="user@example.com"
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            {error ? <Text style={[styles.formError, { color: colors.danger }]}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <Button title={t('common.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title={t('common.save')} onPress={handleSubmit} loading={loading} style={{ flex: 1.5 }} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function AddUserModal({ visible, onClose, onAdded }: { visible: boolean; onClose: () => void; onAdded: () => void }) {
  const colors = useThemeStore((state) => state.colors);
  const addUser = useUserManagementStore((state) => state.addUser);
  const addDriver = useDriverStore((state) => state.addDriver);
  const { getCompanies } = useUserManagementStore();
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('');
  const [role, setRole] = useState<'driver' | 'company'>('driver');
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const companies = getCompanies();
  const companyOptions = [
    { value: '', label: t('company.noCompany') },
    ...companies.map((c) => ({
      value: c.id,
      label: c.nameZh || c.name || c.email,
    })),
  ];

  const reset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setAvatar('');
    setRole('driver');
    setCompanyId('');
    setError('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError(t('error.required')); return; }
    if (!email.trim() || !email.includes('@')) { setError(t('error.invalidEmail')); return; }
    if (password.length < 4) { setError(t('error.passwordTooShort')); return; }
    setLoading(true);
    setError('');
    const normalizedAvatar = avatar.trim() || undefined;
    const result = await addUser(name.trim(), email.trim().toLowerCase(), password, role, phone.trim() || undefined, normalizedAvatar, name.trim(), undefined, undefined, role === 'driver' && companyId ? companyId : undefined);
    if (result.success) {
      if (role === 'driver') {
        await addDriver(name.trim(), phone.trim(), email.trim().toLowerCase(), undefined, normalizedAvatar, role === 'driver' && companyId ? companyId : undefined);
      }
      reset();
      onClose();
      await onAdded();
      Alert.alert(t('common.success'), '新增成功');
    } else {
      setLoading(false);
      setError(result.error || t('error.unknownError'));
    }
  };

  useEffect(() => { if (!visible) reset(); }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.centeredModalOverlay}>
        <Animated.View entering={FadeInDown.springify()} style={[styles.centeredModalContent, { backgroundColor: colors.card }]}>
          <View style={[styles.centeredModalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.centeredModalTitle, { color: colors.textPrimary }]}>
              {t('profile.addUser')}
            </Text>
            <Pressable onPress={onClose}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>

          <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
            <AvatarField name={name} avatar={avatar} onChange={setAvatar} label={t('profile.profileImage')} />

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('profile.role')}</Text>
              <View style={styles.roleSelector}>
                {(['driver', 'company'] as const).map((itemRole) => (
                  <Pressable
                    key={itemRole}
                    onPress={() => setRole(itemRole)}
                    style={[
                      styles.roleOption,
                      {
                        borderColor: role === itemRole ? colors.primary : colors.border,
                        backgroundColor: role === itemRole ? `${colors.primary}20` : 'transparent',
                      },
                    ]}
                  >
                    <Text style={[styles.roleOptionText, { color: role === itemRole ? colors.primary : colors.textSecondary }]}>
                      {t('profile.' + itemRole)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('profile.displayName')}</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <User size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                <RNTextInput
                  placeholder={t('auth.name')}
                  placeholderTextColor={colors.textTertiary}
                  value={name}
                  onChangeText={setName}
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('auth.email')}</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <Mail size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                <RNTextInput
                  placeholder="user@example.com"
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('auth.phone')}</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <RNTextInput
                  placeholder="+852 XXXX XXXX"
                  placeholderTextColor={colors.textTertiary}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            {role === 'driver' && companies.length > 0 && (
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('company.title')}</Text>
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      t('company.selectCompany'),
                      '',
                      [
                        { text: t('company.noCompany'), onPress: () => setCompanyId('') },
                        ...companies.map((c) => ({
                          text: c.nameZh || c.name || c.email,
                          onPress: () => setCompanyId(c.id),
                        })),
                      ]
                    );
                  }}
                  style={[styles.formInputWrap, { backgroundColor: colors.background }]}
                >
                  <Building2 size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                  <Text style={[styles.formInput, { color: colors.textPrimary, flex: 1 }]}>
                    {companyId
                      ? (companies.find((c) => c.id === companyId)?.nameZh || companies.find((c) => c.id === companyId)?.name || companies.find((c) => c.id === companyId)?.email)
                      : t('company.noCompany')}
                  </Text>
                  <ChevronRight size={16} color={colors.textTertiary} />
                </Pressable>
              </View>
            )}

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('auth.password')}</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <Shield size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                <RNTextInput
                  placeholder={t('error.passwordTooShort')}
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            {error ? <Text style={[styles.formError, { color: colors.danger }]}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <Button title={t('common.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title={t('profile.addUser')} onPress={handleSubmit} loading={loading} style={{ flex: 1.5 }} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function EditUserModal({
  visible,
  user,
  onClose,
  onSaved,
}: {
  visible: boolean;
  user: ManagedUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const colors = useThemeStore((state) => state.colors);
  const updateUser = useUserManagementStore((state) => state.updateUser);
  const updateDriver = useDriverStore((state) => state.updateDriver);
  const { getCompanies } = useUserManagementStore();
  const { t } = useTranslation();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || '');
  const [avatar, setAvatar] = useState(user.avatar || '');
  const [password, setPassword] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const companies = getCompanies();
  const isDriver = user.role === 'driver';

  useEffect(() => {
    if (visible) {
      setName(user.name);
      setEmail(user.email);
      setPhone(user.phone || '');
      setAvatar(user.avatar || '');
      setPassword('');
      setCompanyId(user.companyId || '');
      setError('');
    }
  }, [visible, user.id, user.name, user.email, user.phone, user.avatar]);

  const handleSubmit = async () => {
    if (!name.trim()) { setError(t('error.required')); return; }
    if (!email.trim() || !email.includes('@')) { setError(t('error.invalidEmail')); return; }
    setLoading(true);
    setError('');
    try {
      const updates: Record<string, any> = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        avatar: avatar.trim() || undefined,
      };
      if (isDriver) {
        updates.companyId = companyId || undefined;
      }
      await updateUser(user.id, updates);
      if (isDriver) {
        await updateDriver(user.id, { ...updates });
      }
      onClose();
      await onSaved();
      Alert.alert(t('common.success'), '更新成功');
    } catch {
      setError(t('error.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.centeredModalOverlay}>
        <Animated.View entering={FadeInDown.springify()} style={[styles.centeredModalContent, { backgroundColor: colors.card }]}>
          <View style={[styles.centeredModalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.centeredModalTitle, { color: colors.textPrimary }]}>
              {isDriver ? t('company.editDriver') : t('company.editCompany')}
            </Text>
            <Pressable onPress={onClose}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>

          <ScrollView style={{ maxHeight: 560 }} showsVerticalScrollIndicator={false}>
            <AvatarField name={name} avatar={avatar} onChange={setAvatar} label={t('profile.profileImage')} />

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('profile.displayName')}</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <User size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                <RNTextInput
                  placeholder={t('auth.name')}
                  placeholderTextColor={colors.textTertiary}
                  value={name}
                  onChangeText={setName}
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('auth.email')}</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <Mail size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                <RNTextInput
                  placeholder="user@example.com"
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('auth.phone')}</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <RNTextInput
                  placeholder="+852 XXXX XXXX"
                  placeholderTextColor={colors.textTertiary}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <SelectField
                label={t('company.title')}
                placeholder={t('company.selectCompany')}
                value={companyId || ''}
                options={[
                  { value: '', label: t('company.noCompany') },
                  ...companies.map((c) => ({
                    value: c.id,
                    label: c.nameZh || c.name || c.email,
                  })),
                ]}
                onValueChange={(val) => setCompanyId(val)}
              />
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('profile.newPassword')}</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <Shield size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                <RNTextInput
                  placeholder={t('error.passwordTooShort')}
                  placeholderTextColor={colors.textTertiary}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            {error ? <Text style={[styles.formError, { color: colors.danger }]}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <Button title={t('common.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title={t('common.save')} onPress={handleSubmit} loading={loading} style={{ flex: 1.5 }} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function DriverEditModal({
  visible,
  driver,
  onClose,
  onSaved,
}: {
  visible: boolean;
  driver: ManagedUser;
  onClose: () => void;
  onSaved: () => void;
}) {
  const colors = useThemeStore((state) => state.colors);
  const updateUser = useUserManagementStore((state) => state.updateUser);
  const updateDriver = useDriverStore((state) => state.updateDriver);
  const { getCompanies } = useUserManagementStore();
  const { t } = useTranslation();
  const [name, setName] = useState(driver.name);
  const [email, setEmail] = useState(driver.email);
  const [phone, setPhone] = useState(driver.phone || '');
  const [avatar, setAvatar] = useState(driver.avatar || '');
  const [companyId, setCompanyId] = useState(driver.companyId || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const companies = getCompanies();

  useEffect(() => {
    if (visible) {
      setName(driver.name);
      setEmail(driver.email);
      setPhone(driver.phone || '');
      setAvatar(driver.avatar || '');
      setCompanyId(driver.companyId || '');
      setError('');
    }
  }, [visible, driver.id]);

  const handleSubmit = async () => {
    if (!name.trim()) { setError(t('error.required')); return; }
    if (!email.trim() || !email.includes('@')) { setError(t('error.invalidEmail')); return; }
    setLoading(true);
    setError('');
    try {
      await updateUser(driver.id, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        avatar: avatar.trim() || undefined,
        companyId: companyId || undefined,
      });
      await updateDriver(driver.id, {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        avatar: avatar.trim() || undefined,
        companyId: companyId || undefined,
      });
      onClose();
      await onSaved();
      if (isWeb) {
        window.alert('更新成功');
      } else {
        Alert.alert(t('common.success'), '更新成功');
      }
    } catch {
      setError(t('error.unknownError'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={styles.centeredModalOverlay}>
        <Animated.View entering={FadeInDown.springify()} style={[styles.centeredModalContent, { backgroundColor: colors.card }]}>
          <View style={[styles.centeredModalHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.centeredModalTitle, { color: colors.textPrimary }]}>編輯司機</Text>
            <Pressable onPress={onClose}><X size={20} color={colors.textSecondary} /></Pressable>
          </View>

          <ScrollView style={{ maxHeight: 500 }} showsVerticalScrollIndicator={false}>
            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>姓名</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <User size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                <RNTextInput
                  placeholder="請輸入姓名"
                  placeholderTextColor={colors.textTertiary}
                  value={name}
                  onChangeText={setName}
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>電話</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <Truck size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                <RNTextInput
                  placeholder="請輸入電話"
                  placeholderTextColor={colors.textTertiary}
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType="phone-pad"
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            <View style={styles.formField}>
              <Text style={[styles.formLabel, { color: colors.textSecondary }]}>電郵</Text>
              <View style={[styles.formInputWrap, { backgroundColor: colors.background }]}>
                <Mail size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                <RNTextInput
                  placeholder="請輸入電郵"
                  placeholderTextColor={colors.textTertiary}
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  style={[styles.formInput, { color: colors.textPrimary }]}
                />
              </View>
            </View>

            {companies.length > 0 && (
              <View style={styles.formField}>
                <Text style={[styles.formLabel, { color: colors.textSecondary }]}>{t('company.title')}</Text>
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      t('company.selectCompany'),
                      '',
                      [
                        { text: t('company.noCompany'), onPress: () => setCompanyId('') },
                        ...companies.map((c) => ({
                          text: c.nameZh || c.name || c.email,
                          onPress: () => setCompanyId(c.id),
                        })),
                      ]
                    );
                  }}
                  style={[styles.formInputWrap, { backgroundColor: colors.background }]}
                >
                  <Building2 size={16} color={colors.textTertiary} style={{ marginRight: spacing.sm }} />
                  <Text style={[styles.formInput, { color: colors.textPrimary, flex: 1 }]}>
                    {companyId
                      ? (companies.find((c) => c.id === companyId)?.nameZh || companies.find((c) => c.id === companyId)?.name || companies.find((c) => c.id === companyId)?.email)
                      : t('company.noCompany')}
                  </Text>
                  <ChevronRight size={16} color={colors.textTertiary} />
                </Pressable>
              </View>
            )}

            {error ? <Text style={[styles.formError, { color: colors.danger }]}>{error}</Text> : null}
          </ScrollView>

          <View style={styles.modalActions}>
            <Button title={t('common.cancel')} variant="ghost" onPress={onClose} style={{ flex: 1 }} />
            <Button title={t('common.save')} onPress={handleSubmit} loading={loading} style={{ flex: 1.5 }} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

export default function ProfileScreen() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.role);
  const { colors } = useThemeStore();
  const { users, loadUsers } = useUserManagementStore();
  const drivers = useDriverStore((state) => state.drivers);
  const loadDrivers = useDriverStore((state) => state.loadDrivers);
  const { locale, t, setLocale } = useTranslation();
  const inventoryStore = useInventoryStore();
  const trashItems = useTrashStore((state) => state.items);
  const loadTrash = useTrashStore((state) => state.loadTrash);
  const trashCount = trashItems.filter((it) => it.expiresAt > Date.now()).length;
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editingDriver, setEditingDriver] = useState<ManagedUser | null>(null);
  const [accountEditVisible, setAccountEditVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoadingDummyData, setIsLoadingDummyData] = useState(false);

  const isAdmin = role === 'admin';
  const isNonAdmin = !isAdmin;
  const canManageUsers = role === 'admin' || role === 'company';

  useEffect(() => {
    loadUsers();
    loadDrivers();
    if (isAdmin) loadTrash();
  }, [loadUsers, loadDrivers, loadTrash, isAdmin, refreshKey]);

  const roleConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    admin: { label: t('profile.admin'), color: colors.primary, icon: <Shield size={12} color={colors.primary} /> },
    company: { label: t('profile.company'), color: colors.secondary, icon: <View style={{ width: 12, height: 12, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 10, fontWeight: '700', color: colors.secondary }}>C</Text></View> },
    driver: { label: t('profile.driver'), color: colors.accentSecondary, icon: <Truck size={12} color={colors.accentSecondary} /> },
    user: { label: t('profile.user'), color: colors.textSecondary, icon: <User size={12} color={colors.textSecondary} /> },
  };
  const currentRole = role ? roleConfig[role] : roleConfig.user;

  const handleLogout = async () => {
    const confirmed = await new Promise<boolean>((resolve) => {
      if (isWeb) {
        resolve(confirm(t('profile.signOutConfirm')));
      } else {
        Alert.alert(
          t('profile.signOut'),
          t('profile.signOutConfirm'),
          [
            { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
            { text: t('profile.signOut'), style: 'destructive', onPress: () => resolve(true) },
          ],
          { cancelable: true, onDismiss: () => resolve(false) }
        );
      }
    });

    if (confirmed) {
      await logout();
      router.replace('/(auth)/login');
    }
  };

  const handleDeleteUser = (managedUser: ManagedUser) => {
    const title = '刪除使用者';
    const body = `確定要將「${managedUser.name}」移到垃圾桶嗎？\n\n此操作可在 30 天內從垃圾桶還原。`;
    const cancelText = '取消';
    const confirmText = '移到垃圾桶';

    const doDelete = async () => {
      try {
        await useUserManagementStore.getState().softDeleteUser(managedUser.id);
        if (managedUser.role === 'driver') {
          await useDriverStore.getState().deleteDriver(managedUser.id);
        }
        await useDriverStore.getState().loadDrivers();
        setRefreshKey((value) => value + 1);
        if (isWeb) {
          window.alert(`✅ 已移到垃圾桶\n\n「${managedUser.name}」已移至垃圾桶，30 天內可在垃圾桶頁面還原。`);
        } else {
          Alert.alert('✅ 已移到垃圾桶', `${managedUser.name} 已移至垃圾桶，30 天內可在垃圾桶頁面還原。`);
        }
      } catch (error) {
        if (isWeb) {
          window.alert(`❌ 刪除失敗\n\n${error instanceof Error ? error.message : '未知錯誤，請稍後再試'}`);
        } else {
          Alert.alert('❌ 刪除失敗', error instanceof Error ? error.message : '未知錯誤，請稍後再試');
        }
      }
    };

    if (isWeb) {
      if (window.confirm(`${title}\n\n${body}`)) {
        void doDelete();
      }
    } else {
      Alert.alert(title, body, [
        { text: cancelText, style: 'cancel' },
        {
          text: confirmText,
          style: 'destructive',
          onPress: () => void doDelete(),
        },
      ]);
    }
  };

  const handleEditUser = (managedUser: ManagedUser) => {
    setEditingUser(managedUser);
    setEditModalVisible(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title="個人資料"
        leftElement={
          <Pressable onPress={() => router.push('/(tabs)')} hitSlop={8}>
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
        <Animated.View entering={FadeInDown.springify()}>
          <Card style={styles.profileCard}>
            <View style={styles.avatarContainer}>
              <AvatarPreview name={user?.name} avatar={user?.avatar} backgroundColor={colors.primary} />
              {isAdmin && currentRole && (
                <View
                  style={[
                    styles.adminBadge,
                    { backgroundColor: colors.card, borderColor: colors.background },
                  ]}
                >
                  {currentRole.icon}
                </View>
              )}
            </View>
            <Text style={[styles.userName, { color: colors.textPrimary }]}>
              {user?.name || 'Guest'}
            </Text>
            <Text style={[styles.userEmail, { color: colors.textSecondary }]}>
              {user?.email || 'No email'}
            </Text>
            {isAdmin && currentRole && (
              <View
                style={[
                  styles.adminTag,
                  { backgroundColor: `${currentRole.color}20`, borderColor: currentRole.color },
                ]}
              >
                <Text style={[styles.adminTagText, { color: currentRole.color }]}>
                  {currentRole.label}
                </Text>
              </View>
            )}
            {isNonAdmin && currentRole && (
              <View
                style={[
                  styles.adminTag,
                  { backgroundColor: `${currentRole.color}20`, borderColor: currentRole.color },
                ]}
              >
                <Text style={[styles.adminTagText, { color: currentRole.color }]}>
                  {currentRole.label}
                </Text>
              </View>
            )}

            <SettingItem
              icon={<User size={18} color={colors.textSecondary} />}
              label={t('profile.displayName')}
              value={user?.name || 'N/A'}
              onPress={() => setAccountEditVisible(true)}
            />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingItem
              icon={<Mail size={18} color={colors.textSecondary} />}
              label={t('auth.email')}
              value={user?.email || 'N/A'}
              onPress={() => setAccountEditVisible(true)}
            />
            {isAdmin && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <SettingItem
                  icon={<Award size={18} color={colors.textSecondary} />}
                  label={t('profile.role')}
                  value={currentRole.label}
                />
              </>
            )}
          </Card>
        </Animated.View>

        {isAdmin && (
          <Pressable
            style={[styles.adminPanelBtn, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/onefleet-system-admin')}
          >
            <Shield size={18} color="#fff" />
            <Text style={styles.adminPanelBtnText}>OneFleet 系統管理</Text>
            <ChevronRight size={18} color="#fff" />
          </Pressable>
        )}

        {isAdmin && (
          <>
            {/* 使用者管理 - 僅 admin 可見 */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: 0, marginLeft: 0 }]}>
                  {t('profile.userManagement')}
                </Text>
                <Pressable
                  style={[styles.addBtn, { backgroundColor: `${colors.primary}20` }]}
                  onPress={() => setAddModalVisible(true)}
                >
                  <Plus size={14} color={colors.primary} />
                  <Text style={[styles.addBtnText, { color: colors.primary }]}>
                    {t('profile.addUser')}
                  </Text>
                </Pressable>
              </View>

              {users.length === 0 ? (
                <Card style={styles.emptyUsersCard}>
                  <Users size={24} color={colors.textTertiary} />
                  <Text style={[styles.emptyUsersText, { color: colors.textTertiary }]}>
                    {t('profile.noUsers')}
                  </Text>
                </Card>
              ) : (
                <Card style={styles.settingsCard} key={refreshKey}>
                  {users.map((managedUser, index) => (
                    <View key={managedUser.id}>
                      <View style={styles.userRow}>
                        <Pressable
                          style={({ pressed }) => [
                            styles.userRowContent,
                            { backgroundColor: pressed ? colors.cardHover : 'transparent' },
                          ]}
                          onPress={() => handleEditUser(managedUser)}
                        >
                          <AvatarPreview
                            name={managedUser.name}
                            avatar={managedUser.avatar}
                            size={36}
                            backgroundColor={managedUser.role === 'driver' ? colors.accentSecondary : colors.secondary}
                          />
                          <View style={styles.userInfo}>
                            <Text style={[styles.userNameSmall, { color: colors.textPrimary }]}>{managedUser.name}</Text>
                            <Text style={[styles.userEmailSmall, { color: colors.textTertiary }]}>{managedUser.email}</Text>
                          </View>
                          <View style={[styles.userRoleTag, { backgroundColor: managedUser.role === 'driver' ? `${colors.accentSecondary}20` : `${colors.secondary}20` }]}>
                            <Text style={[styles.userRoleTagText, { color: managedUser.role === 'driver' ? colors.accentSecondary : colors.secondary }]}>
                              {t('profile.' + (managedUser.role === 'driver' ? 'driver' : 'company'))}
                            </Text>
                          </View>
                        </Pressable>
                        <TouchableOpacity
                          style={styles.userDeleteBtn}
                          onPress={() => handleDeleteUser(managedUser)}
                          hitSlop={12}
                        >
                          <X size={16} color={colors.danger} />
                        </TouchableOpacity>
                      </View>
                      {index < users.length - 1 && (
                        <View style={[styles.divider, { backgroundColor: colors.border }]} />
                      )}
                    </View>
                  ))}
                </Card>
              )}
              <Text style={[styles.hintText, { color: colors.textTertiary }]}>
                {t('profile.tapToEdit')}
              </Text>
            </View>

            {/* 公司管理 - 僅 admin 可見 */}
            <View style={styles.section}>
              <CompanyList />
            </View>
          </>
        )}

        {/* 司機管理 - admin 和 company 角色可見 */}
        {(role === 'admin' || role === 'company') && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>🚛 司機管理</Text>
            {/* 調試資訊 */}
            <Text style={{ fontSize: 10, color: colors.textTertiary, marginBottom: 4 }}>
              Debug: 登入公司ID={role === 'company' ? user?.id : 'admin'} | 所有司機數={users.filter(u => u.role === 'driver').length}
            </Text>
            {users.filter(u => u.role === 'driver').map(d => (
              <Text key={d.id} style={{ fontSize: 9, color: '#999', marginLeft: 4 }}>
                - {d.name}: companyId={d.companyId || '無'}
              </Text>
            ))}
            <Card style={styles.settingsCard}>
              {(() => {
                const managedDrivers = users
                  .filter((u) => u.role === 'driver')
                  .map((u) => ({
                    id: u.id,
                    name: u.name || u.email,
                    phone: u.phone || '',
                    email: u.email,
                    avatar: u.avatar,
                    companyId: u.companyId,
                  }));

                // 公司角色的司機應顯示有綁定到該公司的司機
                // 公司帳號登入時，user.id 就是公司 ID，司機的 companyId 應等於此值
                const currentCompanyId = role === 'company' ? user?.id : undefined;
                const filteredDrivers = role === 'admin'
                  ? managedDrivers
                  : managedDrivers.filter(d => d.companyId === currentCompanyId);
                if (filteredDrivers.length === 0) {
                  return (
                    <View style={styles.emptyUsersCard}>
                      <Truck size={24} color={colors.textTertiary} />
                      <Text style={[styles.emptyUsersText, { color: colors.textTertiary }]}>尚無司機資料</Text>
                    </View>
                  );
                }
                return filteredDrivers.map((driver, index) => (
                  <View key={driver.id}>
                    {index > 0 && <View style={[styles.divider, { backgroundColor: colors.border }]} />}
                    <View style={styles.userRow}>
                      <Pressable
                        style={({ pressed }) => [
                          styles.userRowContent,
                          { backgroundColor: pressed ? colors.cardHover : 'transparent' },
                        ]}
                        onPress={() => { setEditingDriver(driver); setEditModalVisible(true); }}
                      >
                        <AvatarPreview
                          name={driver.name}
                          avatar={driver.avatar}
                          size={36}
                          backgroundColor={colors.accentSecondary}
                        />
                        <View style={styles.userInfo}>
                          <Text style={[styles.userNameSmall, { color: colors.textPrimary }]}>{driver.name}</Text>
                          <Text style={[styles.userEmailSmall, { color: colors.textTertiary }]}>{driver.phone}</Text>
                        </View>
                      </Pressable>
                      <TouchableOpacity
                        style={styles.userDeleteBtn}
                        onPress={() => {
                          if (isWeb) {
                            if (window.confirm(`確定要刪除司機「${driver.name}」嗎？`)) {
                              useUserManagementStore.getState().softDeleteUser(driver.id);
                              useDriverStore.getState().deleteDriver(driver.id);
                              useDriverStore.getState().loadDrivers();
                              setRefreshKey((v) => v + 1);
                            }
                          } else {
                            Alert.alert(
                              '刪除司機',
                              `確定要刪除司機「${driver.name}」嗎？`,
                              [
                                { text: '取消', style: 'cancel' },
                                {
                                  text: '刪除',
                                  style: 'destructive',
                                  onPress: async () => {
                                    await useUserManagementStore.getState().softDeleteUser(driver.id);
                                    await useDriverStore.getState().deleteDriver(driver.id);
                                    await useDriverStore.getState().loadDrivers();
                                    setRefreshKey((v) => v + 1);
                                  },
                                },
                              ]
                            );
                          }
                        }}
                        hitSlop={12}
                      >
                        <X size={16} color={colors.danger} />
                      </TouchableOpacity>
                    </View>
                  </View>
                ));
              })()}
            </Card>
          </View>
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('profile.account')}</Text>
          <Card style={styles.settingsCard}>
            <SettingItem
              icon={<LogOut size={18} color={colors.danger} />}
              label={t('profile.signOut')}
              danger
              onPress={handleLogout}
            />
          </Card>
        </View>

        <View style={styles.appInfo}>
          <Text style={[styles.appVersion, { color: colors.textTertiary }]}>
            FleetPro v1.0.0
          </Text>
          <Text style={[styles.appCopyright, { color: colors.textTertiary }]}>
            {t('dashboard.title')}
          </Text>
        </View>
      </ScrollView>

      <AccountEditModal
        visible={accountEditVisible}
        user={user}
        onClose={() => setAccountEditVisible(false)}
        onSaved={async () => {
          setRefreshKey((value) => value + 1);
          await loadUsers();
        }}
      />

      <AddUserModal
        visible={addModalVisible}
        onClose={() => setAddModalVisible(false)}
        onAdded={async () => {
          setRefreshKey((value) => value + 1);
          await loadUsers();
        }}
      />

      {editingUser && (
        <EditUserModal
          visible={editModalVisible}
          user={editingUser}
          onClose={() => { setEditModalVisible(false); setEditingUser(null); }}
          onSaved={async () => {
            setRefreshKey((value) => value + 1);
            await loadUsers();
          }}
        />
      )}

      {editingDriver && (
        <DriverEditModal
          visible={editModalVisible}
          driver={editingDriver}
          onClose={() => { setEditModalVisible(false); setEditingDriver(null); }}
          onSaved={async () => {
            setRefreshKey((value) => value + 1);
            await loadUsers();
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  adminPanelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: 12,
    gap: spacing.sm,
  },
  adminPanelBtnText: {
    flex: 1,
    color: '#fff',
    fontSize: typography.fontSize.base,
    fontWeight: '600',
  },
  profileCard: {
    margin: spacing.lg,
    padding: spacing['2xl'],
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: spacing.lg,
  },
  adminBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userName: {
    fontSize: typography.fontSize.xl,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  userEmail: {
    fontSize: typography.fontSize.sm,
    marginBottom: spacing.md,
  },
  adminTag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: borderRadius.full,
    borderWidth: 1,
  },
  adminTagText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
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
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingIcon: {
    marginRight: spacing.md,
  },
  settingLabel: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
  },
  settingRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    maxWidth: '45%',
  },
  settingValue: {
    fontSize: typography.fontSize.sm,
  },
  divider: {
    height: 1,
    marginLeft: spacing.lg + 18 + spacing.md,
  },
  appInfo: {
    alignItems: 'center',
    marginTop: spacing['3xl'],
    paddingHorizontal: spacing.lg,
  },
  appVersion: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  appCopyright: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
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
  emptyUsersCard: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  emptyUsersText: {
    fontSize: typography.fontSize.sm,
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
  userDeleteBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    justifyContent: 'center',
  },
  userRoleTag: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: borderRadius.sm,
  },
  userRoleTagText: {
    fontSize: typography.fontSize.xs,
    fontWeight: '600',
  },
  hintText: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.sm,
    textAlign: 'center',
  },
  centeredModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  centeredModalContent: {
    width: '100%',
    maxWidth: 400,
    borderRadius: borderRadius.xl,
    padding: 0,
    overflow: 'hidden',
  },
  centeredModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.lg,
    borderBottomWidth: 1,
  },
  centeredModalTitle: {
    fontSize: typography.fontSize.lg,
    fontWeight: '700',
  },
  formField: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  formFieldCenter: {
    alignItems: 'center',
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  formLabel: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
    marginBottom: spacing.sm,
  },
  formInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    height: 48,
  },
  formInput: {
    flex: 1,
    fontSize: typography.fontSize.base,
    height: '100%',
  },
  formError: {
    fontSize: typography.fontSize.sm,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  modalActions: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  roleOption: {
    flex: 1,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  roleOptionText: {
    fontSize: typography.fontSize.sm,
    fontWeight: '600',
  },
  uploadButton: {
    height: 48,
    borderWidth: 1,
    borderRadius: borderRadius.md,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  uploadButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  uploadButtonText: {
    fontSize: typography.fontSize.base,
    fontWeight: '500',
  },
  uploadHint: {
    fontSize: typography.fontSize.xs,
    marginTop: spacing.xs,
  },
});
