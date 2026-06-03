import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download, Edit2, EyeOff, Image as ImageIcon, Plus, Search, Star, Trash2, Upload, Utensils,
} from 'lucide-react';
import type { FoodType } from '@foodcourt/shared';
import { cls, inr } from '@foodcourt/shared';
import { PageHeader } from '../components/PageHeader';
import { Toggle } from '../components/Toggle';
import { Drawer } from '../components/Drawer';
import { useTenant } from '../lib/tenant';
import {
  listMenuItems, listCategories, createMenuItem, updateMenuItem,
  deleteMenuItem, setMenuItemInStock, createCategory, createCategoriesBulk, seedDefaultMenu,
  createMenuVariants, createMenuModifiers,
  type MenuItemRow, type CategoryRow,
} from '../lib/api';

export default function MenuItems() {
  const { branch } = useTenant();
  const restaurantId = branch?.id ?? '';
  const [items, setItems] = useState<MenuItemRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCat, setActiveCat] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<MenuItemRow | null>(null);
  const [addingCategories, setAddingCategories] = useState(false);

  const refresh = useCallback(async () => {
    if (!restaurantId) { setItems([]); setCategories([]); setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const [its, cats] = await Promise.all([
        listMenuItems(restaurantId),
        listCategories(restaurantId),
      ]);
      setItems(its);
      setCategories(cats);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load menu');
    } finally {
      setLoading(false);
    }
  }, [restaurantId]);

  useEffect(() => { refresh(); }, [refresh]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter(i => {
      if (activeCat !== 'all' && i.category_id !== activeCat) return false;
      if (q && !i.name.toLowerCase().includes(q) && !(i.description?.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [items, activeCat, query]);

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    categories.forEach(c => m.set(c.id, 0));
    items.forEach(i => m.set(i.category_id, (m.get(i.category_id) ?? 0) + 1));
    return m;
  }, [items, categories]);

  const toggleStock = async (id: string, v: boolean) => {
    setItems(is => is.map(i => i.id === id ? { ...i, in_stock: v } : i));
    try { await setMenuItemInStock(id, v); }
    catch (e) { console.error(e); refresh(); }
  };

  const remove = async (id: string) => {
    if (!confirm('Delete this item? This cannot be undone.')) return;
    const prev = items;
    setItems(is => is.filter(i => i.id !== id));
    try { await deleteMenuItem(id); }
    catch (e: any) { alert(e.message ?? 'Delete failed'); setItems(prev); }
  };

  const outOfStock = items.filter(i => !i.in_stock).length;

  // ──────────────────────────────────────────────────────────────────
  // CSV import / export
  // ──────────────────────────────────────────────────────────────────
  // Column header used by the export + sample + import. Keep these in sync.
  // Matches the Nakshatra-style sheet most Indian F&B operators already use,
  // so they can copy-paste rows from Google Sheets without rearranging.
  const TEMPLATE_HEADER = [
    'Sr.no', 'Item Name', 'Image', 'description', 'Category Name', 'veg/non-veg',
    'Slash/strike price', 'Actual Price including Parcel Charges', 'Parcel Charges',
    'Breakfast/lunch/dinner', 'Tags', 'Additional tags',
    'add-ons', 'add-ons price', 'half/full', 'half price', 'full price', 'Rating',
  ];

  const exportCsv = () => {
    const rows: string[][] = [TEMPLATE_HEADER];
    items.forEach((it, i) => {
      rows.push([
        String(i + 1),
        it.name,
        it.image_url ?? '',
        it.description ?? '',
        categories.find(c => c.id === it.category_id)?.name ?? '',
        it.food_type === 'non_veg' ? 'non-veg' : (it.food_type === 'egg' ? 'egg' : 'veg'),
        '',                                       // strike_price not on listMenuItems shape today
        String(it.base_price),
        '',                                       // parcel_charge — same as above
        '',                                       // meal_time
        it.is_recommended ? 'recommended' : '',   // legacy mapping into Tags
        it.is_bestseller  ? 'best-seller' : '',   // legacy mapping into Additional tags
        '', '', '', '', '',                        // add-ons + half/full extras
        String(it.rating ?? ''),
      ]);
    });
    const csv = rows.map(r => r.map(csvEscape).join(',')).join('\n');
    triggerDownload(csv, `menu-${restaurantId}-${new Date().toISOString().slice(0, 10)}.csv`);
  };

  const downloadSampleCsv = () => {
    const sample: string[][] = [
      TEMPLATE_HEADER,
      // The single sample row from the user's sheet, plus a few illustrative
      // rows showing tags, add-ons, and half/full variants so owners can see
      // each column in action.
      ['1', 'Triple Chicken Rice', '', '', 'chinese', 'non-veg',
        '180', '140', '10', 'dinner',
        '', 'best-seller',
        '', '', '', '', '', '4.8'],
      ['2', 'Paneer Tikka', 'https://images.example.com/paneer.jpg',
        'Smoky cottage cheese cubes, tandoor-grilled', 'Starters', 'veg',
        '320', '280', '0', 'lunch',
        'recommended', 'chef-special',
        'Extra Cheese; Extra Sauce', '30; 20', '', '', '', '4.6'],
      ['3', 'Butter Chicken', '', 'Creamy tomato gravy with charred chicken',
        'Mains', 'non-veg',
        '', '320', '15', 'dinner',
        'recommended,popular', 'best-seller',
        '', '', 'yes', '220', '320', '4.7'],
      ['4', 'Masala Chai', '', 'Traditional spiced milk tea', 'Beverages', 'veg',
        '80', '60', '0', 'all_day',
        '', '', '', '', '', '', '', '4.5'],
    ];
    const csv = sample.map(r => r.map(csvEscape).join(',')).join('\n');
    triggerDownload(csv, 'menu-template.csv');
  };

  const handleImportFile = async (file: File) => {
    if (!restaurantId) { alert('Pick a branch first.'); return; }
    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) { alert('CSV is empty or missing rows.'); return; }
    const header = rows[0].map(h => h.trim().toLowerCase());

    // Resolve a column by trying each candidate header. The template uses
    // human-friendly names ("Item Name"), but we also accept the older v1
    // names ("name", "price") so existing CSVs still import.
    const col = (...candidates: string[]) => {
      for (const cand of candidates) {
        const i = header.indexOf(cand.toLowerCase());
        if (i >= 0) return i;
      }
      return -1;
    };
    const ix = {
      name:        col('item name', 'name'),
      image:       col('image', 'image_url'),
      description: col('description'),
      category:    col('category name', 'category'),
      food_type:   col('veg/non-veg', 'food_type'),
      strike:      col('slash/strike price', 'strike_price'),
      price:       col('actual price including parcel charges', 'price', 'actual price'),
      parcel:      col('parcel charges', 'parcel_charge'),
      meal_time:   col('breakfast/lunch/dinner', 'meal_time'),
      tags:        col('tags'),
      extra_tags:  col('additional tags'),
      addons:      col('add-ons', 'addons'),
      addons_p:    col('add-ons price', 'addons_price'),
      half_full:   col('half/full'),
      half_price:  col('half price'),
      full_price:  col('full price'),
      rating:      col('rating'),
    };

    if (ix.name < 0 || ix.category < 0 || ix.price < 0) {
      alert('CSV must include at least: Item Name, Category Name, and Actual Price (or legacy name/category/price). Download the sample to see the format.');
      return;
    }

    // Build category lookup (case-insensitive). Auto-create missing ones.
    const catMap = new Map<string, string>(); // lowercased name → id
    categories.forEach(c => catMap.set(c.name.toLowerCase(), c.id));

    // Tag values we recognise as boolean flags on menu_items. Everything else
    // ends up in the tags[] column for free-form display.
    const KNOWN_FLAGS = {
      bestseller:  new Set(['best-seller', 'bestseller', 'best seller']),
      recommended: new Set(['recommended', 'rec', 'recommend']),
    };

    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 1; i < rows.length; i++) {
      const r = rows[i];
      const name = (r[ix.name] ?? '').trim();
      if (!name) { skipped++; continue; }

      // 1. Category — auto-create if missing.
      const catName = ix.category >= 0 ? (r[ix.category] ?? '').trim() : '';
      let catId = catMap.get(catName.toLowerCase());
      if (!catId) {
        try {
          const newCat = await createCategory(restaurantId, catName || 'Uncategorized');
          catMap.set(newCat.name.toLowerCase(), newCat.id);
          catId = newCat.id;
        } catch (e: any) {
          errors.push(`Row ${i + 1}: couldn't create category "${catName}" — ${e.message}`);
          skipped++; continue;
        }
      }

      // 2. Prices — Actual Price wins as the canonical base_price. If only
      //    the full_price is set, we use that. Half/full split out as variants.
      const priceRaw = (r[ix.price] ?? '').toString().trim();
      const fullPriceRaw = ix.full_price >= 0 ? (r[ix.full_price] ?? '').toString().trim() : '';
      const halfPriceRaw = ix.half_price >= 0 ? (r[ix.half_price] ?? '').toString().trim() : '';
      const basePrice = Number(priceRaw || fullPriceRaw || 0);
      const strikePrice = ix.strike >= 0 && r[ix.strike] ? Number(r[ix.strike]) : null;
      const parcelCharge = ix.parcel >= 0 && r[ix.parcel] ? Number(r[ix.parcel]) : 0;

      // 3. Food type — accepts veg/non-veg/egg variants.
      const foodTypeRaw = (r[ix.food_type] ?? 'veg').trim().toLowerCase();
      const foodType: 'veg' | 'non_veg' | 'egg' =
        foodTypeRaw === 'non_veg' || foodTypeRaw === 'non-veg' || foodTypeRaw === 'nonveg' || foodTypeRaw === 'non veg' ? 'non_veg' :
        foodTypeRaw === 'egg' ? 'egg' : 'veg';

      // 4. Tags — split both "Tags" and "Additional tags" columns by comma,
      //    extract known booleans, keep the rest as text tags.
      const tagCellsRaw: string[] = [];
      if (ix.tags       >= 0) tagCellsRaw.push((r[ix.tags]       ?? '').toString());
      if (ix.extra_tags >= 0) tagCellsRaw.push((r[ix.extra_tags] ?? '').toString());
      const rawTags = tagCellsRaw
        .flatMap(c => c.split(/[,;]/))
        .map(t => t.trim().toLowerCase())
        .filter(Boolean);
      const isBestseller  = rawTags.some(t => KNOWN_FLAGS.bestseller.has(t));
      const isRecommended = rawTags.some(t => KNOWN_FLAGS.recommended.has(t));
      const freeformTags = rawTags.filter(t =>
        !KNOWN_FLAGS.bestseller.has(t) && !KNOWN_FLAGS.recommended.has(t),
      );

      // 5. Rating.
      const ratingRaw = ix.rating >= 0 ? Number((r[ix.rating] ?? '').toString().trim()) : NaN;

      // 6. Insert the menu_item row first so we have its id for variants/modifiers.
      let createdItem;
      try {
        createdItem = await createMenuItem(
          {
            restaurant_id: restaurantId,
            category_id: catId,
            name,
            description: ix.description >= 0 ? (r[ix.description] ?? '').trim() || null : null,
            image_url:   ix.image       >= 0 ? (r[ix.image]       ?? '').trim() || null : null,
            base_price:  isNaN(basePrice) ? 0 : basePrice,
            food_type:   foodType,
            is_bestseller:  isBestseller,
            is_recommended: isRecommended,
            in_stock: true,
            sort_order: i,
          },
          {
            strike_price:  isNaN(Number(strikePrice)) || strikePrice === null ? null : Number(strikePrice),
            parcel_charge: isNaN(parcelCharge) ? 0 : parcelCharge,
            meal_time:     ix.meal_time >= 0 ? ((r[ix.meal_time] ?? '').toString().trim().toLowerCase() || null) : null,
            tags:          freeformTags,
            rating:        isNaN(ratingRaw) ? undefined : Math.max(0, Math.min(5, ratingRaw)),
          },
        );
      } catch (e: any) {
        // Extras columns might be missing in DB if the migration hasn't been run yet —
        // retry without them so the import still succeeds with core fields.
        if (/strike_price|parcel_charge|meal_time|tags/.test(e?.message ?? '')) {
          try {
            createdItem = await createMenuItem({
              restaurant_id: restaurantId,
              category_id: catId,
              name,
              description: ix.description >= 0 ? (r[ix.description] ?? '').trim() || null : null,
              image_url:   ix.image       >= 0 ? (r[ix.image]       ?? '').trim() || null : null,
              base_price:  isNaN(basePrice) ? 0 : basePrice,
              food_type:   foodType,
              is_bestseller:  isBestseller,
              is_recommended: isRecommended,
              in_stock: true,
              sort_order: i,
            });
            if (i === 1) errors.push('Note: extras columns (strike_price, parcel_charge, meal_time, tags) skipped. Run supabase/add_menu_template_columns.sql to enable them.');
          } catch (retryErr: any) {
            errors.push(`Row ${i + 1} (${name}): ${retryErr.message}`);
            skipped++; continue;
          }
        } else {
          errors.push(`Row ${i + 1} (${name}): ${e.message}`);
          skipped++; continue;
        }
      }

      // 7. Half/Full variants — only insert when at least one of the two prices is set.
      const halfFullFlag = ix.half_full >= 0 ? (r[ix.half_full] ?? '').toString().trim().toLowerCase() : '';
      const wantsVariants = halfFullFlag === 'yes' || halfFullFlag === 'true' ||
                            (!!halfPriceRaw && halfPriceRaw !== '0') ||
                            (!!fullPriceRaw && fullPriceRaw !== '0');
      if (wantsVariants && createdItem) {
        const variants: Array<{ name: string; price: number }> = [];
        if (halfPriceRaw && Number(halfPriceRaw) > 0) variants.push({ name: 'Half', price: Number(halfPriceRaw) });
        if (fullPriceRaw && Number(fullPriceRaw) > 0) variants.push({ name: 'Full', price: Number(fullPriceRaw) });
        try { await createMenuVariants(createdItem.id, variants); }
        catch (e: any) { errors.push(`Row ${i + 1} (${name}): variants failed — ${e.message}`); }
      }

      // 8. Add-on modifiers — semicolon-separated names + prices.
      //    "Extra Cheese; Extra Sauce" + "30; 20" → 2 modifier rows.
      const addonNamesRaw  = ix.addons    >= 0 ? (r[ix.addons]    ?? '').toString() : '';
      const addonPricesRaw = ix.addons_p  >= 0 ? (r[ix.addons_p]  ?? '').toString() : '';
      if (addonNamesRaw.trim() && createdItem) {
        const names  = addonNamesRaw.split(';').map(s => s.trim()).filter(Boolean);
        const prices = addonPricesRaw.split(';').map(s => Number(s.trim()) || 0);
        const modifiers = names.map((n, idx) => ({ name: n, price: prices[idx] ?? 0 }));
        try { await createMenuModifiers(createdItem.id, modifiers); }
        catch (e: any) { errors.push(`Row ${i + 1} (${name}): add-ons failed — ${e.message}`); }
      }

      created++;
    }

    refresh();
    const msg =
      `Imported ${created} item${created === 1 ? '' : 's'}.` +
      (skipped ? ` Skipped ${skipped}.` : '') +
      (errors.length ? `\n\nNotes:\n${errors.slice(0, 6).join('\n')}${errors.length > 6 ? `\n…and ${errors.length - 6} more` : ''}` : '');
    alert(msg);
  };

  const newItemTemplate = (): MenuItemRow => ({
    id: 'new-' + Math.random().toString(36).slice(2, 8),
    restaurant_id: restaurantId,
    category_id: categories[0]?.id ?? '',
    name: '',
    description: '',
    image_url: null,
    base_price: 0,
    food_type: 'veg',
    rating: 0,
    rating_count: 0,
    is_bestseller: false,
    is_recommended: false,
    in_stock: true,
    sort_order: items.length,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Menu Items"
        subtitle={loading ? 'Loading…' : `${items.length} items · ${outOfStock} out of stock · ${categories.length} categories`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setAddingCategories(true)}
              disabled={!restaurantId}
              className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              title="Add one or paste many categories at once"
            >
              <Plus className="size-4" /> Add categories
            </button>

            <label className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer">
              <Upload className="size-4" /> Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                onChange={async e => {
                  const f = e.target.files?.[0];
                  e.currentTarget.value = ''; // reset so re-selecting same file fires onChange
                  if (f) await handleImportFile(f);
                }}
              />
            </label>

            <button
              onClick={downloadSampleCsv}
              className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              title="Download a sample CSV with the expected columns"
            >
              <Download className="size-3.5" /> Sample
            </button>

            <button
              onClick={exportCsv}
              disabled={!items.length}
              className="inline-flex items-center gap-2 rounded-full bg-white border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
              title="Export current menu as CSV"
            >
              <Download className="size-3.5" /> Export
            </button>

            <button
              onClick={() => {
                if (!categories.length) { alert('Create a category first.'); return; }
                setEditing(newItemTemplate());
              }}
              disabled={!restaurantId}
              className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
            >
              <Plus className="size-4" /> Add item
            </button>
          </div>
        }
      />

      {!restaurantId && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-sm text-amber-900">
          Pick a single branch in the sidebar to manage its menu.
        </div>
      )}

      {restaurantId && !loading && categories.length === 0 && (
        <div className="rounded-2xl bg-white shadow-card p-8 text-center">
          <Utensils className="size-10 mx-auto text-slate-300" />
          <p className="mt-3 font-semibold text-slate-700">No menu yet</p>
          <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
            Generate a 10-item starter menu (6 categories: Starters, Mains, Breads, Biryani, Desserts, Beverages) to get going instantly. You can edit prices, photos, and add more items later.
          </p>
          <button
            onClick={async () => {
              if (!confirm('Seed a 10-item starter menu? Existing items are kept; only missing ones are added.')) return;
              try { await seedDefaultMenu(restaurantId); refresh(); }
              catch (e: any) { alert(e.message ?? 'Could not seed'); }
            }}
            className="mt-4 inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-5 py-2 text-sm font-semibold hover:bg-brand-700"
          >
            <Plus className="size-4" />
            Seed 10-item starter menu
          </button>
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-sm text-rose-900">{error}</div>
      )}

      <div className="bg-white rounded-2xl shadow-card overflow-hidden">
        <div className="border-b border-slate-100 px-4 pt-3 overflow-x-auto no-scrollbar">
          <div className="flex items-end gap-1">
            <CatTab active={activeCat === 'all'} onClick={() => setActiveCat('all')} label="All" count={items.length} />
            {categories.map(c => (
              <CatTab key={c.id} active={activeCat === c.id} onClick={() => setActiveCat(c.id)} label={c.name} count={counts.get(c.id) ?? 0} />
            ))}
          </div>
        </div>
        <div className="px-4 py-3 flex items-center gap-3 border-b border-slate-100">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search items..."
              className="w-full rounded-full bg-slate-100 pl-10 pr-4 py-2 text-sm outline-none placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-brand-500/20"
            />
          </div>
          <p className="ml-auto text-xs text-slate-500">
            Toggle items to mark as out of stock — change reflects instantly on customer menu.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs font-semibold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-100">
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Category</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3">Rating</th>
                <th className="px-4 py-3">Badges</th>
                <th className="px-4 py-3 text-center">In stock</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filtered.map(it => (
                <tr key={it.id} className={cls('hover:bg-slate-50', !it.in_stock && 'bg-slate-50/50')}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="relative size-12 rounded-lg bg-slate-100 overflow-hidden shrink-0">
                        {it.image_url ? (
                          <img src={it.image_url} alt={it.name} className="size-full object-cover" />
                        ) : (
                          <ImageIcon className="size-5 text-slate-400 absolute inset-0 m-auto" />
                        )}
                        {!it.in_stock && (
                          <span className="absolute inset-0 bg-slate-900/50 grid place-items-center">
                            <EyeOff className="size-4 text-white" />
                          </span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <FoodDotMini type={it.food_type === 'veg' ? 'veg' : 'nonveg'} />
                          <p className={cls('font-semibold truncate', !it.in_stock && 'text-slate-500')}>{it.name}</p>
                        </div>
                        {it.description && (
                          <p className="text-xs text-slate-500 truncate max-w-[280px]">{it.description}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {categories.find(c => c.id === it.category_id)?.name ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {inr(it.base_price)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 text-sm">
                      <Star className="size-3.5 fill-amber-400 text-amber-400" />
                      {it.rating.toFixed(1)}
                      <span className="text-xs text-slate-500">({it.rating_count})</span>
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {it.is_bestseller && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">Bestseller</span>
                      )}
                      {it.is_recommended && (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-brand-700 bg-brand-100 px-1.5 py-0.5 rounded">Rec.</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Toggle checked={it.in_stock} onChange={v => toggleStock(it.id, v)} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => setEditing(it)}
                        className="size-8 grid place-items-center rounded-full hover:bg-slate-100 text-slate-600"
                        title="Edit"
                      >
                        <Edit2 className="size-4" />
                      </button>
                      <button
                        onClick={() => remove(it.id)}
                        className="size-8 grid place-items-center rounded-full hover:bg-rose-50 text-rose-600"
                        title="Delete"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && filtered.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Utensils className="size-8 mx-auto text-slate-300" />
              <p className="mt-2 text-sm">No items match.</p>
            </div>
          )}
        </div>
      </div>

      <ItemEditorDrawer
        item={editing}
        categories={categories}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); refresh(); }}
      />

      <BulkAddCategoriesModal
        open={addingCategories}
        restaurantId={restaurantId}
        existing={categories}
        onClose={() => setAddingCategories(false)}
        onCreated={(newCats) => { setCategories(cs => [...cs, ...newCats]); }}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────
// Bulk-add categories modal. Supports either a single name or
// many at once via newline / comma-separated paste.
// ────────────────────────────────────────────────────────────
function BulkAddCategoriesModal({
  open, restaurantId, existing, onClose, onCreated,
}: {
  open: boolean;
  restaurantId: string;
  existing: CategoryRow[];
  onClose: () => void;
  onCreated: (newCats: CategoryRow[]) => void;
}) {
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ created: number; skipped: string[] } | null>(null);

  // Reset state every time the modal is opened.
  useEffect(() => {
    if (open) { setText(''); setError(null); setResult(null); }
  }, [open]);

  if (!open) return null;

  // Parse: split on newlines AND commas, trim, drop empties.
  const parsed = text
    .split(/[\n,]/)
    .map(s => s.trim())
    .filter(Boolean);

  const existingLower = new Set(existing.map(c => c.name.trim().toLowerCase()));
  const seen = new Set<string>();
  const willCreate: string[] = [];
  const willSkip:   string[] = [];
  parsed.forEach(name => {
    const key = name.toLowerCase();
    if (seen.has(key)) return;          // duplicate inside textarea
    seen.add(key);
    if (existingLower.has(key)) willSkip.push(name);
    else                        willCreate.push(name);
  });

  const submit = async () => {
    if (!willCreate.length) return;
    setSubmitting(true); setError(null);
    try {
      const { created, skipped } = await createCategoriesBulk(restaurantId, willCreate);
      onCreated(created);
      setResult({ created: created.length, skipped });
      setText('');
    } catch (e: any) {
      setError(e?.message ?? 'Failed to create categories');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg">Add categories</h2>
            <p className="text-xs text-slate-500">Type one, or paste many — separated by newlines or commas.</p>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-slate-100 text-slate-500" aria-label="Close">×</button>
        </header>

        <div className="p-6 space-y-4 overflow-y-auto">
          <label className="block">
            <span className="block text-xs font-bold uppercase tracking-widest text-slate-600 mb-1.5">Category names</span>
            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); setResult(null); }}
              placeholder={'Starters\nMains\nBreads\nDesserts\nBeverages\n\n(or paste comma-separated: Starters, Mains, Breads)'}
              rows={8}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 outline-none focus:border-brand-500 font-mono text-sm leading-relaxed"
              autoFocus
            />
          </label>

          {/* Live preview */}
          {parsed.length > 0 && !result && (
            <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 text-xs space-y-2">
              <p className="font-semibold text-slate-700">
                Ready to add <span className="text-emerald-700">{willCreate.length}</span> new
                {willSkip.length ? <> · skipping <span className="text-amber-700">{willSkip.length}</span> already-exists</> : null}
              </p>
              {willCreate.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {willCreate.map(n => (
                    <span key={n} className="inline-flex items-center rounded-md bg-emerald-50 text-emerald-700 px-2 py-0.5 font-semibold">{n}</span>
                  ))}
                </div>
              )}
              {willSkip.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {willSkip.map(n => (
                    <span key={n} className="inline-flex items-center rounded-md bg-amber-50 text-amber-700 px-2 py-0.5 font-semibold">{n}</span>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="rounded-xl bg-rose-50 border border-rose-200 px-3 py-2.5 text-sm text-rose-900">{error}</div>
          )}

          {result && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-900 space-y-1">
              <p className="font-semibold">Created {result.created} categor{result.created === 1 ? 'y' : 'ies'}.</p>
              {result.skipped.length > 0 && (
                <p className="text-xs text-emerald-800/80">Skipped (already exist): {result.skipped.join(', ')}</p>
              )}
            </div>
          )}
        </div>

        <footer className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-700 rounded-full hover:bg-slate-50"
          >
            {result ? 'Done' : 'Cancel'}
          </button>
          <button
            onClick={submit}
            disabled={submitting || willCreate.length === 0}
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 text-white px-4 py-2 text-sm font-semibold hover:bg-brand-700 disabled:opacity-50"
          >
            <Plus className="size-4" />
            {submitting ? 'Creating…' : willCreate.length > 1 ? `Create ${willCreate.length} categories` : 'Create category'}
          </button>
        </footer>
      </div>
    </div>
  );
}

function CatTab({
  active, onClick, label, count,
}: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={cls(
        'px-4 py-3 -mb-px border-b-2 text-sm font-semibold whitespace-nowrap',
        active ? 'border-brand-600 text-brand-700' : 'border-transparent text-slate-500 hover:text-slate-700',
      )}
    >
      {label}
      <span className={cls(
        'ml-2 rounded-full px-2 py-0.5 text-xs font-semibold',
        active ? 'bg-brand-100 text-brand-700' : 'bg-slate-100 text-slate-600',
      )}>
        {count}
      </span>
    </button>
  );
}

function FoodDotMini({ type }: { type: 'veg' | 'nonveg' }) {
  const isVeg = type === 'veg';
  return (
    <span className={cls(
      'size-3.5 border flex items-center justify-center rounded-sm bg-white shrink-0',
      isVeg ? 'border-emerald-600' : 'border-rose-600',
    )}>
      <span className={cls('size-1.5 rounded-full', isVeg ? 'bg-emerald-600' : 'bg-rose-600')} />
    </span>
  );
}

function ItemEditorDrawer({
  item, categories, onClose, onSaved,
}: {
  item: MenuItemRow | null;
  categories: CategoryRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  if (!item) return null;
  return (
    <ItemEditorInner key={item.id} item={item} categories={categories} onClose={onClose} onSaved={onSaved} />
  );
}

function ItemEditorInner({
  item, categories, onClose, onSaved,
}: {
  item: MenuItemRow;
  categories: CategoryRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = item.id.startsWith('new-');
  const [draft, setDraft] = useState<MenuItemRow>(item);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof MenuItemRow>(k: K, v: MenuItemRow[K]) =>
    setDraft(d => ({ ...d, [k]: v }));

  const save = async () => {
    if (!draft.name.trim()) { setErr('Name is required'); return; }
    setSaving(true); setErr(null);
    try {
      if (isNew) {
        await createMenuItem({
          restaurant_id: draft.restaurant_id,
          category_id: draft.category_id,
          name: draft.name,
          description: draft.description,
          image_url: draft.image_url,
          base_price: draft.base_price,
          food_type: draft.food_type,
          is_bestseller: draft.is_bestseller,
          is_recommended: draft.is_recommended,
          in_stock: draft.in_stock,
          sort_order: draft.sort_order,
        });
      } else {
        await updateMenuItem(draft.id, {
          category_id: draft.category_id,
          name: draft.name,
          description: draft.description,
          image_url: draft.image_url,
          base_price: draft.base_price,
          food_type: draft.food_type,
          is_bestseller: draft.is_bestseller,
          is_recommended: draft.is_recommended,
          in_stock: draft.in_stock,
          sort_order: draft.sort_order,
        });
      }
      onSaved();
    } catch (e: any) {
      setErr(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open
      onClose={onClose}
      title={isNew ? 'Add menu item' : draft.name || 'Edit item'}
      subtitle={isNew ? 'Create a new dish that will appear on the customer menu' : undefined}
      width="lg"
      footer={
        <div className="flex items-center justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white rounded-full">
            Cancel
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {saving ? 'Saving…' : isNew ? 'Create item' : 'Save changes'}
          </button>
        </div>
      }
    >
      {err && <div className="mb-3 rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-sm text-rose-900">{err}</div>}
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Name" required>
            <input
              value={draft.name}
              onChange={e => set('name', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
            />
          </Field>
          <Field label="Category">
            <select
              value={draft.category_id}
              onChange={e => set('category_id', e.target.value)}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
            >
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Description">
          <textarea
            value={draft.description ?? ''}
            onChange={e => set('description', e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500 resize-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Price (₹)" required>
            <input
              type="number" value={draft.base_price}
              onChange={e => set('base_price', Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
            />
          </Field>
          <Field label="Sort order">
            <input
              type="number" value={draft.sort_order}
              onChange={e => set('sort_order', Number(e.target.value))}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
            />
          </Field>
        </div>

        <Field label="Food type">
          <div className="inline-flex rounded-full bg-slate-100 p-1">
            {(['veg','non_veg','egg'] as FoodType[]).map(t => (
              <button
                key={t}
                onClick={() => set('food_type', t)}
                className={cls(
                  'px-4 py-1.5 rounded-full text-sm font-semibold capitalize',
                  draft.food_type === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500',
                )}
              >
                {t.replace('_', '-')}
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Image URL">
            <input
              value={draft.image_url ?? ''}
              onChange={e => set('image_url', e.target.value || null)}
              placeholder="https://..."
              className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-brand-500"
            />
          </Field>
          <Field label="Preview">
            {draft.image_url ? (
              <img src={draft.image_url} alt="" className="size-16 rounded-lg object-cover" />
            ) : (
              <div className="size-16 rounded-lg bg-slate-100 grid place-items-center">
                <ImageIcon className="size-5 text-slate-400" />
              </div>
            )}
          </Field>
        </div>

        <section className="bg-slate-50 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-bold">Flags</h3>
          <Toggle checked={draft.in_stock} onChange={v => set('in_stock', v)} label="In stock" description="Customers can order this item" />
          <Toggle checked={draft.is_bestseller} onChange={v => set('is_bestseller', v)} label="Bestseller" description="Show Bestseller badge on customer menu" />
          <Toggle checked={draft.is_recommended} onChange={v => set('is_recommended', v)} label="Recommended" description="Appears in the Recommended row" />
        </section>
      </div>
    </Drawer>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
        {label} {required && <span className="text-rose-500">*</span>}
      </span>
      {children}
    </label>
  );
}

// ─── CSV helpers ─────────────────────────────────────────────────────

function csvEscape(s: string): string {
  if (s == null) return '';
  const v = String(s);
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}

function triggerDownload(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Tiny CSV parser. Handles quoted fields with commas, quoted newlines, and
 * "" escaped quotes. Returns an array of rows; each row is an array of fields.
 * Trailing empty rows are dropped.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  // Normalize CRLF → LF
  const t = text.replace(/\r\n?/g, '\n');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += c;
      }
    } else {
      if (c === '"') { inQuotes = true; }
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += c;
    }
  }
  // Flush final field/row
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    rows.push(row);
  }
  // Drop trailing empty rows
  while (rows.length && rows[rows.length - 1].every(f => f === '')) rows.pop();
  return rows;
}
