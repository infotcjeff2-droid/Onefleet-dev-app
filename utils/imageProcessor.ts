/**
 * 圖片處理工具 - 壓縮和本地預覽
 */
import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

const PENDING_PHOTOS_KEY = 'pending_delivery_photos';

/**
 * 生成簡單的唯一 ID（不使用 uuid 庫）
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * 壓縮圖片
 * @param uri 原始圖片 URI
 * @param maxWidth 最大寬度
 * @param maxHeight 最大高度
 * @param quality 壓縮質量 (0-1)
 */
export async function compressImage(
  uri: string,
  maxWidth: number = 1280,
  maxHeight: number = 720,
  quality: number = 0.7
): Promise<string> {
  try {
    console.log('[ImageProcessor] Starting compression for:', uri);
    
    const manipResult = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxWidth, height: maxHeight } }],
      { compress: quality, format: ImageManipulator.SaveFormat.JPEG }
    );
    
    console.log('[ImageProcessor] Compression complete:', manipResult.uri);
    return manipResult.uri;
  } catch (error) {
    console.error('[ImageProcessor] Compression failed:', error);
    // 壓縮失敗時返回原始 URI
    return uri;
  }
}

/**
 * Web 平台專用：使用 Canvas 壓縮圖片
 */
export async function compressImageWeb(
  dataUri: string,
  maxWidth: number = 1280,
  maxHeight: number = 720,
  quality: number = 0.7
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        // 計算縮放比例
        let width = img.naturalWidth;
        let height = img.naturalHeight;
        
        if (width > maxWidth) {
          height = (height * maxWidth) / width;
          width = maxWidth;
        }
        if (height > maxHeight) {
          width = (width * maxHeight) / height;
          height = maxHeight;
        }
        
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas context failed'));
          return;
        }
        
        ctx.drawImage(img, 0, 0, width, height);
        const compressedDataUri = canvas.toDataURL('image/jpeg', quality);
        console.log('[ImageProcessor Web] Compression complete:', 
          `Original: ${dataUri.length} bytes -> Compressed: ${compressedDataUri.length} bytes`);
        resolve(compressedDataUri);
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = () => reject(new Error('Image load failed'));
    img.src = dataUri;
  });
}

/**
 * 跨平台圖片壓縮（根據環境自動選擇）
 */
export async function compressImageCrossPlatform(
  uri: string,
  maxWidth: number = 1280,
  maxHeight: number = 720,
  quality: number = 0.7
): Promise<string> {
  if (typeof window !== 'undefined' && uri.startsWith('data:')) {
    return compressImageWeb(uri, maxWidth, maxHeight, quality);
  }
  
  return compressImage(uri, maxWidth, maxHeight, quality);
}

/**
 * 將本地 URI 轉換為 base64（用於本地預覽）
 */
export async function uriToBase64(uri: string): Promise<string> {
  try {
    if (uri.startsWith('data:')) {
      return uri;
    }
    
    // 嘗試使用 FileSystem 讀取（React Native）
    if (typeof FileSystem !== 'undefined' && FileSystem.readAsStringAsync) {
      const base64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mimeType = uri.endsWith('.png') ? 'image/png' : 'image/jpeg';
      return `data:${mimeType};base64,${base64}`;
    }
    
    // Web 環境：使用 fetch
    const response = await fetch(uri);
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('[ImageProcessor] uriToBase64 failed:', error);
    return uri; // 失敗時返回原始 URI
  }
}

/**
 * 保存待上傳的照片到本地存儲（本地預覽用）
 */
