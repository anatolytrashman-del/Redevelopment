export async function generateDocument(templateId: string, values: Record<string, string>): Promise<{ url: string }> {
  const resp = await fetch('/api/generate-document', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, values }),
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(data.error || 'Не удалось сгенерировать документ');
  }
  return data;
}
