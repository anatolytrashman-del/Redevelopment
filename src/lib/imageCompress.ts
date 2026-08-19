// Порог, ниже которого не пересжимаем — уже маленький файл, лишняя работа.
const COMPRESS_THRESHOLD_BYTES = 600 * 1024;
const COMPRESS_MAX_DIMENSION = 1920;

// PNG со скриншотов/каталогов поставщиков (особенно с прозрачностью) весят
// в разы больше JPEG того же кадра — на нестабильной мобильной сети такой
// файл не успевает догрузиться даже за несколько попыток ("Load failed" /
// "Сервер не отвечает"), хотя тот же кадр в JPEG грузится мгновенно.
// Пересжимаем перед отправкой в любой формат, кроме уже небольших файлов.
// Прозрачность (если была) заливаем белым — иначе после конвертации в JPEG
// она стала бы чёрной. Общая для всех загрузчиков фото (объекты, залоги) —
// см. objectsApi.ts/pledgesApi.ts.
export async function compressImageIfNeeded(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.size < COMPRESS_THRESHOLD_BYTES) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, COMPRESS_MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(bitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.85));
    if (!blob || blob.size >= file.size) return file;
    const newName = `${file.name.replace(/\.[^.]+$/, '')}.jpg`;
    return new File([blob], newName, { type: 'image/jpeg' });
  } catch {
    // Браузер не смог обработать (редкий формат и т.п.) — грузим оригинал как есть.
    return file;
  }
}
