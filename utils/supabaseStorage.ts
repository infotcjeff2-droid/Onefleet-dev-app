/**
 * Supabase Storage 上傳工具
 * 車輛圖片統一走這裡上傳至 vehicle-images bucket
 * 配送照片上傳至 delivery-photos bucket
 */
import { supabase } from './supabase';

const BUCKET_VEHICLE = 'vehicle-images';
const BUCKET_DELIVERY = 'delivery-photos';

export type BucketType = 'vehicle' | 'delivery';

function getBucketName(type: BucketType): string {
  return type === 'vehicle' ? BUCKET_VEHICLE : BUCKET_DELIVERY;
}

/**
 * 檢查 bucket 是否存在並且可訪問
 */
export async function checkBucketAccess(type: BucketType = 'vehicle'): Promise<{ exists: boolean; hasPublicAccess: boolean; error?: string }> {
  if (!supabase) {
    return { exists: false, hasPublicAccess: false, error: 'Supabase 未設定' };
  }

  const bucketName = getBucketName(type);

  try {
    // 嘗試列出 buckets
    const { data: buckets, error: listBucketsError } = await supabase.storage.listBuckets();
    
    // 如果能列出 buckets，檢查是否存在
    if (!listBucketsError && buckets && buckets.length > 0) {
      const bucket = buckets.find((b) => b.id === bucketName);
      if (bucket) {
        // bucket 存在，測試讀取權限
        const { error: listError } = await supabase.storage.from(bucketName).list('', { limit: 1 });
        return { exists: true, hasPublicAccess: !listError, error: listError?.message };
      }
    }
    
    // 無法確認 bucket 是否存在（常見於 anon key），假設存在直接嘗試上傳
    console.log('[Bucket] Cannot confirm bucket via listBuckets, will attempt upload directly');
    return { exists: true, hasPublicAccess: true };
  } catch (err) {
    console.error('[Bucket] Check failed:', err);
    // 檢查失敗時，假設 bucket 存在，讓上傳邏輯處理
    return { exists: true, hasPublicAccess: true };
  }
}

/**
 * 建立 bucket（如果不存在）
 * 注意：在瀏覽器中使用 anon key 可能無法建立 bucket，需要在 Supabase Dashboard 手動建立
 */
