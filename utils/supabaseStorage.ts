/**
 * Supabase Storage 上傳工具
 * 車輛圖片統一走這裡上傳至 vehicle-images bucket
 */
import { supabase } from './supabase';

const BUCKET = 'vehicle-images';

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
 */
export async function uploadVehicleImage(uri: string, vehicleId: string): Promise<string> {
  if (!supabase) {
    throw new Error('Supabase 未設定，無法上傳圖片');
  }

  const timestamp = Date.now();
  const filename = `${vehicleId}_${timestamp}.jpg`;
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
        .from(BUCKET)
        .upload(filename, arrayBuffer, { contentType, upsert: true });

      if (error) throw error;

      const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
      return urlData.publicUrl;
    } catch (err) {
      throw new Error(`上傳失敗: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 其餘 URI（data: / http: / file:）走標準流程
  const arrayBuffer = await uriToArrayBuffer(uri);
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filename, arrayBuffer, { contentType, upsert: true });

  if (error) throw error;

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(filename);
  return urlData.publicUrl;
}
