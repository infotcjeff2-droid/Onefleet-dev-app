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
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useInventoryStore } from '@/store/inventoryStore';
import { useThemeStore } from '@/store/themeStore';
import { Warehouse } from '@/types';
import {
  Warehouse as WarehouseIcon,
  Plus,
  MapPin,
  Edit2,
  Trash2,
  X,
  ArrowLeft,
  Image as ImageIcon,
  Maximize2,
  Package,
  User,
  Phone,
  Layers,
} from 'lucide-react-native';

const PRESET_WAREHOUSE_IMAGES = [
  'https://images.unsplash.com/photo-1553413077-190dd305871c?w=800',
  'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800',
  'https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=800',
  'https://images.unsplash.com/photo-1601598851547-4302969d0614?w=800',
  'https://images.unsplash.com/photo-1565891741441-64926e441838?w=800',
  'https://images.unsplash.com/photo-1577979749830-f1d742b41b87?w=800',
];

interface WarehouseFormData {
  name: string;
  address: string;
  imageUrl: string;
  totalArea: string;
  storageCapacity: string;
  currentStockLevel: string;
  manager: string;
  phone: string;
  notes: string;
}

const EMPTY_FORM: WarehouseFormData = {
  name: '',
  address: '',
  imageUrl: '',
  totalArea: '',
  storageCapacity: '',
  currentStockLevel: '0',
  manager: '',
  phone: '',
  notes: '',
};

