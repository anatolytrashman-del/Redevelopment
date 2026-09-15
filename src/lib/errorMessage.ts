// Общий вариант хелпера, который до этого жил локальными копиями в
// Suppliers.tsx, SupplierCorrespondenceTab.tsx и других: текст ошибки из
// Supabase/fetch, если он есть, иначе понятная человеку заглушка.
export function errorMessage(err: unknown, fallback: string): string {
  if (err && typeof err === 'object' && 'message' in err && typeof (err as { message: unknown }).message === 'string') {
    return (err as { message: string }).message;
  }
  return fallback;
}