export async function savePendingPhotoToLocal(
  deliveryId: string,
  photoUri: string,
  isPickupPhoto: boolean
): Promise<string> {
  try {
    // 轉換為 base64
    const base64Uri = await uriToBase64(photoUri);
    
    // 生成唯一 ID
    const photoId = `pending_${generateId()}`;
    
    // 構造待上傳照片數據
    const pendingPhoto = {
      id: photoId,
      uri: base64Uri, // 保存 base64 用於本地預覽
      takenAt: new Date().toISOString(),
      isPickupPhoto,
      deliveryId,
      status: 'pending' as 'pending' | 'uploading' | 'completed' | 'failed',
    };
    
    // 讀取現有的待上傳照片
    const existingData = localStorage.getItem(`${PENDING_PHOTOS_KEY}_${deliveryId}`);
    const existingPhotos = existingData ? JSON.parse(existingData) : [];
    
    // 添加新照片
    existingPhotos.push(pendingPhoto);
    
    // 保存回 localStorage
    localStorage.setItem(
      `${PENDING_PHOTOS_KEY}_${deliveryId}`,
      JSON.stringify(existingPhotos)
    );
    
    console.log('[ImageProcessor] Saved pending photo to local:', photoId);
    return photoId;
  } catch (error) {
    console.error('[ImageProcessor] savePendingPhotoToLocal failed:', error);
    return '';
  }
}

/**
 * 更新待上傳照片的狀態
 */
export function updatePendingPhotoStatus(
  deliveryId: string,
  photoId: string,
  status: 'pending' | 'uploading' | 'completed' | 'failed',
  finalUri?: string
): void {
  try {
    const existingData = localStorage.getItem(`${PENDING_PHOTOS_KEY}_${deliveryId}`);
    if (!existingData) return;
    
    const existingPhotos = JSON.parse(existingData);
    const photoIndex = existingPhotos.findIndex((p: any) => p.id === photoId);
    
    if (photoIndex !== -1) {
      existingPhotos[photoIndex].status = status;
      if (finalUri) {
        existingPhotos[photoIndex].uri = finalUri;
      }
      
      localStorage.setItem(
        `${PENDING_PHOTOS_KEY}_${deliveryId}`,
        JSON.stringify(existingPhotos)
      );
    }
  } catch (error) {
    console.error('[ImageProcessor] updatePendingPhotoStatus failed:', error);
  }
}

/**
 * 獲取待上傳照片（本地預覽）
 */
export function getPendingPhotos(deliveryId: string): any[] {
  try {
    const existingData = localStorage.getItem(`${PENDING_PHOTOS_KEY}_${deliveryId}`);
    if (!existingData) return [];
    
    return JSON.parse(existingData).filter(
      (p: any) => p.status === 'pending' || p.status === 'uploading'
    );
  } catch (error) {
    console.error('[ImageProcessor] getPendingPhotos failed:', error);
    return [];
  }
}

/**
 * 刪除待上傳照片
 */
export function removePendingPhoto(deliveryId: string, photoId: string): void {
  try {
    const existingData = localStorage.getItem(`${PENDING_PHOTOS_KEY}_${deliveryId}`);
    if (!existingData) return;
    
    const existingPhotos = JSON.parse(existingData);
    const filteredPhotos = existingPhotos.filter((p: any) => p.id !== photoId);
    
    localStorage.setItem(
      `${PENDING_PHOTOS_KEY}_${deliveryId}`,
      JSON.stringify(filteredPhotos)
    );
  } catch (error) {
    console.error('[ImageProcessor] removePendingPhoto failed:', error);
  }
}

/**
 * 清除所有已完成的待上傳照片
 */
export function clearCompletedPendingPhotos(deliveryId: string): void {
  try {
    const existingData = localStorage.getItem(`${PENDING_PHOTOS_KEY}_${deliveryId}`);
    if (!existingData) return;
    
    const existingPhotos = JSON.parse(existingData);
    const pendingPhotos = existingPhotos.filter(
      (p: any) => p.status !== 'completed'
    );
    
    localStorage.setItem(
      `${PENDING_PHOTOS_KEY}_${deliveryId}`,
      JSON.stringify(pendingPhotos)
    );
  } catch (error) {
    console.error('[ImageProcessor] clearCompletedPendingPhotos failed:', error);
  }
}