export async function ensureBucketExists(type: BucketType = 'vehicle'): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase 未設定' };
  }

  const bucketName = getBucketName(type);

  try {
    // 嘗試列出 buckets
    const { data: buckets, error: listError } = await supabase.storage.listBuckets();
    if (listError) {
      return { success: false, error: `無法列出 buckets: ${listError.message}` };
    }

    const bucket = buckets?.find((b) => b.id === bucketName);
    if (bucket) {
      return { success: true }; // bucket 已存在
    }

    // 嘗試建立 bucket（瀏覽器中 anon key 可能沒有權限）
    const { error: createError } = await supabase.storage.createBucket(bucketName, { public: true });
    if (createError) {
      // 如果自動建立失敗，返回詳細錯誤
      return {
        success: false,
        error: `無法自動建立 bucket: ${createError.message}\n\n請手動在 Supabase Dashboard > Storage > New bucket 建立名為 '${bucketName}' 的 public bucket。`
      };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: `建立 bucket 失敗: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function mimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

/**
 * 將任意 URI 轉成 ArrayBuffer
 * 支援：data:、blob:、file:、http:
 */
async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  // data:image/jpeg;base64,... → 直接解碼
  if (uri.startsWith('data:')) {
    const base64 = uri.split(',')[1];
    if (!base64) throw new Error('Invalid data URI');
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes.buffer;
  }

  // blob: / http: / file: → 用 fetch
  const response = await fetch(uri);
  if (!response.ok) throw new Error(`無法讀取圖片: HTTP ${response.status}`);
  return response.arrayBuffer();
}

/**
 * 將 blob URL 轉成 base64 data URL（專治 web fetch 跨域問題）
 */
function blobUrlToDataUrl(blobUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        console.log('[Upload] Image loaded, size:', img.naturalWidth, 'x', img.naturalHeight);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context failed')); return; }
        ctx.drawImage(img, 0, 0);
        console.log('[Upload] Canvas drawn, converting to dataURL...');
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        console.log('[Upload] DataURL generated, length:', dataUrl.length);
        resolve(dataUrl);
      } catch (err) {
        console.error('[Upload] Canvas toDataURL failed:', err);
        reject(new Error('Canvas toDataURL failed'));
      }
    };
    img.onerror = (e) => {
      console.error('[Upload] Image load failed for:', blobUrl, e);
      reject(new Error(`Image load failed for: ${blobUrl}`));
    };
    img.src = blobUrl;
  });
}

/**
 * 上傳圖片到 Supabase Storage，返回公開 URL
 * @param uri 圖片 URI（支援 blob:、data:、http:、file:）
 * @param id 關聯 ID（車輛 ID 或配送 ID）
 * @param type bucket 類型
 */
export async function uploadImage(
  uri: string,
  id: string,
  type: BucketType = 'vehicle'
): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase 未設定，無法上傳圖片');
  }

  const bucketName = getBucketName(type);

  console.log('[Upload] Checking bucket access for:', bucketName);

  // 確保 bucket 存在
  const bucketCheck = await checkBucketAccess(type);
  console.log('[Upload] Bucket check result:', bucketCheck);

  if (!bucketCheck.exists) {
    console.log('[Upload] Bucket does not exist, attempting to create...');
    const createResult = await ensureBucketExists(type);
    console.log('[Upload] Create result:', createResult);
    if (!createResult.success) {
      throw new Error(`Storage bucket '${bucketName}' 不存在且無法自動建立: ${createResult.error}`);
    }
  } else if (!bucketCheck.hasPublicAccess) {
    throw new Error(`Storage bucket '${bucketName}' 權限不足: ${bucketCheck.error || '請確認 bucket 設為 public'}`);
  } else {
    console.log('[Upload] Bucket exists and has public access');
  }

  const timestamp = Date.now();
  const filename = `${id}_${timestamp}.jpg`;
  let contentType = mimeType(uri);

  // blob: URL 無法 fetch → 用 canvas 轉成 base64 再處理
  if (uri.startsWith('blob:')) {
    try {
      console.log('[Upload] Starting blob URL upload:', uri);
      const dataUrl = await blobUrlToDataUrl(uri);
      contentType = 'image/jpeg';
      const base64 = dataUrl.split(',')[1];
      console.log('[Upload] Base64 length:', base64.length);
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const arrayBuffer = bytes.buffer;

      console.log('[Upload] Uploading to Supabase bucket:', bucketName, 'filename:', filename);
      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filename, arrayBuffer, { contentType, upsert: true });

      if (error) {
        console.error('[Upload] Upload error:', error);
        throw new Error(`上傳失敗: ${error.message}`);
      }
      console.log('[Upload] Upload successful!');

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filename);
      const cleanUrl = urlData.publicUrl.split('?')[0];
      console.log('[Upload] Public URL:', cleanUrl);
      return cleanUrl;
    } catch (err) {
      console.error('[Upload] Catch error:', err);
      if (err instanceof Error && err.message.includes('bucket')) {
        throw err;
      }
      throw new Error(`上傳失敗: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 其餘 URI（data: / http: / file:）走標準流程
  try {
    const arrayBuffer = await uriToArrayBuffer(uri);

    const { error } = await supabase.storage
      .from(bucketName)
      .upload(filename, arrayBuffer, { contentType, upsert: true });

    if (error) {
      throw new Error(`上傳失敗: ${error.message}`);
    }

    const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filename);
    const cleanUrl = urlData.publicUrl.split('?')[0];
    return cleanUrl;
  } catch (err) {
    if (err instanceof Error && err.message.includes('bucket')) {
      throw err;
    }
    throw new Error(`上傳失敗: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * 上傳車輛圖片（保持向後兼容）
 */
export async function uploadVehicleImage(uri: string, vehicleId: string): Promise<string> {
  return uploadImage(uri, vehicleId, 'vehicle');
}

/**
 * 上傳配送照片
 */
export async function uploadDeliveryPhoto(uri: string, deliveryId: string): Promise<string> {
  return uploadImage(uri, deliveryId, 'delivery');
}

/**
 * 確保配送照片 bucket 存在
 */
export async function ensureDeliveryBucketExists(): Promise<{ success: boolean; error?: string }> {
  return ensureBucketExists('delivery');
}
