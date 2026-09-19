import { supabase } from './supabase';
import { withRetry } from './withRetry';
import {
  SUPPLIER_SCREENSHOTS_BUCKET,
  type SupplierScreenshot,
  type SupplierScreenshotRow,
  type SupplierScreenshotStatus,
} from '../data/supplierScreenshots';

const UPLOAD_TIMEOUT_MS = 60000;

function fromRow(row: SupplierScreenshotRow): SupplierScreenshot {
  return {
    id: row.id,
    host: row.host,
    storagePath: row.storage_path,
    publicUrl: row.public_url,
    uploadedAt: row.uploaded_at,
    status: (row.status as SupplierScreenshotStatus) ?? 'pending',
    transcript: row.transcript ?? '',
    processedAt: row.processed_at,
    note: row.note ?? '',
  };
}

export function fetchSupplierScreenshots(): Promise<SupplierScreenshot[]> {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('supplier_screenshots')
      .select('*')
      .order('uploaded_at', { ascending: true });
    if (error) throw error;
    return (data as SupplierScreenshotRow[]).map(fromRow);
  });
}

// Бакет публичный (файлы и так со свободно открытых сайтов поставщиков), и
// это осознанно: разбор идёт из сессии Claude Code обычным curl по
// публичной ссылке — подписанные ссылки с TTL там были бы лишней вознёй.
//
// Сжатия нет намеренно, в отличие от фото объектов: на скрине меню важна
// читаемость мелкого текста, а не вес файла — пережатая картинка ломает
// ровно то, ради чего её грузят.
export function uploadSupplierScreenshot(host: string, file: File): Promise<SupplierScreenshot> {
  const ext = (file.name.split('.').pop() ?? 'png').toLowerCase();
  const path = `${host}/${crypto.randomUUID()}.${ext}`;
  return withRetry(
    async () => {
      const { error: uploadError } = await supabase.storage
        .from(SUPPLIER_SCREENSHOTS_BUCKET)
        .upload(path, file, { contentType: file.type || 'image/png', upsert: true });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from(SUPPLIER_SCREENSHOTS_BUCKET).getPublicUrl(path);
      const { data, error } = await supabase
        .from('supplier_screenshots')
        .insert({ host, storage_path: path, public_url: urlData.publicUrl })
        .select()
        .single();
      if (error) throw error;
      return fromRow(data as SupplierScreenshotRow);
    },
    1000,
    UPLOAD_TIMEOUT_MS,
  );
}

export function deleteSupplierScreenshot(screenshot: SupplierScreenshot): Promise<void> {
  return withRetry(async () => {
    const { error } = await supabase.from('supplier_screenshots').delete().eq('id', screenshot.id);
    if (error) throw error;
    // Файл — после строки: осиротевший файл в бакете безвреден, а строка,
    // ссылающаяся на удалённый файл, ломает разбор.
    await supabase.storage.from(SUPPLIER_SCREENSHOTS_BUCKET).remove([screenshot.storagePath]);
  });
}
