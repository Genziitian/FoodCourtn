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
  customer_phone?: string | null;
  created_at: string;
  reprint_count?: number;
  items: Array<{
    name: string;
    variant: string | null;
    modifiers: string[];
    qty: number;
    notes?: string | null;
    unit_price?: number | null;
    line_total?: number | null;
  }>;
  /** Branding header — restaurant name + phone + address + optional logo. */
  restaurant?: {
    name?: string | null;
    phone?: string | null;
    address?: string | null;
    logo_url?: string | null;
    gstin?: string | null;
  };
  /** Optional totals — when present, the receipt shows a price column + bill summary. */
  totals?: {
    subtotal?: number | null;
    tax?: number | null;
    service_charge?: number | null;
    discount?: number | null;
    delivery_fee?: number | null;
    packing_charge?: number | null;
    total?: number | null;
    payment_status?: string | null;
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function typeLabel(t: KotPrintInput['order_type'], tableLabel: string | null): string {
  if (t === 'dine_in') return tableLabel ?? 'Dine-in';
  if (t === 'delivery') return 'DELIVERY';
  return 'Takeaway';
}

function inr(n: number | null | undefined): string {
  if (n == null || isNaN(Number(n))) return '';
  return '₹' + Number(n).toFixed(2);
}

export function printKot(input: KotPrintInput): void {
  const r = input.restaurant ?? {};
  const hasPrices = !!input.totals || input.items.some(it => it.unit_price != null);

  // Branded header — restaurant name + phone + address, plus an optional
  // logo image. Falls back gracefully if no branding info is provided.
  const headerHtml = `
    ${r.logo_url ? `<div class="logo"><img src="${escapeHtml(r.logo_url)}" alt="" onerror="this.style.display='none'"/></div>` : ''}
    ${r.name ? `<h1 class="brand">${escapeHtml(r.name)}</h1>` : ''}
    ${r.address ? `<div class="addr">${escapeHtml(r.address)}</div>` : ''}
    ${r.phone   ? `<div class="addr">Tel: ${escapeHtml(r.phone)}</div>` : ''}
    ${r.gstin   ? `<div class="addr">GSTIN: ${escapeHtml(r.gstin)}</div>` : ''}
  `;

  const itemRowsHtml = input.items.map(it => `
    <tr class="item">
      <td class="qty">×${it.qty}</td>
      <td class="name">
        <strong>${escapeHtml(it.name)}</strong>${it.variant ? ' · ' + escapeHtml(it.variant) : ''}
        ${(it.modifiers ?? []).length ? `<div class="note">+ ${it.modifiers.map(escapeHtml).join(', ')}</div>` : ''}
        ${it.notes ? `<div class="note">"${escapeHtml(it.notes)}"</div>` : ''}
      </td>
      ${hasPrices ? `<td class="price">${inr(it.line_total ?? (it.unit_price != null ? Number(it.unit_price) * it.qty : null))}</td>` : ''}
    </tr>
  `).join('');

  const totals = input.totals ?? null;
  const summaryHtml = totals ? `
    <hr>
    <table class="summary">
      ${totals.subtotal       != null ? `<tr><td>Item Total</td><td class="r">${inr(totals.subtotal)}</td></tr>` : ''}
      ${(totals.tax ?? 0) > 0           ? `<tr><td>Tax</td><td class="r">${inr(totals.tax)}</td></tr>` : ''}
      ${(totals.service_charge ?? 0) > 0 ? `<tr><td>Service</td><td class="r">${inr(totals.service_charge)}</td></tr>` : ''}
      ${(totals.packing_charge ?? 0) > 0 ? `<tr><td>Parcel</td><td class="r">${inr(totals.packing_charge)}</td></tr>` : ''}
      ${(totals.delivery_fee   ?? 0) > 0 ? `<tr><td>Delivery</td><td class="r">${inr(totals.delivery_fee)}</td></tr>` : ''}
      ${(totals.discount       ?? 0) > 0 ? `<tr><td>Discount</td><td class="r">- ${inr(totals.discount)}</td></tr>` : ''}
      ${totals.total != null ? `<tr class="grand"><td>Total</td><td class="r">${inr(totals.total)}</td></tr>` : ''}
      ${totals.payment_status ? `<tr><td colspan="2" class="pay">Payment: ${escapeHtml(totals.payment_status)}</td></tr>` : ''}
    </table>
  ` : '';

  const html = `<!doctype html>
<html><head>
<meta charset="utf-8">
<title>${escapeHtml(r.name ?? 'Receipt')} · ${escapeHtml(input.ticket_no)}</title>
<style>
  @page { size: 80mm auto; margin: 4mm }
  * { box-sizing: border-box }
  body { font-family: 'Segoe UI', system-ui, sans-serif; font-size: 12px; color: #000; margin: 0; padding: 0; }
  .center { text-align: center }
  .logo { text-align: center; margin-bottom: 4px }
  .logo img { max-height: 48px; max-width: 100% }
  h1.brand { font-size: 18px; margin: 0 0 2px; text-align: center; font-weight: 800; letter-spacing: 0.5px }
  .addr { text-align: center; font-size: 11px; color: #333; line-height: 1.4 }
  .ticket { text-align: center; font-size: 16px; font-weight: 800; margin-top: 8px; letter-spacing: 1px }
  .meta { text-align: center; font-size: 11px; margin-bottom: 6px; line-height: 1.4; color: #333 }
  hr { border: 0; border-top: 1px dashed #000; margin: 8px 0 }
  table { width: 100%; border-collapse: collapse; }
  table.items { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12px; }
  table.items tr.item td { vertical-align: top; padding: 2px 0; }
  table.items td.qty { width: 28px; font-weight: 700 }
  table.items td.price { width: 60px; text-align: right; font-weight: 700; white-space: nowrap }
  table.items .note { padding-left: 0; font-size: 11px; font-style: italic; color: #444 }
  table.summary td { padding: 2px 0; font-size: 12px }
  table.summary td.r { text-align: right; font-variant-numeric: tabular-nums }
  table.summary tr.grand td { padding-top: 6px; font-size: 14px; font-weight: 800; border-top: 1px solid #000 }
  table.summary tr td.pay { padding-top: 8px; text-align: center; font-style: italic; color: #333 }
  .footer { margin-top: 10px; text-align: center; font-size: 11px; color: #444 }
  .reprint { color: #c00; font-weight: 800; text-transform: uppercase }
</style>
</head>
<body>
  ${headerHtml}
  <div class="ticket">${escapeHtml(input.ticket_no)}</div>
  <div class="meta">
    ${input.order_code ? escapeHtml(input.order_code) + ' · ' : ''}${escapeHtml(typeLabel(input.order_type, input.table_label))}
    ${input.customer_name ? '<br>' + escapeHtml(input.customer_name) : ''}
    ${input.customer_phone ? ' · ' + escapeHtml(input.customer_phone) : ''}
    <br>${new Date(input.created_at).toLocaleString('en-IN')}
  </div>
  <hr>
  <table class="items">${itemRowsHtml}</table>
  ${summaryHtml}
  <div class="footer">
    ${input.items.reduce((s, it) => s + it.qty, 0)} item${input.items.length === 1 ? '' : 's'} total
    ${(input.reprint_count ?? 0) > 0 ? `<br><span class="reprint">REPRINT #${(input.reprint_count ?? 0) + 1}</span>` : ''}
    <br><br>Thank you${r.name ? ' for visiting ' + escapeHtml(r.name) : ''}.
  </div>
</body></html>`;

  // Single reliable path: hidden iframe in the current document.
  //
  // Why iframe instead of `window.open`:
  //  • Popup blockers in Chrome/Edge/Safari frequently kill `window.open`
  //    without warning, especially when the print is triggered from a
  //    list-row click (the heuristic sees it as a "second" interaction).
  //  • The previous implementation tried popup first, then iframe — but
  //    when the popup opened in the background and then a SECOND print
  //    dialog raced from the inner `<script>onload</script>`, Chrome
  //    swallowed both. Always-iframe avoids that race.
  //
  // The iframe writes the HTML, waits for it to load, then calls
  // `contentWindow.print()` — one print() call, deterministic timing.
  const frame = document.createElement('iframe');
  frame.style.position = 'fixed';
  frame.style.right = '0';
  frame.style.bottom = '0';
  frame.style.width = '0';
  frame.style.height = '0';
  frame.style.border = '0';
  frame.setAttribute('aria-hidden', 'true');
  document.body.appendChild(frame);

  let printed = false;
  const cleanup = () => {
    // Keep the frame alive briefly so the print dialog has time to capture
    // its document; some browsers (Safari especially) abort an in-flight
    // print if the iframe is removed too early.
    setTimeout(() => { try { frame.remove(); } catch { /* ignore */ } }, 2000);
  };

  const tryPrint = () => {
    if (printed) return;
    printed = true;
    try {
      frame.contentWindow?.focus();
      frame.contentWindow?.print();
    } catch (e) {
      console.warn('iframe print failed', e);
      alert('Could not open the print dialog. Try printing from your browser menu (Ctrl+P / Cmd+P) instead.');
    } finally {
      cleanup();
    }
  };

  frame.onload = tryPrint;

  const doc = frame.contentDocument;
  if (!doc) {
    alert('Printing isn\'t supported in this browser tab. Try opening the admin in Chrome/Edge.');
    frame.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  // Safety net: some browsers don't fire `onload` for `document.write`-ed
  // content. If we don't get an onload within 600ms, force the print
  // anyway — the document is already in the iframe.
  setTimeout(tryPrint, 600);
}
