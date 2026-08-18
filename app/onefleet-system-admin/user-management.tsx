import { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, Alert, TextInput as RNTextInput,
  Modal, Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ArrowLeft, Trash2, Eye, EyeOff, Copy, Check, X, Pencil } from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { useUserManagementStore } from '@/store/userManagementStore';
import { useThemeStore } from '@/store/themeStore';
import { useTranslation } from '@/i18n';
import { spacing, typography } from '@/constants/theme';
import { DriverFormModal } from '@/components/company/DriverFormModal';
import { CompanyFormModal } from '@/components/company/CompanyFormModal';

const isWeb = Platform.OS === 'web';

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
  const { users, addUser, deleteUser, updateUserPassword, updateUser, getCompanies, loadUsers } = useUserManagementStore();

  const companies = getCompanies();

  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const [form, setForm] = useState({
    name: '', email: '', password: '', role: 'driver' as 'driver' | 'company',
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Edit modals
  const [driverModal, setDriverModal] = useState<{ visible: boolean; driver: any | null }>({ visible: false, driver: null });
  const [companyModal, setCompanyModal] = useState<{ visible: boolean; company: any | null }>({ visible: false, company: null });

  // Sync state
  const [syncing, setSyncing] = useState(false);
  const [syncDone, setSyncDone] = useState(false);

  // 載入使用者資料並同步到 Supabase
  useEffect(() => {
    const loadAndSync = async () => {
      // 先載入本地資料
      await loadUsers();
      // 確保資料同步到 Supabase（讓子使用戶能看到公司清單）
      const { syncUsers } = useUserManagementStore.getState();
      await syncUsers();
      // 再次載入以確保取得最新資料
      await loadUsers();
    };
    loadAndSync();
  }, []);

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
      await loadUsers();
      if (isWeb) {
        window.alert(`${isZh ? '✅ 新增成功' : '✅ Added'}\n\n${isZh ? '使用者已新增至系統。' : 'User has been added to the system.'}`);
      } else {
        Alert.alert(
          isZh ? '✅ 新增成功' : '✅ Added',
          isZh ? '使用者已新增至系統。' : 'User has been added to the system.'
        );
      }
    } else {
      const errMsg = result.error?.includes('already')
        ? (isZh ? '此電子郵件已被註冊' : 'Email already registered')
        : (result.error || t('error.unknownError'));
      setFormErrors({ email: errMsg });
      if (isWeb) {
        window.alert(`${isZh ? '❌ 新增失敗' : '❌ Add Failed'}\n\n${errMsg}`);
      } else {
        Alert.alert(
          isZh ? '❌ 新增失敗' : '❌ Add Failed',
          errMsg
        );
      }
    }
  };

  // ── Sync to Clerk + Supabase ────────────────────────────────────────────────

  const handleSync = async () => {
    console.log('[UserManagement] handleSync called, users count:', users.length);

    // Web 環境直接用 window.alert
    const showAlert = (title: string, msg: string) => {
      if (isWeb) {
        window.alert(`${title}\n\n${msg}`);
      } else {
        Alert.alert(title, msg);
      }
    };

    if (users.length === 0) {
      showAlert(isZh ? '無使用者' : 'No Users', isZh ? '目前沒有使用者資料需要同步。' : 'There are no users to sync.');
      return;
    }

    // 直接執行同步，不顯示確認對話框（避免使用者困惑）
    await doSync();
  };

  const doSync = async () => {
    console.log('[UserManagement] doSync started');
    setSyncing(true);
    setSyncDone(false);

    const showAlert = (title: string, msg: string) => {
      if (isWeb) {
        window.alert(`${title}\n\n${msg}`);
      } else {
        Alert.alert(title, msg);
      }
    };

    let clerkSummary = '';
    let supabaseSummary = '';
    let hasError = false;

    // 1. Clerk sync（需要 Supabase Edge Function，如果沒部署就跳過）
    try {
      const { syncUsersToClerk } = await import('@/utils/clerkSync');
      const usersWithPasswords = users
        .filter((u) => u.password)
        .map((u) => ({ user: u, password: u.password! }));

      if (usersWithPasswords.length > 0) {
        const summary = await syncUsersToClerk(usersWithPasswords);
        const created = summary.results.filter((r) => r.action === 'created').length;
        const updated = summary.results.filter((r) => r.action === 'updated').length;
        const failed = summary.summary.failed;

        clerkSummary = isZh
          ? `Clerk：新增 ${created} 筆、更新 ${updated} 筆${failed > 0 ? `、失敗 ${failed} 筆` : ''}`
          : `Clerk: Created ${created}, updated ${updated}${failed > 0 ? `, failed ${failed}` : ''}`;

        if (failed > 0) {
          hasError = true;
          const failedEmails = summary.results
            .filter((r) => 'error' in r)
            .map((r) => (r as { email: string; error: string }).email)
            .join(', ');
          clerkSummary += `\n\n${isZh ? '失敗帳號：' : 'Failed:'} ${failedEmails}`;
        }
      } else {
        clerkSummary = isZh ? 'Clerk：無含密碼的使用者（跳過）' : 'Clerk: No users with passwords (skipped)';
      }
    } catch (err) {
      // Clerk sync 失敗，不標記為錯誤（可能是 Edge Function 還沒部署）
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      console.warn('[UserManagement] Clerk sync skipped:', errMsg);
      clerkSummary = isZh
        ? `Clerk：跳過（Edge Function 未部署）`
        : `Clerk: Skipped (Edge Function not deployed)`;
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

    showAlert(
      hasError
        ? (isZh ? '⚠️ 同步完成（有錯誤）' : '⚠️ Sync Completed (with errors)')
        : (isZh ? '✅ 同步完成' : '✅ Sync Completed'),
      `${clerkSummary}\n\n${supabaseSummary}`
    );
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = (user: { id: string; email: string; name: string }) => {
    if (isWeb) {
      if (!window.confirm(
        isZh
          ? `刪除使用者「${user.name}」(${user.email})？此操作不可逆。`
          : `Delete user "${user.name}" (${user.email})? This cannot be undone.`
      )) {
        return;
      }
      doDeleteUser(user.id);
    } else {
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
            onPress: () => doDeleteUser(user.id),
          },
        ]
      );
    }
  };

  const doDeleteUser = async (userId: string) => {
    try {
      await deleteUser(userId);
      await loadUsers();
      if (isWeb) {
        window.alert(isZh ? '✅ 刪除成功' : '✅ Deleted successfully');
      }
    } catch {
      if (isWeb) {
        window.alert(isZh ? '❌ 刪除失敗' : '❌ Delete failed');
      } else {
        Alert.alert(
          isZh ? '刪除失敗' : 'Delete failed',
          isZh ? '無法刪除使用者。' : 'Could not delete user.'
        );
      }
    }
  };

  // ── Edit handlers ──────────────────────────────────────────────────────────

  const handleEditUser = (user: any) => {
    if (user.role === 'driver') {
      setDriverModal({ visible: true, driver: user });
    } else if (user.role === 'company') {
      setCompanyModal({ visible: true, company: user });
    }
  };

  const handleDriverSaved = async (updates: any) => {
    if (driverModal.driver) {
      await updateUser(driverModal.driver.id, updates);
      await loadUsers();
      if (isZh) {
        Alert.alert('成功', '司機已更新');
      } else {
        Alert.alert('Success', 'Driver has been updated');
      }
    }
    setDriverModal({ visible: false, driver: null });
  };

  const handleCompanySaved = async (updates: any) => {
    if (companyModal.company) {
      await updateUser(companyModal.company.id, updates);
      await loadUsers();
      if (isZh) {
        Alert.alert('成功', '公司已更新');
      } else {
        Alert.alert('Success', 'Company has been updated');
      }
    }
    setCompanyModal({ visible: false, company: null });
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.topBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Pressable onPress={() => {
          if (router.canGoBack()) {
            router.back();
          } else {
            router.replace('/onefleet-system-admin');
          }
        }} style={styles.backBtn}>
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
                  {/* Edit */}
                  <Pressable
                    onPress={() => handleEditUser(user)}
                    hitSlop={8}
                    style={styles.iconBtn}
                  >
                    <Pencil size={16} color={colors.primary} />
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

              {/* 司機的公司資訊 */}
              {user.role === 'driver' && user.companyId && (
                <View style={styles.infoRow}>
                  <Text style={[styles.infoLabel, { color: colors.textSecondary }]}>
                    {isZh ? '公司：' : 'Company: '}
                  </Text>
                  <Text style={[styles.infoValue, { color: colors.primary }]}>
                    {companies.find(c => c.id === user.companyId)?.name || user.companyId}
                  </Text>
                </View>
              )}
            </Card>
          ))
        )}
      </ScrollView>

      {/* ── Add User Modal ── */}
      <Modal visible={modalVisible} animationType="fade" transparent>
        <View style={styles.centeredModalOverlay}>
          <View style={[styles.centeredModalContent, { backgroundColor: colors.card }]}>
            <View style={[styles.centeredModalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.centeredModalTitle, { color: colors.textPrimary }]}>
                {isZh ? '新增使用者' : 'Add User'}
              </Text>
              <Pressable onPress={() => setModalVisible(false)} hitSlop={8} style={styles.modalCloseBtn}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>

            <ScrollView style={{ maxHeight: 480 }} showsVerticalScrollIndicator={false}>
              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  {isZh ? '姓名' : 'Name'}
                </Text>
                <RNTextInput
                  style={[styles.input, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: formErrors.name ? colors.danger : colors.border }]}
                  value={form.name}
                  onChangeText={(v) => { setForm((f) => ({ ...f, name: v })); setFormErrors((e) => ({ ...e, name: '' })); }}
                  placeholder={isZh ? '輸入姓名' : 'Enter name'}
                  placeholderTextColor={colors.textSecondary}
                />
                {formErrors.name && <Text style={[styles.fieldError, { color: colors.danger }]}>{formErrors.name}</Text>}
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  {isZh ? '電子郵件' : 'Email'}
                </Text>
                <RNTextInput
                  style={[styles.input, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: formErrors.email ? colors.danger : colors.border }]}
                  value={form.email}
                  onChangeText={(v) => { setForm((f) => ({ ...f, email: v })); setFormErrors((e) => ({ ...e, email: '' })); }}
                  placeholder={isZh ? '輸入電子郵件' : 'Enter email'}
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="email-address"
                  autoCapitalize="none"
                />
                {formErrors.email && <Text style={[styles.fieldError, { color: colors.danger }]}>{formErrors.email}</Text>}
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  {isZh ? '密碼' : 'Password'}
                </Text>
                <RNTextInput
                  style={[styles.input, { backgroundColor: colors.background, color: colors.textPrimary, borderColor: formErrors.password ? colors.danger : colors.border }]}
                  value={form.password}
                  onChangeText={(v) => { setForm((f) => ({ ...f, password: v })); setFormErrors((e) => ({ ...e, password: '' })); }}
                  placeholder={isZh ? '輸入密碼（至少 6 碼）' : 'Enter password (min 6 chars)'}
                  placeholderTextColor={colors.textSecondary}
                  secureTextEntry
                />
                {formErrors.password && <Text style={[styles.fieldError, { color: colors.danger }]}>{formErrors.password}</Text>}
              </View>

              <View style={styles.formField}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  {isZh ? '角色' : 'Role'}
                </Text>
                <View style={styles.roleRow}>
                  {(['driver', 'company'] as const).map((r) => (
                    <Pressable
                      key={r}
                      style={[styles.roleOption, {
                        backgroundColor: form.role === r ? roleColors[r] + '22' : colors.background,
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
              </View>
            </ScrollView>

            <View style={[styles.modalActions, { borderTopColor: colors.border }]}>
              <Button
                title={isZh ? '取消' : 'Cancel'}
                onPress={() => setModalVisible(false)}
                variant="ghost"
                style={{ flex: 1 }}
              />
              <View style={{ width: spacing.sm }} />
              <Button
                title={isZh ? '新增' : 'Add'}
                onPress={handleAddUser}
                loading={submitting}
                style={{ flex: 1.5 }}
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Driver Edit Modal ── */}
      <DriverFormModal
        visible={driverModal.visible}
        onClose={() => setDriverModal({ visible: false, driver: null })}
        driver={driverModal.driver}
        onSave={handleDriverSaved}
      />

      {/* ── Company Edit Modal ── */}
      <CompanyFormModal
        visible={companyModal.visible}
        onClose={() => setCompanyModal({ visible: false, company: null })}
        company={companyModal.company}
      />
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
  roleRow: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.lg },
  roleOption: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  roleOptionText: { fontSize: typography.fontSize.sm, fontWeight: '600' },
  modalActions: { flexDirection: 'row', borderTopWidth: 1, paddingTop: spacing.lg, gap: spacing.sm },
  // 新增中央彈出樣式（與 profile.tsx 統一）
  centeredModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  centeredModalContent: {
    width: '100%',
    maxWidth: 520,
    borderRadius: 20,
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
  },
  modalCloseBtn: {
    padding: spacing.xs,
  },
});
