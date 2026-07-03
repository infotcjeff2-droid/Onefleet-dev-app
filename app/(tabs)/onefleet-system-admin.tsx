import { View, Text, StyleSheet, ScrollView, Alert, Pressable, Modal, TextInput as RNTextInput, TouchableOpacity, Image } from 'react-native';
import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { LogOut, Shield, Settings, ChevronRight, User, Mail, Award, Truck, Plus, X, Users, Globe, Image as ImageIcon, Upload, Cpu, Link2, Warehouse, Package, Zap, RefreshCw } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/store/authStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useDriverStore } from '@/store/driverStore';
import { useVehicleStore } from '@/store/vehicleStore';
import { useGps808Store } from '@/store/gps808Store';
import { useTranslation } from '@/i18n';
import { spacing, typography, borderRadius } from '@/constants/theme';
import { Header } from '@/components/ui/Header';
import { useState, useEffect } from 'react';
import { User as AppUser } from '@/types';

const isWeb = Platform.OS === 'web';

type ManagedUser = { id: string; name: string; email: string; phone?: string; role: string; password?: string; avatar?: string };

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
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [avatar, setAvatar] = useState('');
  const [role, setRole] = useState<'driver' | 'company'>('driver');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setName('');
    setEmail('');
    setPhone('');
    setPassword('');
    setAvatar('');
    setRole('driver');
    setError('');
  };

  const handleSubmit = async () => {
    if (!name.trim()) { setError(t('error.required')); return; }
    if (!email.trim() || !email.includes('@')) { setError(t('error.invalidEmail')); return; }
    if (password.length < 4) { setError(t('error.passwordTooShort')); return; }
    setLoading(true);
    setError('');
    const normalizedAvatar = avatar.trim() || undefined;
    const result = await addUser(name.trim(), email.trim().toLowerCase(), password, role, phone.trim() || undefined, normalizedAvatar);
    if (result.success) {
      if (role === 'driver') {
        await addDriver(name.trim(), phone.trim(), email.trim().toLowerCase(), undefined, normalizedAvatar);
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
  const { t } = useTranslation();
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || '');
  const [avatar, setAvatar] = useState(user.avatar || '');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (visible) {
      setName(user.name);
      setEmail(user.email);
      setPhone(user.phone || '');
      setAvatar(user.avatar || '');
      setPassword('');
      setError('');
    }
  }, [visible, user.id, user.name, user.email, user.phone, user.avatar]);

  const handleSubmit = async () => {
    if (!name.trim()) { setError(t('error.required')); return; }
    if (!email.trim() || !email.includes('@')) { setError(t('error.invalidEmail')); return; }
    setLoading(true);
    setError('');
    try {
      const updates = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        avatar: avatar.trim() || undefined,
      };
      await updateUser(user.id, updates);
      if (user.role === 'driver') {
        await updateDriver(user.id, updates);
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
              {t('common.edit')} {t('profile.userManagement')}
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

export default function ProfileScreen() {
  const router = useRouter();
  const logout = useAuthStore((state) => state.logout);
  const user = useAuthStore((state) => state.user);
  const role = useAuthStore((state) => state.role);
  const { colors } = useThemeStore();
  const { users, loadUsers } = useUserManagementStore();
  const { locale, t, setLocale } = useTranslation();
  const inventoryStore = useInventoryStore();
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [accountEditVisible, setAccountEditVisible] = useState(false);
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [isLoadingDummyData, setIsLoadingDummyData] = useState(false);

  const isAdmin = role === 'admin';
  const isNonAdmin = !isAdmin;
  const canManageUsers = role === 'admin' || role === 'company';

  useEffect(() => {
    loadUsers();
  }, [loadUsers, refreshKey]);

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
    Alert.alert(t('common.delete') + ' ' + t('profile.userManagement'), `${t('common.delete')} ${managedUser.name}?`, [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('common.delete'),
        style: 'destructive',
        onPress: async () => {
          await useUserManagementStore.getState().deleteUser(managedUser.id);
          if (managedUser.role === 'driver') {
            await useDriverStore.getState().deleteDriver(managedUser.id);
          }
          await useDriverStore.getState().loadDrivers();
          setRefreshKey((value) => value + 1);
        },
      },
    ]);
  };

  const handleEditUser = (managedUser: ManagedUser) => {
    setEditingUser(managedUser);
    setEditModalVisible(true);
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header
        title={isNonAdmin ? t('nav.profile') : t('nav.onefleetSystemAdmin')}
        leftElement={
          <Image
            source={isNonAdmin ? require('@/assets/onefleet_logo_small.png') : require('@/assets/onefleet_2560.png')}
            style={{ width: isNonAdmin ? 70 : 90, height: isNonAdmin ? 26 : 30 }}
            resizeMode="contain"
          />
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
          </Card>
        </Animated.View>

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('profile.account')}</Text>
          <Card style={styles.settingsCard}>
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
        </View>

        {canManageUsers && (
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
        )}

        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('profile.preferences')}</Text>
          <Card style={styles.settingsCard}>
            <SettingItem
              icon={<Globe size={18} color={colors.secondary} />}
              label={t('settings.language')}
              value={t('languages.' + locale)}
              onPress={() => setLocale(locale === 'zh-TW' ? 'en' : 'zh-TW')}
            />
            {isAdmin && (
              <>
                <View style={[styles.divider, { backgroundColor: colors.border }]} />
                <SettingItem
                  icon={<Settings size={18} color={colors.primary} />}
                  label={t('profile.appSettings')}
                  onPress={() => router.push('/settings')}
                />
              </>
            )}
          </Card>
        </View>

        {isAdmin && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>{t('nav.system')}</Text>
            <Card style={styles.settingsCard}>
              <SettingItem
                icon={<Truck size={18} color={colors.textSecondary} />}
                label={t('nav.vehicleManagement')}
                onPress={() => router.push('/vehicle-management')}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SettingItem
                icon={<Link2 size={18} color={colors.textSecondary} />}
                label={t('nav.pairDevice')}
                onPress={() => router.push('/pair-device')}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SettingItem
                icon={<Cpu size={18} color={colors.primary} />}
                label={t('nav.config')}
                onPress={() => router.push('/onefleet-system-admin/config')}
              />
            </Card>
          </View>
        )}

        {/* Inventory & Dispatch Section - Admin Only */}
        {isAdmin && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>📦 庫存與配送</Text>
            <Card style={styles.settingsCard}>
              <SettingItem
                icon={<Warehouse size={18} color="#F59E0B" />}
                label="倉庫管理"
                onPress={() => router.push('/warehouse')}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SettingItem
                icon={<Package size={18} color="#8B5CF6" />}
                label="庫存物品管理"
                onPress={() => router.push('/inventory')}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SettingItem
                icon={<Truck size={18} color="#3B82F6" />}
                label="車隊管理"
                onPress={() => router.push('/fleet')}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SettingItem
                icon={<Zap size={18} color="#22C55E" />}
                label="智能配送調度"
                onPress={() => router.push('/dispatch')}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SettingItem
                icon={<RefreshCw size={18} color="#EF4444" />}
                label="補貨訂單管理"
                onPress={() => router.push('/replenishment')}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SettingItem
                icon={<RefreshCw size={18} color="#06B6D4" />}
                label="🔧 初始化測試資料"
                onPress={async () => {
                  const confirmed = await new Promise<boolean>((resolve) => {
                    if (isWeb) {
                      resolve(confirm('確定要初始化測試資料嗎？這會清除現有資料。'));
                    } else {
                      Alert.alert(
                        '初始化測試資料',
                        '確定要初始化測試資料嗎？這會清除現有資料並載入假資料。',
                        [
                          { text: '取消', style: 'cancel', onPress: () => resolve(false) },
                          { text: '確定', style: 'destructive', onPress: () => resolve(true) },
                        ]
                      );
                    }
                  });

                  if (confirmed) {
                    setIsLoadingDummyData(true);
                    try {
                      await inventoryStore.initWithDummyData();
                      await inventoryStore.loadAll();
                      if (isWeb) {
                        alert('✅ 測試資料初始化完成！');
                      } else {
                        Alert.alert('✅ 完成', '測試資料初始化完成！');
                      }
                    } catch (error) {
                      if (isWeb) {
                        alert('❌ 初始化失敗');
                      } else {
                        Alert.alert('❌ 錯誤', '初始化失敗');
                      }
                    } finally {
                      setIsLoadingDummyData(false);
                    }
                  }
                }}
              />
              <View style={[styles.divider, { backgroundColor: colors.border }]} />
              <SettingItem
                icon={<X size={18} color="#EF4444" />}
                label="🗑️ 清除所有資料"
                danger
                onPress={async () => {
                  const confirmed = await new Promise<boolean>((resolve) => {
                    if (isWeb) {
                      resolve(confirm('確定要清除所有庫存資料嗎？此操作無法復原！'));
                    } else {
                      Alert.alert(
                        '清除所有資料',
                        '確定要清除所有庫存、倉庫、車隊資料嗎？此操作無法復原！',
                        [
                          { text: '取消', style: 'cancel', onPress: () => resolve(false) },
                          { text: '清除', style: 'destructive', onPress: () => resolve(true) },
                        ]
                      );
                    }
                  });

                  if (confirmed) {
                    try {
                      await inventoryStore.resetAll();
                      await inventoryStore.loadAll();
                      if (isWeb) {
                        alert('✅ 所有資料已清除！');
                      } else {
                        Alert.alert('✅ 完成', '所有資料已清除！');
                      }
                    } catch (error) {
                      if (isWeb) {
                        alert('❌ 清除失敗');
                      } else {
                        Alert.alert('❌ 錯誤', '清除失敗');
                      }
                    }
                  }
                }}
              />
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
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
