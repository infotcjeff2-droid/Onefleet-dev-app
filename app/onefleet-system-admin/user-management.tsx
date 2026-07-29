import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, TextInput as RNTextInput,
  Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, Trash2, Eye, EyeOff, Copy, KeyRound, RefreshCw, Upload, Check, X } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography } from '@/constants/theme';

const roleColors: Record<string, string> = {
  admin: '#EF4444',
  driver: '#3B82F6',
  company: '#F59E0B',
  user: '#10B981',
};

const roleLabels: Record<string, string> = {
  admin: 'Admin',
  driver: '司機',
  company: '公司',
  user: '一般用戶',
};

export default function UserManagementScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { t, locale } = useTranslation();
  const { users, addUser, deleteUser, updateUserPassword, updateUser } = useUserManagementStore();

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [resetPwdModal, setResetPwdModal] = useState<{ visible: boolean; user: { id: string; name: string; email: string } | null }>({ visible: false, user: null });
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'driver' as 'driver' | 'company',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Reset password form state
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdErrors, setPwdErrors] = useState<Record<string, string>>({});
  const [resetPwdLoading, setResetPwdLoading] = useState(false);

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  const isZh = locale === 'zh-TW';

  // ── Password helpers ────────────────────────────────────────────────────────

  const togglePassword = (id: string) => {
    setShowPasswords((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copyToClipboard = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Alert.alert(isZh ? '已複製' : 'Copied', `${label}: ${text}`);
  };

  // ── Add user ────────────────────────────────────────────────────────────────

  const validateForm = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = t('error.nameRequired');
    if (!form.email.trim()) errs.email = t('error.emailRequired');
    else if (!/\S+@\S+\.\S+/.test(form.email)) errs.email = t('error.invalidEmailFormat');
    if (!form.password) errs.password = t('error.passwordRequired');
    else if (form.password.length < 6) errs.password = t('error.passwordMinLength');
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleAddUser = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    const result = await addUser(form.name, form.email, form.password, form.role);
    setSubmitting(false);
    if (result.success) {
      setModalVisible(false);
      setForm({ name: '', email: '', password: '', role: 'driver' });
      setFormErrors({});
      Alert.alert(
        isZh ? '✅ 新增成功' : '✅ Added',
        isZh ? '使用者已新增至系統。' : 'User has been added to the system.'
      );
    } else {
      const errMsg = result.error?.includes('already')
        ? (isZh ? '此電子郵件已被註冊' : 'Email already registered')
        : (result.error || t('error.unknownError'));
      setFormErrors({ email: errMsg });
    }
  };

  // ── Reset password ─────────────────────────────────────────────────────────

  const openResetPwd = (user: { id: string; name: string; email: string }) => {
    setNewPassword('');
    setConfirmPassword('');
    setPwdErrors({});
    setResetPwdModal({ visible: true, user });
  };

  const handleResetPassword = async () => {
    const errs: Record<string, string> = {};
    if (!newPassword) errs.newPassword = isZh ? '請輸入新密碼' : 'Please enter a new password';
    else if (newPassword.length < 6) errs.newPassword = t('error.passwordMinLength');
    if (newPassword !== confirmPassword) errs.confirmPassword = isZh ? '兩次密碼不一致' : 'Passwords do not match';
    if (Object.keys(errs).length > 0) { setPwdErrors(errs); return; }

    if (!resetPwdModal.user) return;
    setResetPwdLoading(true);
    try {
      await updateUserPassword(resetPwdModal.user.id, newPassword);
      setResetPwdModal({ visible: false, user: null });
      Alert.alert(
        isZh ? '✅ 密碼已更新' : '✅ Password Updated',
        isZh
          ? `「${resetPwdModal.user.name}」的密碼已成功更新。`
          : `Password for "${resetPwdModal.user.name}" has been updated.`
      );
    } catch (err) {
      Alert.alert(
        isZh ? '❌ 更新失敗' : '❌ Update Failed',
        isZh ? '密碼更新失敗，請稍後再試。' : 'Failed to update password. Please try again.'
      );
    } finally {
      setResetPwdLoading(false);
    }
  };

  // ── Sync to Clerk + Supabase ────────────────────────────────────────────────

  const handleSync = async () => {
    if (users.length === 0) {
      Alert.alert(isZh ? '無使用者' : 'No Users', isZh ? '目前沒有使用者資料需要同步。' : 'There are no users to sync.');
      return;
    }

    Alert.alert(
      isZh ? '同步至 Clerk + Supabase' : 'Sync to Clerk + Supabase',
      isZh
        ? `即將同步 ${users.length} 筆使用者資料至 Clerk 及 Supabase。\n\nClerk：將建立/更新帳號。\nSupabase：將上傳使用者資料。\n\n是否繼續？`
        : `About to sync ${users.length} users to Clerk and Supabase.\n\nClerk: Create/update accounts.\nSupabase: Upload user data.\n\nProceed?`,
      [
        { text: isZh ? '取消' : 'Cancel', style: 'cancel' },
        {
          text: isZh ? '同步' : 'Sync',
          onPress: doSync,
        },
      ]
    );
  };

  const doSync = async () => {
    setSyncing(true);
    setSyncDone(false);

    let clerkSummary = '';
    let supabaseSummary = '';
    let hasError = false;

    // 1. Clerk sync
    try {
      const { syncUsersToClerk } = await import('@/utils/clerkSync');
      const usersWithPasswords = users
        .filter((u) => u.password)
        .map((u) => ({ user: u, password: u.password! }));

      if (usersWithPasswords.length > 0) {
        const summary = await syncUsersToClerk(usersWithPasswords);
        const created = summary.results.filter((r) => r.action === 'created').length;
        const updated = summary.results.filter((r) => r.action === 'updated').length;
        const failed = summary.totalFailed;

        clerkSummary = isZh
          ? `Clerk：新增 ${created} 筆、更新 ${updated} 筆${failed > 0 ? `、失敗 ${failed} 筆` : ''}`
          : `Clerk: Created ${created}, updated ${updated}${failed > 0 ? `, failed ${failed}` : ''}`;

        if (failed > 0) {
          hasError = true;
          const failedEmails = summary.failed.map((f) => f.email).join(', ');
          clerkSummary += `\n\n${isZh ? '失敗帳號：' : 'Failed:'} ${failedEmails}`;
        }
      } else {
        clerkSummary = isZh ? 'Clerk：無含密碼的使用者（跳過）' : 'Clerk: No users with passwords (skipped)';
      }
    } catch (err) {
      hasError = true;
      clerkSummary = isZh
        ? `Clerk 同步失敗：${err instanceof Error ? err.message : '未知錯誤'}`
        : `Clerk sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }

    // 2. Supabase sync
    try {
      const { syncUsersToSupabase } = await import('@/utils/supabaseSync');
      const result = await syncUsersToSupabase(users);
      supabaseSummary = result.success
        ? (isZh ? `Supabase：✅ ${result.message}` : `Supabase: ✅ ${result.message}`)
        : (isZh ? `Supabase：❌ ${result.message}` : `Supabase: ❌ ${result.message}`);
      if (!result.success) hasError = true;
    } catch (err) {
      hasError = true;
      supabaseSummary = isZh
        ? `Supabase 同步失敗：${err instanceof Error ? err.message : '未知錯誤'}`
        : `Supabase sync failed: ${err instanceof Error ? err.message : 'Unknown error'}`;
    }

    setSyncing(false);
    setSyncDone(true);

    Alert.alert(
      hasError
        ? (isZh ? '⚠️ 同步完成（有錯誤）' : '⚠️ Sync Completed (with errors)')
        : (isZh ? '✅ 同步完成' : '✅ Sync Completed'),
      `${clerkSummary}\n\n${supabaseSummary}`
    );
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = (user: { id: string; email: string; name: string }) => {
    Alert.alert(
      isZh ? '確認刪除' : 'Confirm Delete',
      isZh
        ? `刪除使用者「${user.name}」(${user.email})？此操作不可逆。`
        : `Delete user "${user.name}" (${user.email})? This cannot be undone.`,
      [
        { text: isZh ? '取消' : 'Cancel', style: 'cancel' },
        {
          text: isZh ? '刪除' : 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteUser(user.id);
            } catch {
              Alert.alert(
                isZh ? '刪除失敗' : 'Delete failed',
                isZh ? '無法刪除使用者。' : 'Could not delete user.'
              );
            }
          },
        },
      ]
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <ArrowLeft size={20} color={colors.textPrimary} />
        </Pressable>
        <Text style={[styles.topBarTitle, { color: colors.textPrimary }]}>使用者管理</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Toolbar */}
      <View style={[styles.toolbar, { backgroundColor: colors.surface }]}>
        <Button
          title={isZh ? '+ 新增使用者' : '+ Add User'}
          onPress={() => { setFormErrors({}); setModalVisible(true); }}
          size="sm"
          style={{ flex: 1 }}
        />
        <View style={{ width: spacing.sm }} />
        <Button
          title={syncing ? (isZh ? '同步中...' : 'Syncing...') : (isZh ? '同步至雲端' : 'Sync to Cloud')}
          onPress={handleSync}
          disabled={syncing}
          size="sm"
          style={{ flex: 1 }}
          icon={syncing ? <ActivityIndicator size={12} color="#fff" /> : <RefreshCw size={12} color="#fff" />}
        />
      </View>

      {/* Sync done indicator */}
      {syncDone && (
        <View style={[styles.syncBanner, { backgroundColor: colors.success + '22' }]}>
          <Check size={14} color={colors.success} />
          <Text style={[styles.syncBannerText, { color: colors.success }]}>
            {isZh ? '同步完成 ✓' : 'Sync completed ✓'}
          </Text>
          <Pressable onPress={() => setSyncDone(false)}>
            <X size={14} color={colors.success} />
          </Pressable>
        </View>
      )}

      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        {users.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
              {isZh ? '尚無使用者資料' : 'No users yet'}
            </Text>
            <Text style={[styles.emptyHint, { color: colors.textSecondary }]}>
              {isZh ? '點擊上方「新增使用者」建立第一個帳號' : 'Click "+ Add User" above to create the first account'}
            </Text>
          </Card>
        ) : (
          users.map((user) => (
            <Card key={user.id} style={styles.userCard}>
              <View style={styles.userHeader}>
                <View style={styles.userMeta}>
                  <View style={[styles.roleBadge, { backgroundColor: roleColors[user.role] + '22' }]}>
                    <Text style={[styles.roleBadgeText, { color: roleColors[user.role] }]}>
                      {roleLabels[user.role] || user.role}
                    </Text>
                  </View>
                  <Text style={[styles.userId, { color: colors.textSecondary }]}>{user.id}</Text>
                </View>
                <View style={styles.headerActions}>
                  {/* Reset password */}
                  <Pressable
                    onPress={() => openResetPwd({ id: user.id, name: user.name, email: user.email })}
                    hitSlop={8}
                    style={styles.iconBtn}
                  >
                    <KeyRound size={16} color={colors.primary} />
                  </Pressable>
                  {/* Delete */}
                  <Pressable onPress={() => handleDelete(user)} hitSlop={8} style={styles.iconBtn}>
                    <Trash2 size={16} color={colors.danger} />
                  </Pressable>
                </View>
              </View>

              <Text style={[styles.userName, { color: colors.textPrimary }]}>{user.name}</Text>
              <Text style={[styles.userEmail, { color: colors.textSecondary }]}>{user.email}</Text>

              {/* Password row */}
              <View style={styles.passwordRow}>
                <Text style={[styles.passwordLabel, { color: colors.textSecondary }]}>
                  {isZh ? '密碼：' : 'Password: '}
                </Text>
                <Text style={[styles.passwordValue, { color: colors.textPrimary }]}>
                  {showPasswords[user.id] ? (user.password || '—') : '••••••••'}
                </Text>
                <Pressable onPress={() => togglePassword(user.id)} hitSlop={8} style={{ marginLeft: 6 }}>
                  {showPasswords[user.id]
                    ? <EyeOff size={16} color={colors.textSecondary} />
                    : <Eye size={16} color={colors.textSecondary} />}
                </Pressable>
                <Pressable
                  onPress={() => copyToClipboard(user.password || '', isZh ? '密碼' : 'Password')}
                  hitSlop={8}
                  style={{ marginLeft: 4 }}
                >
                  <Copy size={16} color={colors.textSecondary} />
                </Pressable>
              </View>

              {user.phone && (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                    {isZh ? '電話：' : 'Phone: '}
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.textPrimary }]}>{user.phone}</Text>
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>

      {/* ── Add User Modal ── */}
      <Modal visible={modalVisible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {isZh ? '新增使用者' : 'Add User'}
              </Text>
              <Pressable onPress={() => setModalVisible(false)}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {isZh ? '姓名' : 'Name'}
            </Text>
            <RNTextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: formErrors.name ? colors.danger : colors.border }]}
              value={form.name}
              onChangeText={(v) => { setForm((f) => ({ ...f, name: v })); setFormErrors((e) => ({ ...e, name: '' })); }}
              placeholder={isZh ? '輸入姓名' : 'Enter name'}
              placeholderTextColor={colors.textSecondary}
            />
            {formErrors.name && <Text style={[styles.fieldError, { color: colors.danger }]}>{formErrors.name}</Text>}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {isZh ? '電子郵件' : 'Email'}
            </Text>
            <RNTextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: formErrors.email ? colors.danger : colors.border }]}
              value={form.email}
              onChangeText={(v) => { setForm((f) => ({ ...f, email: v })); setFormErrors((e) => ({ ...e, email: '' })); }}
              placeholder={isZh ? '輸入電子郵件' : 'Enter email'}
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
            />
            {formErrors.email && <Text style={[styles.fieldError, { color: colors.danger }]}>{formErrors.email}</Text>}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {isZh ? '密碼' : 'Password'}
            </Text>
            <RNTextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: formErrors.password ? colors.danger : colors.border }]}
              value={form.password}
              onChangeText={(v) => { setForm((f) => ({ ...f, password: v })); setFormErrors((e) => ({ ...e, password: '' })); }}
              placeholder={isZh ? '輸入密碼（至少 6 碼）' : 'Enter password (min 6 chars)'}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
            />
            {formErrors.password && <Text style={[styles.fieldError, { color: colors.danger }]}>{formErrors.password}</Text>}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {isZh ? '角色' : 'Role'}
            </Text>
            <View style={styles.roleRow}>
              {(['driver', 'company'] as const).map((r) => (
                <Pressable
                  key={r}
                  style={[styles.roleOption, {
                    backgroundColor: form.role === r ? roleColors[r] + '22' : colors.surface,
                    borderColor: form.role === r ? roleColors[r] : colors.border,
                  }]}
                  onPress={() => setForm((f) => ({ ...f, role: r }))}
                >
                  <Text style={[styles.roleOptionText, { color: form.role === r ? roleColors[r] : colors.textSecondary }]}>
                    {r === 'driver' ? (isZh ? '司機' : 'Driver') : (isZh ? '公司' : 'Company')}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.modalActions}>
              <Button
                title={isZh ? '取消' : 'Cancel'}
                onPress={() => setModalVisible(false)}
                variant="secondary"
                style={{ flex: 1 }}
              />
              <View style={{ width: spacing.sm }} />
              <Button
                title={isZh ? '新增' : 'Add'}
                onPress={handleAddUser}
                loading={submitting}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Reset Password Modal ── */}
      <Modal visible={resetPwdModal.visible} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.modalOverlay}>
          <View style={[styles.modalContent, { backgroundColor: colors.card }]}>
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.textPrimary }]}>
                {isZh ? '重設密碼' : 'Reset Password'}
              </Text>
              <Pressable onPress={() => setResetPwdModal({ visible: false, user: null })}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            {resetPwdModal.user && (
              <View style={[styles.pwdTargetCard, { backgroundColor: colors.surface }]}>
                <Text style={[styles.pwdTargetName, { color: colors.textPrimary }]}>
                  {resetPwdModal.user.name}
                </Text>
                <Text style={[styles.pwdTargetEmail, { color: colors.textSecondary }]}>
                  {resetPwdModal.user.email}
                </Text>
              </View>
            )}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {isZh ? '新密碼' : 'New Password'}
            </Text>
            <RNTextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: pwdErrors.newPassword ? colors.danger : colors.border }]}
              value={newPassword}
              onChangeText={(v) => { setNewPassword(v); setPwdErrors((e) => ({ ...e, newPassword: '' })); }}
              placeholder={isZh ? '輸入新密碼（至少 6 碼）' : 'Enter new password (min 6 chars)'}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              autoCapitalize="none"
            />
            {pwdErrors.newPassword && <Text style={[styles.fieldError, { color: colors.danger }]}>{pwdErrors.newPassword}</Text>}

            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
              {isZh ? '確認密碼' : 'Confirm Password'}
            </Text>
            <RNTextInput
              style={[styles.input, { backgroundColor: colors.surface, color: colors.textPrimary, borderColor: pwdErrors.confirmPassword ? colors.danger : colors.border }]}
              value={confirmPassword}
              onChangeText={(v) => { setConfirmPassword(v); setPwdErrors((e) => ({ ...e, confirmPassword: '' })); }}
              placeholder={isZh ? '再次輸入新密碼' : 'Confirm new password'}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              autoCapitalize="none"
            />
            {pwdErrors.confirmPassword && <Text style={[styles.fieldError, { color: colors.danger }]}>{pwdErrors.confirmPassword}</Text>}

            <View style={styles.modalActions}>
              <Button
                title={isZh ? '取消' : 'Cancel'}
                onPress={() => setResetPwdModal({ visible: false, user: null })}
                variant="secondary"
                style={{ flex: 1 }}
              />
              <View style={{ width: spacing.sm }} />
              <Button
                title={isZh ? '更新密碼' : 'Update Password'}
                onPress={handleResetPassword}
                loading={resetPwdLoading}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: spacing.lg, paddingTop: spacing.xl, paddingBottom: spacing.md,
    borderBottomWidth: 1,
  },
  backBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.05)', alignItems: 'center', justifyContent: 'center',
  },
  topBarTitle: { fontSize: typography.fontSize.base, fontWeight: '700' },
  toolbar: { padding: spacing.md, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.05)', flexDirection: 'row' },
  syncBanner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
  syncBannerText: { flex: 1, fontSize: typography.fontSize.sm, fontWeight: '600' },
  scroll: { flex: 1 },
  scrollContent: { padding: spacing.md, paddingBottom: 100 },
  emptyCard: { padding: spacing['2xl'], alignItems: 'center' },
  emptyText: { fontSize: typography.fontSize.base, fontWeight: '600', marginBottom: spacing.xs },
  emptyHint: { fontSize: typography.fontSize.sm, textAlign: 'center' },
  userCard: { marginBottom: spacing.md, padding: spacing.md },
  userHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: spacing.xs },
  userMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  roleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  roleBadgeText: { fontSize: typography.fontSize.xs, fontWeight: '700' },
  userId: { fontSize: typography.fontSize.xs },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  iconBtn: { padding: 4 },
  userName: { fontSize: typography.fontSize.base, fontWeight: '700', marginBottom: 2 },
  userEmail: { fontSize: typography.fontSize.sm, marginBottom: spacing.sm },
  passwordRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  passwordLabel: { fontSize: typography.fontSize.sm },
  passwordValue: { fontSize: typography.fontSize.sm, fontWeight: '600', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  infoRow: { flexDirection: 'row', alignItems: 'center' },
  infoLabel: { fontSize: typography.fontSize.sm },
  infoValue: { fontSize: typography.fontSize.sm },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: spacing.lg },
  modalContent: { borderRadius: 16, padding: spacing['2xl'] },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing['2xl'] },
  modalTitle: { fontSize: typography.fontSize.xl, fontWeight: '700' },
  fieldLabel: { fontSize: typography.fontSize.sm, fontWeight: '600', marginBottom: spacing.xs },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: spacing.md, paddingVertical: 10, fontSize: typography.fontSize.base, marginBottom: spacing.xs },
  fieldError: { fontSize: typography.fontSize.xs, marginBottom: spacing.sm },
  roleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing['2xl'] },
  roleOption: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  roleOptionText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  pwdTargetCard: { padding: spacing.md, borderRadius: 8, marginBottom: spacing.lg },
  pwdTargetName: { fontSize: typography.fontSize.base, fontWeight: '700', marginBottom: 2 },
  pwdTargetEmail: { fontSize: typography.fontSize.sm },
  modalActions: { flexDirection: 'row' },
});
