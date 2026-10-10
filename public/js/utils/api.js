/**
 * AntiPasteExam — Central API Request Utility
 */
export async function apiRequest(url, options = {}, token = '', onToast = null) {
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  try {
    const res = await fetch(url, { ...options, headers });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'Request failed');
    }
    return data;
  } catch (err) {
    if (onToast) {
      onToast(err.message, 'error');
    }
    throw err;
  }
}
