// ════════════════════════════════════════════════════════════════════
// Thermal-receipt KOT printer.
//
// Used from:
//   • KDS (Kitchen Display) — reprint a specific KOT ticket
//   • Orders page          — reprint the KOT for any order in the list
//
// Both pages have slightly different in-memory shapes for the same data
// (KotTicketWithOrder vs AdminOrder), so this helper takes a normalised
// input and renders an 80mm thermal receipt with the browser's print API.
//
// Print strategy: try a popup first, fall back to a hidden iframe in the
// current window. The iframe path works even when popups are blocked
// (which they often are when print is triggered from a list-row click).
// ════════════════════════════════════════════════════════════════════

export interface KotPrintInput {
  ticket_no: string;
  order_code: string | null;
  order_type: 'dine_in' | 'takeaway' | 'delivery' | string | null;
  table_label: string | null;
  customer_name: string | null;
  created_at: string;
  reprint_count?: number;
  items: Array<{
    name: string;
    variant: string | null;
    modifiers: string[];
    qty: number;
    notes?: string | null;
  }>;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function typeLabel(t: KotPrintInput['order_type'], tableLabel: string | null): string {
  if (t === 'dine_in') return tableLabel ?? 'Dine-in';
  if (t === 'delivery') return 'DELIVERY';
  return 'Takeaway';
}

export function printKot(input: KotPrintInput): void {
  const html = `<!doctype html>
<html><head><title>${escapeHtml(input.ticket_no)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm }
  body { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; color: #000; }
  h1 { font-size: 18px; margin: 0 0 4px; text-align: center; letter-spacing: 1px }
  .meta { text-align: center; font-size: 11px; margin-bottom: 6px; line-height: 1.4 }
  hr { border: 0; border-top: 1px dashed #000; margin: 8px 0 }
  .row { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0 }
  .qty { font-weight: 700; flex: 0 0 28px }
  .name { flex: 1; }
  .note { padding-left: 32px; font-size: 11px; font-style: italic }
  .footer { margin-top: 8px; text-align: center; font-size: 11px; opacity: .8 }
</style></head>
<body>
  <h1>${escapeHtml(input.ticket_no)}</h1>
  <div class="meta">
    ${input.order_code ? escapeHtml(input.order_code) + ' · ' : ''}${escapeHtml(typeLabel(input.order_type, input.table_label))}
    ${input.customer_name ? '<br>' + escapeHtml(input.customer_name) : ''}
    <br>${new Date(input.created_at).toLocaleString('en-IN')}
  </div>
  <hr>
  ${input.items.map(it => `
    <div class="row">
      <span class="qty">×${it.qty}</span>
      <span class="name">
        <strong>${escapeHtml(it.name)}</strong>
        ${it.variant ? ' · ' + escapeHtml(it.variant) : ''}
      </span>
    </div>
    ${(it.modifiers ?? []).length ? `<div class="note">+ ${it.modifiers.map(escapeHtml).join(', ')}</div>` : ''}
    ${it.notes ? `<div class="note">"${escapeHtml(it.notes)}"</div>` : ''}
  `).join('')}
  <hr>
  <div class="footer">
    ${input.items.reduce((s, it) => s + it.qty, 0)} items total
    ${(input.reprint_count ?? 0) > 0 ? `<br>REPRINT #${(input.reprint_count ?? 0) + 1}` : ''}
  </div>
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 200) }</script>
</body></html>`;

  // Strategy 1: popup. Cleanest UX but popup-blockers in Chrome/Edge/Safari
  // often kill these silently when triggered from a list-row click.
  let popupOk = false;
  try {
    const w = window.open('', '_blank', 'width=380,height=600');
    if (w) {
      w.document.open();
      w.document.write(html);
      w.document.close();
      popupOk = true;
    }
  } catch {
    /* popup blocked — fall through */
  }
  if (popupOk) return;

  // Strategy 2: hidden iframe. Works around popup blockers entirely.
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);

  const cleanup = () => { setTimeout(() => frame.remove(), 1500); };
  frame.onload = () => {
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch (e) {
      console.warn('iframe print failed', e);
      alert('Could not open the print dialog. Allow popups for this site to enable KOT printing.');
    } finally {
      cleanup();
    }
  };
  const doc = frame.contentDocument;
  if (!doc) { alert('Print not supported in this browser.'); frame.remove(); return; }
  doc.open();
  doc.write(html);
  doc.close();
}