export default function WarehouseManagement() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const {
    warehouses,
    isLoading,
    loadWarehouses,
    addWarehouse,
    updateWarehouse,
    deleteWarehouse,
  } = useInventoryStore();

  const [modalVisible, setModalVisible] = useState(false);
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [detailWarehouse, setDetailWarehouse] = useState<Warehouse | null>(null);

  const [form, setForm] = useState<WarehouseFormData>(EMPTY_FORM);

  useEffect(() => {
    loadWarehouses();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadWarehouses();
    setRefreshing(false);
  };

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setEditingWarehouse(null);
  };

  const openAddModal = () => {
    resetForm();
    setModalVisible(true);
  };

  const openEditModal = (warehouse: Warehouse) => {
    setEditingWarehouse(warehouse);
    setForm({
      name: warehouse.name ?? '',
      address: warehouse.address ?? '',
      imageUrl: warehouse.imageUrl ?? '',
      totalArea: warehouse.totalArea != null ? String(warehouse.totalArea) : '',
      storageCapacity: warehouse.storageCapacity != null ? String(warehouse.storageCapacity) : '',
      currentStockLevel:
        warehouse.currentStockLevel != null ? String(warehouse.currentStockLevel) : '0',
      manager: warehouse.manager ?? '',
      phone: warehouse.phone ?? '',
      notes: warehouse.notes ?? '',
    });
    setModalVisible(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      Alert.alert('錯誤', '請輸入倉庫名稱');
      return;
    }

    const payload = {
      name: form.name.trim(),
      address: form.address.trim(),
      imageUrl: form.imageUrl,
      totalArea: form.totalArea ? Number(form.totalArea) : undefined,
      storageCapacity: form.storageCapacity ? Number(form.storageCapacity) : undefined,
      currentStockLevel: form.currentStockLevel ? Number(form.currentStockLevel) : 0,
      manager: form.manager.trim(),
      phone: form.phone.trim(),
      notes: form.notes.trim(),
    };

    try {
      if (editingWarehouse) {
        await updateWarehouse(editingWarehouse.id, payload);
      } else {
        await addWarehouse(payload);
      }
      setModalVisible(false);
      resetForm();
    } catch (error) {
      Alert.alert('錯誤', '儲存失敗');
    }
  };

  const handleDelete = (warehouse: Warehouse) => {
    Alert.alert(
      '確認刪除',
      `確定要刪除「${warehouse.name}」嗎？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '刪除',
          style: 'destructive',
          onPress: () => deleteWarehouse(warehouse.id),
        },
      ]
    );
  };

  const openDetailModal = (warehouse: Warehouse) => {
    setDetailWarehouse(warehouse);
  };

  const getUsagePercent = (wh: Warehouse): number => {
    if (!wh.storageCapacity || wh.storageCapacity === 0) return 0;
    const used = wh.currentStockLevel ?? 0;
    return Math.min(100, Math.round((used / wh.storageCapacity) * 100));
  };

  const styles = createStyles(colors);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <ArrowLeft size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>倉庫管理</Text>
        <TouchableOpacity onPress={openAddModal} style={styles.addButton}>
          <Plus size={24} color={colors.primary} />
        </TouchableOpacity>
      </View>

      {/* Warehouse List */}
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {warehouses.length === 0 ? (
          <View style={styles.emptyState}>
            <WarehouseIcon size={64} color={colors.textTertiary} />
            <Text style={styles.emptyText}>尚無倉庫資料</Text>
            <Text style={styles.emptySubtext}>點擊右上角新增倉庫</Text>
          </View>
        ) : (
          warehouses.map((warehouse) => {
            const usagePercent = getUsagePercent(warehouse);
            return (
              <TouchableOpacity
                key={warehouse.id}
                style={styles.warehouseCard}
                onPress={() => openDetailModal(warehouse)}
              >
                {/* 圖片 */}
                <View style={styles.imageWrap}>
                  {warehouse.imageUrl ? (
                    <Image
                      source={{ uri: warehouse.imageUrl }}
                      style={styles.warehouseImage}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.warehouseImage, styles.placeholderImage]}>
                      <WarehouseIcon size={32} color={colors.textTertiary} />
                    </View>
                  )}
                </View>

                {/* 資訊 */}
                <View style={styles.warehouseInfo}>
                  <Text style={styles.warehouseName} numberOfLines={1}>
                    {warehouse.name}
                  </Text>

                  {warehouse.address ? (
                    <View style={styles.infoRow}>
                      <MapPin size={13} color={colors.textSecondary} />
                      <Text style={styles.infoText} numberOfLines={1}>
                        {warehouse.address}
                      </Text>
                    </View>
                  ) : null}

                  {/* 指標 */}
                  <View style={styles.metricsRow}>
                    {warehouse.totalArea != null && (
                      <View style={styles.metricChip}>
                        <Maximize2 size={12} color={colors.primary} />
                        <Text style={styles.metricText}>
                          {warehouse.totalArea.toLocaleString()} m²
                        </Text>
                      </View>
                    )}
                    {warehouse.storageCapacity != null && (
                      <View style={styles.metricChip}>
                        <Layers size={12} color={colors.secondary} />
                        <Text style={styles.metricText}>
                          容量 {warehouse.storageCapacity.toLocaleString()}
                        </Text>
                      </View>
                    )}
                  </View>

                  {/* 使用率 */}
                  {warehouse.storageCapacity != null && warehouse.storageCapacity > 0 && (
                    <View style={styles.usageContainer}>
                      <View style={styles.usageLabelRow}>
                        <Text style={styles.usageLabel}>使用率</Text>
                        <Text style={styles.usageValue}>{usagePercent}%</Text>
                      </View>
                      <View style={styles.usageBarTrack}>
                        <View
                          style={[
                            styles.usageBarFill,
                            {
                              width: `${usagePercent}%`,
                              backgroundColor:
                                usagePercent > 80
                                  ? colors.danger
                                  : usagePercent > 60
                                  ? colors.warning
                                  : colors.primary,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  )}

                  {/* 聯絡人 */}
                  {(warehouse.manager || warehouse.phone) && (
                    <View style={styles.contactRow}>
                      {warehouse.manager && (
                        <View style={styles.contactItem}>
                          <User size={12} color={colors.textTertiary} />
                          <Text style={styles.contactText}>{warehouse.manager}</Text>
                        </View>
                      )}
                      {warehouse.phone && (
                        <View style={styles.contactItem}>
                          <Phone size={12} color={colors.textTertiary} />
                          <Text style={styles.contactText}>{warehouse.phone}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* 詳情 Modal */}
      {detailWarehouse && (
        <Modal
          visible={!!detailWarehouse}
          animationType="slide"
          transparent={true}
          onRequestClose={() => setDetailWarehouse(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>倉庫詳情</Text>
                <TouchableOpacity onPress={() => setDetailWarehouse(null)}>
                  <X size={22} color={colors.textSecondary} />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {/* 圖片 */}
                {detailWarehouse.imageUrl ? (
                  <Image
                    source={{ uri: detailWarehouse.imageUrl }}
                    style={styles.detailImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.detailImage, styles.placeholderImage]}>
                    <WarehouseIcon size={48} color={colors.textTertiary} />
                  </View>
                )}

                {/* 標題 */}
                <View style={styles.detailSection}>
                  <Text style={styles.detailName}>{detailWarehouse.name}</Text>
                  {detailWarehouse.address && (
                    <View style={styles.detailRow}>
                      <MapPin size={14} color={colors.textSecondary} />
                      <Text style={styles.detailText}>{detailWarehouse.address}</Text>
                    </View>
                  )}
                </View>

                {/* 指標 */}
                <View style={styles.detailMetricsGrid}>
                  {detailWarehouse.totalArea != null && (
                    <View style={styles.detailMetricCard}>
                      <Maximize2 size={18} color={colors.primary} />
                      <Text style={styles.detailMetricValue}>
                        {detailWarehouse.totalArea.toLocaleString()} m²
                      </Text>
                      <Text style={styles.detailMetricLabel}>總面積</Text>
                    </View>
                  )}
                  {detailWarehouse.storageCapacity != null && (
                    <View style={styles.detailMetricCard}>
                      <Layers size={18} color={colors.primary} />
                      <Text style={styles.detailMetricValue}>
                        {detailWarehouse.storageCapacity.toLocaleString()}
                      </Text>
                      <Text style={styles.detailMetricLabel}>存放容量</Text>
                    </View>
                  )}
                  {detailWarehouse.currentStockLevel != null && (
                    <View style={styles.detailMetricCard}>
                      <Package size={18} color={colors.primary} />
                      <Text style={styles.detailMetricValue}>
                        {detailWarehouse.currentStockLevel.toLocaleString()}
                      </Text>
                      <Text style={styles.detailMetricLabel}>目前庫存</Text>
                    </View>
                  )}
                  {detailWarehouse.manager && (
                    <View style={styles.detailMetricCard}>
                      <User size={18} color={colors.primary} />
                      <Text style={styles.detailMetricValue} numberOfLines={1}>
                        {detailWarehouse.manager}
                      </Text>
                      <Text style={styles.detailMetricLabel}>負責人</Text>
                    </View>
                  )}
                </View>

                {/* 使用率 */}
                {detailWarehouse.storageCapacity != null &&
                  detailWarehouse.storageCapacity > 0 && (
                    <View style={styles.detailUsageContainer}>
                      <View style={styles.detailUsageLabelRow}>
                        <Text style={styles.detailUsageLabel}>使用率</Text>
                        <Text style={styles.detailUsageValue}>
                          {getUsagePercent(detailWarehouse)}%
                        </Text>
                      </View>
                      <View style={styles.detailUsageBarTrack}>
                        <View
                          style={[
                            styles.detailUsageBarFill,
                            {
                              width: `${getUsagePercent(detailWarehouse)}%`,
                              backgroundColor:
                                getUsagePercent(detailWarehouse) >= 90
                                  ? '#EF4444'
                                  : getUsagePercent(detailWarehouse) >= 70
                                  ? '#F59E0B'
                                  : colors.primary,
                            },
                          ]}
                        />
                      </View>
                    </View>
                  )}

                {/* 聯絡人 */}
                {(detailWarehouse.manager || detailWarehouse.phone) && (
                  <View style={styles.detailContactSection}>
                    {detailWarehouse.manager && (
                      <View style={styles.detailContactItem}>
                        <User size={14} color={colors.textTertiary} />
                        <Text style={styles.detailContactLabel}>負責人</Text>
                        <Text style={styles.detailContactText}>
                          {detailWarehouse.manager}
                        </Text>
                      </View>
                    )}
                    {detailWarehouse.phone && (
                      <View style={styles.detailContactItem}>
                        <Phone size={14} color={colors.textTertiary} />
                        <Text style={styles.detailContactLabel}>電話</Text>
                        <Text style={styles.detailContactText}>
                          {detailWarehouse.phone}
                        </Text>
                      </View>
                    )}
                  </View>
                )}

                {/* 備註 */}
                {detailWarehouse.notes && (
                  <View style={styles.detailNotesSection}>
                    <Text style={styles.detailNotesLabel}>備註</Text>
                    <Text style={styles.detailNotesText}>{detailWarehouse.notes}</Text>
                  </View>
                )}
              </ScrollView>

              {/* 操作按鈕 */}
              <View style={styles.detailActions}>
                <TouchableOpacity
                  style={styles.detailDeleteBtn}
                  onPress={() => {
                    setDetailWarehouse(null);
                    handleDelete(detailWarehouse);
                  }}
                >
                  <Trash2 size={18} color="#EF4444" />
                  <Text style={styles.detailDeleteBtnText}>刪除</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.detailEditBtn}
                  onPress={() => {
                    setDetailWarehouse(null);
                    openEditModal(detailWarehouse);
                  }}
                >
                  <Edit2 size={18} color="#fff" />
                  <Text style={styles.detailEditBtnText}>編輯資料</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Add/Edit Modal */}
      <Modal
        visible={modalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>
                {editingWarehouse ? '編輯倉庫' : '新增倉庫'}
              </Text>
              <TouchableOpacity onPress={() => setModalVisible(false)}>
                <X size={22} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* 名稱 */}
              <Text style={styles.inputLabel}>倉庫名稱 *</Text>
              <TextInput
                style={styles.input}
                value={form.name}
                onChangeText={(text) => setForm((f) => ({ ...f, name: text }))}
                placeholder="例如：台中中央倉庫 A"
                placeholderTextColor={colors.textTertiary}
              />

              {/* 地址 */}
              <Text style={styles.inputLabel}>地址</Text>
              <TextInput
                style={styles.input}
                value={form.address}
                onChangeText={(text) => setForm((f) => ({ ...f, address: text }))}
                placeholder="請輸入完整地址..."
                placeholderTextColor={colors.textTertiary}
              />

              {/* 圖片 */}
              <Text style={styles.inputLabel}>倉庫圖片</Text>
              <View style={styles.imagePickerWrap}>
                {form.imageUrl ? (
                  <View style={styles.selectedImageWrap}>
                    <Image source={{ uri: form.imageUrl }} style={styles.selectedImage} />
                    <TouchableOpacity
                      style={styles.removeImageBtn}
                      onPress={() => setForm((f) => ({ ...f, imageUrl: '' }))}
                    >
                      <X size={14} color="#fff" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    style={styles.imagePickerBtn}
                    onPress={() => setShowImagePicker(true)}
                  >
                    <ImageIcon size={24} color={colors.textTertiary} />
                    <Text style={styles.imagePickerText}>選擇圖片</Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* 面積 */}
              <Text style={styles.inputLabel}>總面積 (m²)</Text>
              <TextInput
                style={styles.input}
                value={form.totalArea}
                onChangeText={(text) => setForm((f) => ({ ...f, totalArea: text }))}
                placeholder="例如：500"
                keyboardType="numeric"
                placeholderTextColor={colors.textTertiary}
              />

              {/* 容量 */}
              <Text style={styles.inputLabel}>存放容量</Text>
              <TextInput
                style={styles.input}
                value={form.storageCapacity}
                onChangeText={(text) => setForm((f) => ({ ...f, storageCapacity: text }))}
                placeholder="例如：10000"
                keyboardType="numeric"
                placeholderTextColor={colors.textTertiary}
              />

              {/* 庫存量 */}
              <Text style={styles.inputLabel}>目前庫存</Text>
              <TextInput
                style={styles.input}
                value={form.currentStockLevel}
                onChangeText={(text) =>
                  setForm((f) => ({ ...f, currentStockLevel: text }))
                }
                placeholder="例如：5000"
                keyboardType="numeric"
                placeholderTextColor={colors.textTertiary}
              />

              {/* 負責人 */}
              <Text style={styles.inputLabel}>負責人</Text>
              <TextInput
                style={styles.input}
                value={form.manager}
                onChangeText={(text) => setForm((f) => ({ ...f, manager: text }))}
                placeholder="請輸入姓名"
                placeholderTextColor={colors.textTertiary}
              />

              {/* 電話 */}
              <Text style={styles.inputLabel}>電話</Text>
              <TextInput
                style={styles.input}
                value={form.phone}
                onChangeText={(text) => setForm((f) => ({ ...f, phone: text }))}
                placeholder="例如：02-1234-5678"
                placeholderTextColor={colors.textTertiary}
              />

              {/* 備註 */}
              <Text style={styles.inputLabel}>備註</Text>
              <TextInput
                style={[styles.input, styles.notesInput]}
                value={form.notes}
                onChangeText={(text) => setForm((f) => ({ ...f, notes: text }))}
                placeholder="其他備註..."
                multiline
                numberOfLines={3}
                placeholderTextColor={colors.textTertiary}
              />
            </ScrollView>

            {/* 底部按鈕 */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => {
                  setModalVisible(false);
                  resetForm();
                }}
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

      {/* 圖片選擇 Modal */}
      {showImagePicker && (
        <Modal
          visible={showImagePicker}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowImagePicker(false)}
        >
          <View style={styles.pickerOverlay}>
            <View style={[styles.pickerContent, { backgroundColor: colors.card }]}>
              <Text style={[styles.pickerTitle, { color: colors.text }]}>選擇倉庫圖片</Text>
              <View style={styles.pickerGrid}>
                {PRESET_WAREHOUSE_IMAGES.map((url, index) => (
                  <TouchableOpacity
                    key={index}
                    style={styles.pickerImageWrap}
                    onPress={() => {
                      setForm((f) => ({ ...f, imageUrl: url }));
                      setShowImagePicker(false);
                    }}
                  >
                    <Image
                      source={{ uri: url }}
                      style={styles.pickerImage}
                      resizeMode="cover"
                    />
                  </TouchableOpacity>
                ))}
              </View>
              <TouchableOpacity
                style={[styles.pickerCloseBtn, { borderColor: colors.border }]}
                onPress={() => setShowImagePicker(false)}
              >
                <Text style={styles.pickerCloseBtnText}>關閉</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useThemeStore>['colors']) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 60,
      paddingBottom: 16,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      backgroundColor: colors.card,
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
    warehouseCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      marginBottom: 16,
      overflow: 'hidden',
      elevation: 2,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
    },
    imageWrap: {
      position: 'relative',
      width: '100%',
      height: 140,
    },
    warehouseImage: {
      width: '100%',
      height: '100%',
    },
    placeholderImage: {
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    imageOverlay: {
      position: 'absolute',
      top: 8,
      right: 8,
      flexDirection: 'row',
      gap: 8,
    },
    iconButton: {
      width: 32,
      height: 32,
      borderRadius: 8,
      backgroundColor: 'rgba(0,0,0,0.5)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    deleteButton: {
      backgroundColor: 'rgba(239,68,68,0.7)',
    },
    warehouseInfo: {
      padding: 14,
    },
    warehouseName: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      marginBottom: 8,
    },
    infoText: {
      fontSize: 13,
      color: colors.textSecondary,
      flex: 1,
    },
    metricsRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },
    metricChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: colors.surface,
    },
    metricText: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    usageContainer: {
      marginTop: 4,
    },
    usageLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 4,
    },
    usageLabel: {
      fontSize: 12,
      color: colors.textSecondary,
    },
    usageValue: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    usageBarTrack: {
      height: 6,
      borderRadius: 3,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    usageBarFill: {
      height: '100%',
      borderRadius: 3,
    },
    contactRow: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 4,
    },
    contactItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    contactText: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      maxHeight: '92%',
      minHeight: 200,
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: 18,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    modalBody: {
      padding: 16,
      maxHeight: 500,
    },
    inputLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 6,
      marginTop: 14,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 12,
      fontSize: 15,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    notesInput: {
      height: 80,
      textAlignVertical: 'top',
    },
    imagePickerWrap: {
      marginBottom: 8,
    },
    imagePickerBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      padding: 20,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderStyle: 'dashed',
    },
    imagePickerText: {
      fontSize: 14,
      color: colors.textTertiary,
    },
    selectedImageWrap: {
      position: 'relative',
      width: 120,
      height: 80,
      borderRadius: 8,
      overflow: 'hidden',
    },
    selectedImage: {
      width: '100%',
      height: '100%',
    },
    removeImageBtn: {
      position: 'absolute',
      top: 4,
      right: 4,
      width: 22,
      height: 22,
      borderRadius: 11,
      backgroundColor: 'rgba(0,0,0,0.6)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalFooter: {
      flexDirection: 'row',
      padding: 16,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    cancelButton: {
      flex: 1,
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.background,
      alignItems: 'center',
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    saveButton: {
      flex: 1,
      padding: 16,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    saveButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: '#fff',
    },
    pickerOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    pickerContent: {
      width: '90%',
      borderRadius: 16,
      padding: 20,
    },
    pickerTitle: {
      fontSize: 17,
      fontWeight: '700',
      marginBottom: 16,
      textAlign: 'center',
    },
    pickerGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 16,
    },
    pickerImageWrap: {
      width: '48%',
      aspectRatio: 16 / 9,
      borderRadius: 8,
      overflow: 'hidden',
    },
    pickerImage: {
      width: '100%',
      height: '100%',
    },
    pickerCloseBtn: {
      padding: 12,
      borderRadius: 10,
      borderWidth: 1,
      alignItems: 'center',
    },
    pickerCloseBtnText: {
      fontSize: 15,
      color: colors.textSecondary,
    },
    detailImage: {
      width: '100%',
      height: 200,
      borderRadius: 12,
      marginBottom: 16,
    },
    detailSection: {
      marginBottom: 16,
    },
    detailName: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 6,
    },
    detailText: {
      fontSize: 15,
      color: colors.textSecondary,
      flex: 1,
    },
    detailMetricsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 16,
    },
    detailMetricCard: {
      flex: 1,
      minWidth: '45%',
      padding: 14,
      borderRadius: 12,
      backgroundColor: colors.background,
      alignItems: 'center',
      gap: 6,
    },
    detailMetricValue: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    detailMetricLabel: {
      fontSize: 12,
      color: colors.textTertiary,
    },
    detailUsageContainer: {
      marginBottom: 16,
    },
    detailUsageLabelRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    detailUsageLabel: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    detailUsageValue: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    detailUsageBarTrack: {
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    detailUsageBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    detailContactSection: {
      gap: 8,
      marginBottom: 16,
    },
    detailContactItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    detailContactLabel: {
      fontSize: 13,
      color: colors.textTertiary,
      minWidth: 50,
    },
    detailContactText: {
      fontSize: 14,
      color: colors.text,
      flex: 1,
    },
    detailNotesSection: {
      marginBottom: 8,
    },
    detailNotesLabel: {
      fontSize: 13,
      color: colors.textTertiary,
      marginBottom: 6,
    },
    detailNotesText: {
      fontSize: 14,
      color: colors.textSecondary,
      lineHeight: 20,
    },
    detailActions: {
      flexDirection: 'row',
      padding: 16,
      gap: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    detailDeleteBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: '#EF4444',
    },
    detailDeleteBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#EF4444',
    },
    detailEditBtn: {
      flex: 2,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    detailEditBtnText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#fff',
    },
  });
}
