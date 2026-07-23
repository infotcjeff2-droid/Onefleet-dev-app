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
    const { data: buckets, error } = await supabase.storage.listBuckets();
    if (error) {
      return { exists: false, hasPublicAccess: false, error: `無法列出 buckets: ${error.message}` };
    }

    const bucket = buckets?.find((b) => b.id === bucketName);
    if (!bucket) {
      return { exists: false, hasPublicAccess: false, error: `Bucket '${bucketName}' 不存在，請在 Supabase Dashboard 建立` };
    }

    // 檢查 public bucket 的 policy
    const { data: files, error: listError } = await supabase.storage.from(bucketName).list('', { limit: 1 });
    if (listError) {
      return { exists: true, hasPublicAccess: false, error: `無法訪問 bucket: ${listError.message}` };
    }

    return { exists: true, hasPublicAccess: true };
  } catch (err) {
    return { exists: false, hasPublicAccess: false, error: `檢查失敗: ${err instanceof Error ? err.message : String(err)}` };
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
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas context failed')); return; }
        ctx.drawImage(img, 0, 0);
        const ext = canvas.width > 0 && canvas.height > 0 ? 'png' : 'jpeg';
        resolve(canvas.toDataURL(`image/${ext}`, 0.85));
      } catch {
        reject(new Error('Canvas toDataURL failed'));
      }
    };
    img.onerror = () => reject(new Error(`Image load failed for: ${blobUrl}`));
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

  // 確保 bucket 存在
  const bucketCheck = await checkBucketAccess(type);
  if (!bucketCheck.exists) {
    const createResult = await ensureBucketExists(type);
    if (!createResult.success) {
      throw new Error(`無法建立 Storage bucket '${bucketName}': ${createResult.error}`);
    }
  } else if (!bucketCheck.hasPublicAccess) {
    throw new Error(`Storage bucket '${bucketName}' 權限不足: ${bucketCheck.error || '請確認 bucket 設為 public'}`);
  }

  const timestamp = Date.now();
  const filename = `${id}_${timestamp}.jpg`;
  let contentType = mimeType(uri);

  // blob: URL 無法 fetch → 用 canvas 轉成 base64 再處理
  if (uri.startsWith('blob:')) {
    try {
      const dataUrl = await blobUrlToDataUrl(uri);
      contentType = 'image/jpeg';
      const base64 = dataUrl.split(',')[1];
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const arrayBuffer = bytes.buffer;

      const { error } = await supabase.storage
        .from(bucketName)
        .upload(filename, arrayBuffer, { contentType, upsert: true });

      if (error) {
        throw new Error(`上傳失敗: ${error.message}`);
      }

      const { data: urlData } = supabase.storage.from(bucketName).getPublicUrl(filename);
      return urlData.publicUrl;
    } catch (err) {
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
    return urlData.publicUrl;
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
