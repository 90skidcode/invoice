import { api } from './api-client';

/**
 * Fetch the standalone invoice HTML (with auth) and open it in a new tab as a
 * blob URL. The HTML is self-contained (inline CSS + QR SVGs), so it prints and
 * shares offline. Browser navigation can't send the bearer header, hence the
 * auth-fetch-then-blob approach.
 */
export async function openInvoicePrint(
  invoiceId: string,
  paper: 'a4' | 'thermal80' | 'thermal58' = 'a4',
): Promise<void> {
  const html = await api.getText(`/invoices/${invoiceId}/print?paper=${paper}`);
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const win = window.open(url, '_blank');
  if (!win) {
    // Popup blocked — fall back to same-tab navigation.
    window.location.href = url;
  }
  // Revoke after a delay so the new tab has time to load.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
