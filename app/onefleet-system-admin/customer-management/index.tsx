import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Modal,
  Alert,
  RefreshControl,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useCustomerStore } from '@/store/customerStore';
import { useThemeStore } from '@/store/themeStore';
import { Customer } from '@/types';
import {
  ArrowLeft,
  Plus,
  Edit2,
  Trash2,
  X,
  Search,
  User,
  Phone,
  MapPin,
  ShoppingCart,
  ChevronRight,
} from 'lucide-react-native';

interface CustomerFormData {
  name: string;
  phone: string;
  email: string;
  address: string;
  notes: string;
}

const EMPTY_FORM: CustomerFormData = {
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
};

export default function CustomerManagement() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const {
    customers,
    isLoading,
    loadCustomers,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    syncCustomers,
  } = useCustomerStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState<CustomerFormData>(EMPTY_FORM);

  useEffect(() => {
    loadCustomers();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadCustomers(), syncCustomers()]);
    setRefreshing(false);
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingCustomer(null);
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setForm({
      name: customer.name,
      phone: customer.phone ?? '',
      email: customer.email ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('錯誤', '請輸入客戶名稱');
      return;
    }

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, {
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          address: form.address.trim() || undefined,
          notes: form.notes.trim() || undefined,
        });
      } else {
        await addCustomer({
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          address: form.address.trim() || undefined,
          notes: form.notes.trim() || undefined,
        });
      }

      setTimeout(() => {
        setModalVisible(false);
        resetForm();
      }, 50);
    } catch (error) {
      Alert.alert('錯誤', '儲存失敗，請重試');
    }
  };

  const handleDelete = (customer: Customer) => {
    Alert.alert(
      '確認刪除',
      `確定要刪除客戶「${customer.name}」嗎？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: async () => {
            if (deletingId) return;
            setDeletingId(customer.id);
            try {
              await deleteCustomer(customer.id);
            } catch (error) {
              Alert.alert('錯誤', '刪除失敗，請重試');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const filteredCustomers = customers.filter((c) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      c.name.toLowerCase().includes(query) ||
      c.phone?.toLowerCase().includes(query) ||
      c.email?.toLowerCase().includes(query)
    );
  });

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => {
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/onefleet-system-admin');
            }
          }}
          style={styles.backButton}
        >
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>客戶管理</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <Plus size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Search size={18} color={colors.textTertiary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="搜尋客戶名稱、電話..."
          placeholderTextColor={colors.textTertiary}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearButton}>
            <X size={16} color={colors.textTertiary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Customer List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {filteredCustomers.length === 0 ? (
          <View style={styles.emptyState}>
            <User size={64} color={colors.textTertiary} />
            <Text style={styles.emptyText}>
              {searchQuery ? '找不到符合條件的客戶' : '尚無客戶資料'}
            </Text>
            <Text style={styles.emptySubtext}>
              {searchQuery ? '請嘗試其他搜尋關鍵字' : '點擊右上角新增客戶'}
            </Text>
          </View>
        ) : (
          filteredCustomers.map((customer) => (
            <TouchableOpacity
              key={customer.id}
              style={styles.customerCard}
              onPress={() => openEditModal(customer)}
            >
              {/* Avatar */}
              <View style={styles.avatarContainer}>
                <Text style={styles.avatarText}>
                  {customer.name.charAt(0).toUpperCase()}
                </Text>
              </View>

              {/* Customer Info */}
              <View style={styles.customerInfo}>
                <Text style={styles.customerName} numberOfLines={1}>
                  {customer.name}
                </Text>

                {customer.phone && (
                  <View style={styles.infoRow}>
                    <Phone size={12} color={colors.textTertiary} />
                    <Text style={styles.infoText}>{customer.phone}</Text>
                  </View>
                )}

                {customer.address && (
                  <View style={styles.infoRow}>
                    <MapPin size={12} color={colors.textTertiary} />
                    <Text style={styles.infoText} numberOfLines={1}>
                      {customer.address}
                    </Text>
                  </View>
                )}

                {customer.totalOrders !== undefined && customer.totalOrders > 0 && (
                  <View style={styles.orderBadge}>
                    <ShoppingCart size={12} color={colors.primary} />
                    <Text style={styles.orderBadgeText}>
                      {customer.totalOrders} 筆配送
                    </Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              <View style={styles.cardActions}>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    openEditModal(customer);
                  }}
                  hitSlop={8}
                  style={styles.actionButton}
                >
                  <Edit2 size={18} color={colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={(e) => {
                    e.stopPropagation?.();
                    handleDelete(customer);
                  }}
                  hitSlop={8}
                  disabled={deletingId === customer.id}
                  style={[
                    styles.actionButton,
                    deletingId === customer.id && styles.actionButtonDisabled,
                  ]}
                >
                  <Trash2
                    size={18}
                    color={deletingId === customer.id ? colors.textTertiary : colors.danger}
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          ))
        )}
      </ScrollView>

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={[styles.modalHeader, { borderBottomColor: colors.border }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                {editingCustomer ? '編輯客戶' : '新增客戶'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} hitSlop={8}>
                <X size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalForm} showsVerticalScrollIndicator={false}>
              <Text style={styles.inputLabel}>客戶名稱 *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
                placeholder="請輸入客戶名稱"
                placeholderTextColor={colors.textTertiary}
              />

              <Text style={styles.inputLabel}>聯絡電話</Text>
              <TextInput
                style={styles.input}
                value={form.phone}
                onChangeText={(text) => setForm((f) => ({ ...f, phone: text }))}
                placeholder="請輸入聯絡電話"
                placeholderTextColor={colors.textTertiary}
                keyboardType="phone-pad"
              />

              <Text style={styles.inputLabel}>電子郵件</Text>
              <TextInput
                style={styles.input}
                value={form.email}
                onChangeText={(text) => setForm((f) => ({ ...f, email: text }))}
                placeholder="請輸入電子郵件"
                placeholderTextColor={colors.textTertiary}
                keyboardType="email-address"
                autoCapitalize="none"
              />

              <Text style={styles.inputLabel}>地址</Text>
              <TextInput
                style={styles.input}
                value={form.address}
                onChangeText={(text) => setForm((f) => ({ ...f, address: text }))}
                placeholder="請輸入客戶地址"
                placeholderTextColor={colors.textTertiary}
                multiline
              />

              <Text style={styles.inputLabel}>備註</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={form.notes}
                onChangeText={(text) => setForm((f) => ({ ...f, notes: text }))}
                placeholder="填寫客戶相關備註"
                placeholderTextColor={colors.textTertiary}
                multiline
                numberOfLines={3}
              />
            </ScrollView>

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setModalVisible(false)}
              >
                <Text style={styles.cancelButtonText}>取消</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>儲存</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingTop: 60,
      paddingBottom: 16,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      padding: 8,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    addButton: {
      padding: 8,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.surface,
      marginHorizontal: 16,
      marginTop: 12,
      marginBottom: 8,
      paddingHorizontal: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      paddingVertical: 12,
      fontSize: 16,
      color: colors.text,
    },
    clearButton: {
      padding: 4,
    },
    content: {
      flex: 1,
      padding: 16,
    },
    emptyState: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 100,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.textSecondary,
      marginTop: 16,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.textTertiary,
      marginTop: 8,
    },
    customerCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      padding: 12,
      marginBottom: 12,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      gap: 12,
    },
    avatarContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: colors.primaryGlow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.primary,
    },
    customerInfo: {
      flex: 1,
    },
    customerName: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginBottom: 2,
    },
    infoText: {
      fontSize: 13,
      color: colors.textSecondary,
      flex: 1,
    },
    orderBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: 6,
      backgroundColor: colors.primaryGlow,
      alignSelf: 'flex-start',
    },
    orderBadgeText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
    },
    cardActions: {
      justifyContent: 'center',
      gap: 6,
    },
    actionButton: {
      padding: 6,
    },
    actionButtonDisabled: {
      opacity: 0.5,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.6)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      width: '100%',
      maxWidth: 520,
      backgroundColor: colors.surface,
      borderRadius: 20,
      overflow: 'hidden',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 20,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    modalForm: {
      padding: 20,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
      marginTop: 14,
    },
    input: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    notesInput: {
      minHeight: 80,
      textAlignVertical: 'top',
    },
    modalActions: {
      flexDirection: 'row',
      padding: 20,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    cancelButton: {
      flex: 1,
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    saveButton: {
      flex: 1.5,
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    saveButtonText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#fff',
    },
  });
