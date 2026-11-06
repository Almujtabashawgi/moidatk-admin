'use strict';

// لوحة إدارة معداتك. المفتاح ده عام: الصلاحيات في قواعد قاعدة البيانات، وبتحتاج رمز التحقق.
// الـ secret key ما يدخل هنا أبداً.
const SUPABASE_URL = 'https://vcmhfxxojenolbnynowg.supabase.co';
const SUPABASE_KEY = 'sb_publishable_Vs7SCwC7jLvOAQrZRTZwvg_QVYkWwKA';
const PHOTOS_URL = `${SUPABASE_URL}/storage/v1/object/public/listing-photos/`;

let renewing = null;

/** طلبات متزامنة بتجدّد الجلسة مرة واحدة. */
function renewSession() {
  renewing ??= db.auth.refreshSession().finally(() => { renewing = null; });
  return renewing;
}

/**
 * المكتبة بتجدّد الجلسة حسب ساعة الجهاز. لو الساعة متأخرة، الجلسة بتنتهي في الخادم
 * قبل ما المكتبة تحس، فبنجدّدها هنا لما الخادم يرفض، ونعيد الطلب مرة واحدة.
 */
async function fetchWithRenewal(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status !== 401 || String(url).includes('/auth/v1/')) return response;

  const body = await response.clone().json().catch(() => null);
  if (!/jwt expired/i.test(body?.message ?? '')) return response;

  const { data, error } = await renewSession();
  if (error || !data.session) return response;

  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${data.session.access_token}`);
  return fetch(url, { ...options, headers });
}

const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { global: { fetch: fetchWithRenewal } });
const app = document.getElementById('app');

// ---------------------------------------------------------------- أدوات

/**
 * بيبني عناصر الصفحة. كل نص بيدخل كنص عادي، عشان أي حاجة كتبها مستخدم
 * (وصف، اسم) ما تتنفّذ ككود جوة صفحة المدير. ما تستعمل innerHTML هنا.
 */
function h(tag, props = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) element.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'class') element.className = value;
    else if (key === 'value') element.value = value;
    else element.setAttribute(key, value === true ? '' : value);
  }
  element.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return element;
}

function show(...nodes) {
  app.replaceChildren(...nodes);
}

let toastTimer;
function toast(message) {
  const element = document.getElementById('toast');
  element.textContent = message;
  element.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { element.hidden = true; }, 4000);
}

/** بيرجّع data، وبيرمي الخطأ لو الطلب فشل. */
async function must(request) {
  const { data, error } = await request;
  if (error) throw error;
  return data;
}

/** تعديل لازم يلمس صف واحد على الأقل، عشان رفض الصلاحيات ما يمر ساكت. */
async function mustUpdate(request, keyColumn = 'id') {
  const rows = await must(request.select(keyColumn));
  if (!rows || rows.length === 0) throw new Error('ما عندك صلاحية للتعديل ده');
  return rows;
}

function failed(error) {
  console.error(error);
  toast(`ما نجحت العملية: ${error.message || error}`);
}

const number = new Intl.NumberFormat('en');
const date = new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' });

const formatPrice = (amount, currency) =>
  (currency === 'usd' ? `$${number.format(amount)}` : `${number.format(amount)} ج.س`);

const UNITS = { day: 'اليوم', month: 'الشهر', bag: 'الجوال', ton: 'الطن', kg: 'الكيلو', liter: 'اللتر', piece: 'القطعة', meter: 'المتر' };

const priceLine = (amount, currency, unit) =>
  (unit ? `${formatPrice(amount, currency)} / ${UNITS[unit]}` : formatPrice(amount, currency));

const dealLabel = (deal) => (deal === 'sale' ? 'بيع' : 'إيجار');

const photoUrl = (path) => PHOTOS_URL + path.split('/').map(encodeURIComponent).join('/');

// ---------------------------------------------------------------- الدخول

function brand() {
  return h('div', { class: 'brand' }, h('img', { src: 'logo.png', alt: '' }), 'معداتك · لوحة التحكم');
}

function authPage(title, hint, ...content) {
  return h('div', { class: 'auth-page' },
    h('div', { class: 'auth-card' },
      brand(),
      h('h1', {}, title),
      h('p', { class: 'hint' }, hint),
      ...content));
}

function showLogin() {
  const email = h('input', { type: 'email', class: 'ltr', autocomplete: 'username', required: true });
  const password = h('input', { type: 'password', autocomplete: 'current-password', required: true });
  const error = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'دخول');

  const form = h('form', {
    class: 'auth-card',
    style: 'padding:0',
    onSubmit: async (event) => {
      event.preventDefault();
      submit.disabled = true;
      error.textContent = '';
      const { error: failure } = await db.auth.signInWithPassword({
        email: email.value.trim(),
        password: password.value,
      });
      submit.disabled = false;
      if (failure) {
        error.textContent = 'الإيميل أو كلمة السر غلط.';
        return;
      }
      route();
    },
  },
    h('label', { class: 'field' }, 'الإيميل', email),
    h('label', { class: 'field' }, 'كلمة السر', password),
    error,
    submit);

  show(authPage('دخول الإدارة', 'للمدير والمشرفين بس. الصفحة دي ما بتظهر في التطبيق.', form,
    h('p', { class: 'hint' }, 'ما في تسجيل جديد من هنا.')));
}

function codeForm(onCode) {
  const code = h('input', {
    class: 'code',
    inputmode: 'numeric',
    autocomplete: 'one-time-code',
    maxlength: 6,
    required: true,
  });
  const error = h('p', { class: 'error', role: 'alert' });
  const submit = h('button', { class: 'btn primary', type: 'submit' }, 'تأكيد');

  return h('form', {
    class: 'auth-card',
    style: 'padding:0',
    onSubmit: async (event) => {
      event.preventDefault();
      submit.disabled = true;
      error.textContent = '';
      const failure = await onCode(code.value.trim());
      submit.disabled = false;
      if (failure) {
        error.textContent = 'الرمز غلط أو انتهى. جرّب الرمز الجديد.';
        code.value = '';
        return;
      }
      route();
    },
  },
    h('label', { class: 'field' }, 'رمز التحقق من تطبيق المصادقة', code),
    error,
    submit);
}

function showMfaVerify(factor) {
  show(authPage('رمز التحقق', 'افتح تطبيق المصادقة واكتب الرمز.', codeForm(async (code) => {
    const { error } = await db.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
    return error;
  })));
}

async function showMfaEnroll(unverified) {
  for (const factor of unverified) {
    await db.auth.mfa.unenroll({ factorId: factor.id });
  }
  const { data, error } = await db.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'moidatk-admin' });
  if (error) {
    failed(error);
    return;
  }
  show(authPage('فعّل رمز التحقق', 'مرة واحدة بس: امسح الرمز بتطبيق مصادقة زي Google Authenticator، واكتب الرقم البيطلع.',
    h('img', { class: 'qr', src: data.totp.qr_code, alt: 'رمز QR لتطبيق المصادقة' }),
    h('p', { class: 'secret' }, data.totp.secret),
    codeForm(async (code) => {
      const { error: failure } = await db.auth.mfa.challengeAndVerify({ factorId: data.id, code });
      return failure;
    })));
}

async function signOut() {
  await db.auth.signOut();
  showLogin();
}

/** بيحدد الشاشة حسب حالة الدخول. */
/** بدل صفحة فاضية: السبب، ومخرج. */
function showFailure(error) {
  console.error(error);
  show(authPage('ما قدرنا نفتح اللوحة', `${error.message || error}`,
    h('button', { class: 'btn primary', onClick: () => route().catch(showFailure) }, 'جرّب تاني'),
    h('button', { class: 'btn', onClick: signOut }, 'تسجيل الخروج')));
}

async function route() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    showLogin();
    return;
  }

  const { data: level, error: levelError } = await db.auth.mfa.getAuthenticatorAssuranceLevel();
  if (levelError) {
    failed(levelError);
    showLogin();
    return;
  }

  if (level.currentLevel !== 'aal2') {
    const { data: factors, error } = await db.auth.mfa.listFactors();
    if (error) {
      showFailure(error);
      return;
    }
    const verified = factors.totp.find((factor) => factor.status === 'verified');
    if (verified) showMfaVerify(verified);
    else await showMfaEnroll(factors.all.filter((factor) => factor.status === 'unverified'));
    return;
  }

  const { data: isAdmin, error } = await db.rpc('is_admin');
  if (error) {
    showFailure(error);
    return;
  }
  if (!isAdmin) {
    await db.auth.signOut();
    showLogin();
    toast('الحساب ده ما عندو صلاحية إدارة.');
    return;
  }
  showPanel('listings');
}

// ---------------------------------------------------------------- الهيكل

function showPanel(tab) {
  const main = h('main', {}, h('p', { class: 'empty' }, 'جاري التحميل…'));
  const tabButton = (id, label) => h('button', {
    class: `tab${tab === id ? ' active' : ''}`,
    onClick: () => showPanel(id),
  }, label);

  show(
    h('header', {},
      h('div', { class: 'header-row' },
        brand(),
        h('nav', {},
          tabButton('listings', 'العروض والبلاغات'),
          tabButton('manage', 'إدارة المنشور'),
          tabButton('users', 'الشركات والإعدادات'),
          tabButton('packages', 'الباقات والنشر'),
          h('button', { class: 'tab plain', onClick: signOut }, 'خروج')))),
    main);

  const load = { listings: listingsTab, manage: manageTab, users: usersTab, packages: packagesTab }[tab];
  load(main).catch((error) => {
    failed(error);
    main.replaceChildren(h('p', { class: 'empty' }, 'ما قدرنا نجيب البيانات.'));
  });
}

function askReason(title, { confirmLabel = 'رفض', label = 'السبب (بيظهر لصاحبو في التطبيق)' } = {}) {
  return new Promise((resolve) => {
    const reason = h('textarea', { rows: 3, maxlength: 500, required: true });
    const dialog = h('dialog', {},
      h('form', {
        onSubmit: (event) => {
          event.preventDefault();
          const value = reason.value.trim();
          if (!value) return;
          dialog.close();
          dialog.remove();
          resolve(value);
        },
      },
        h('h2', {}, title),
        h('label', { class: 'field' }, label, reason),
        h('div', { class: 'actions' },
          h('button', { class: 'btn dark', type: 'submit' }, confirmLabel),
          h('button', {
            class: 'btn',
            type: 'button',
            onClick: () => {
              dialog.close();
              dialog.remove();
              resolve(null);
            },
          }, 'إلغاء'))));
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** زر بيتقفل وقت العملية، وبيحدّث الصفحة بعدها. */
function actionButton(label, className, action) {
  const button = h('button', {
    class: `btn ${className}`,
    onClick: async () => {
      button.disabled = true;
      try {
        await action();
      } catch (error) {
        failed(error);
      }
      button.disabled = false;
    },
  }, label);
  return button;
}

// ---------------------------------------------------------------- العروض والبلاغات

const OWNER = '(name, is_company, verified)';
const LISTING_QUERY = `*, listing_photos(storage_path, position), profiles!listings_owner_id_fkey${OWNER}, `
  + 'sections(name_ar), item_types(name_ar), cities(name_ar), states(name_ar)';
const REQUEST_QUERY = `*, profiles!buyer_requests_owner_id_fkey${OWNER}, item_types(name_ar), cities(name_ar), states(name_ar)`;

const ownerLine = (owner) => {
  const kind = owner.is_company ? (owner.verified ? 'شركة موثّقة' : 'شركة') : 'فرد';
  return `${owner.name || 'من غير اسم'} · ${kind}`;
};

const listingTitle = (row) => [row.item_types.name_ar, row.brand, row.model].filter(Boolean).join(' ');

function listingSpecs(row) {
  const specs = [
    ['السعر', priceLine(row.price, row.currency, row.price_unit)],
    ['المكان', `${row.cities.name_ar}، ولاية ${row.states.name_ar}`],
    ['القسم', row.sections.name_ar],
    ['رقم التواصل', row.contact_phone],
    ['التواصل', [row.contact_whatsapp && 'واتساب', row.contact_call && 'اتصال'].filter(Boolean).join(' و')],
    ['سنة الصنع', row.year],
    // المعدة الجديدة ما عندها ساعات ولا مسافة
    ['ساعات التشغيل', row.condition === 'new' ? null : row.hours],
    ['المسافة (كم)', row.condition === 'new' ? null : row.mileage_km],
    ['الحمولة (طن)', row.load_tons],
    ['الإنتاج (طن/ساعة)', row.production_tph],
    ['قوة المحرك (حصان)', row.horsepower],
    ['الكمية', row.quantity],
    ['الحالة', row.condition === 'new' ? 'جديدة' : row.condition === 'used' ? 'مستعملة' : null],
  ];
  return h('div', { class: 'specs' },
    specs
      .filter(([, value]) => value !== null && value !== undefined && value !== '')
      .map(([label, value]) => h('div', {}, h('span', {}, `${label}: `), String(value))));
}

function listingCard(row, reload) {
  const photos = [...row.listing_photos].sort((a, b) => a.position - b.position);
  const details = h('div', { class: 'details', hidden: true },
    h('div', { class: 'photos' }, photos.map((photo) => {
      const url = photoUrl(photo.storage_path);
      return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, h('img', { src: url, alt: 'صورة العرض', loading: 'lazy' }));
    })),
    listingSpecs(row),
    row.description ? h('p', { class: 'description' }, row.description) : null);

  const decide = async (changes, message) => {
    await mustUpdate(db.from('listings').update(changes).eq('id', row.id));
    toast(message);
    reload();
  };

  return h('div', { class: 'card' },
    h('div', { class: 'card-row' },
      photos[0] ? h('img', { class: 'thumb', src: photoUrl(photos[0].storage_path), alt: '' }) : h('div', { class: 'thumb' }),
      h('div', { class: 'card-text' },
        h('div', { class: 'card-title' }, `${listingTitle(row)} · ${dealLabel(row.deal)}`),
        h('div', { class: 'card-meta' }, `${ownerLine(row.profiles)} · ${date.format(new Date(row.created_at))} · ${photos.length} صور`)),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onClick: () => { details.hidden = !details.hidden; } }, 'التفاصيل'),
        actionButton('قبول ونشر', 'dark', () => decide({ status: 'published', reject_reason: null }, 'اتنشر في التطبيق')),
        actionButton('رفض', '', async () => {
          const reason = await askReason('رفض العرض');
          if (reason) await decide({ status: 'rejected', reject_reason: reason }, 'اترفض، والسبب ظاهر لصاحبو');
        }))),
    details);
}

function requestCard(row, reload) {
  const title = `${row.item_types.name_ar} ${row.deal === 'sale' ? 'للشراء' : 'للإيجار'}`;
  const decide = async (changes, message) => {
    await mustUpdate(db.from('buyer_requests').update(changes).eq('id', row.id));
    toast(message);
    reload();
  };

  return h('div', { class: 'card' },
    h('div', { class: 'card-row' },
      h('div', { class: 'card-text' },
        h('div', { class: 'card-title' }, title),
        h('div', { class: 'card-meta' }, `${ownerLine(row.profiles)} · ${row.cities.name_ar}، ولاية ${row.states.name_ar} · ${row.contact_phone}`)),
      h('div', { class: 'actions' },
        actionButton('قبول ونشر', 'dark', () => decide({ status: 'published', reject_reason: null }, 'اتنشر في التطبيق')),
        actionButton('رفض', '', async () => {
          const reason = await askReason('رفض الطلب');
          if (reason) await decide({ status: 'rejected', reject_reason: reason }, 'اترفض، والسبب ظاهر لصاحبو');
        }))),
    h('p', { class: 'description' }, row.details));
}

function reportCard(group, reload) {
  const { listing, request, reports } = group;
  const title = listing
    ? `${listingTitle(listing)} · ${dealLabel(listing.deal)}`
    : `طلب: ${request.item_types.name_ar} ${request.deal === 'sale' ? 'للشراء' : 'للإيجار'}`;
  const reasons = reports.map((report) => report.reason).filter(Boolean);
  const ids = reports.map((report) => report.id);

  const closeReports = (status) => mustUpdate(db.from('reports').update({ status }).in('id', ids));

  return h('div', { class: 'card' },
    h('div', { class: 'card-row' },
      h('div', { class: 'card-text' },
        h('div', { class: 'card-title' }, title),
        h('div', { class: 'card-meta' }, `${reports.length} بلاغ${reasons.length ? `: ${reasons.join('، ')}` : ''}`)),
      h('div', { class: 'actions' },
        actionButton('إخفاء', 'danger', async () => {
          const table = listing ? 'listings' : 'buyer_requests';
          await mustUpdate(db.from(table).update({ status: 'hidden' }).eq('id', (listing || request).id));
          await closeReports('actioned');
          toast('اتخفى من التطبيق');
          reload();
        }),
        actionButton('تجاهل', '', async () => {
          await closeReports('dismissed');
          toast('البلاغ اتقفل');
          reload();
        }))));
}

function groupReports(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = row.listing_id || row.request_id;
    if (!groups.has(key)) groups.set(key, { listing: row.listings, request: row.buyer_requests, reports: [] });
    groups.get(key).reports.push(row);
  }
  return [...groups.values()];
}

// ---------------------------------------------------------------- تعديلات العروض المنشورة

// التعديل بيستنى في listing_edits، والعرض المنشور بيفضل ظاهر زي ما هو لحدي الموافقة.
const EDIT_QUERY = `*, item_types(name_ar), cities(name_ar), states(name_ar), listings!inner(${LISTING_QUERY})`;

const yesNo = (value, yes, no) => (value === null || value === undefined ? null : value ? yes : no);

const changesLabel = (n) => {
  if (n === 0) return 'البيانات زي ما هي';
  if (n === 1) return 'تغيير واحد';
  if (n === 2) return 'تغييرين';
  return n <= 10 ? `${n} تغييرات` : `${n} تغيير`;
};

/** الحقول الظاهرة للمقارنة. listings و listing_edits فيهم نفس الحقول. */
function comparableFields(row) {
  const isNew = row.condition === 'new';
  return [
    ['النوع', row.item_types?.name_ar],
    ['بيع أو إيجار', dealLabel(row.deal)],
    ['الماركة', row.brand],
    ['الموديل', row.model],
    ['السعر', priceLine(row.price, row.currency, row.price_unit)],
    ['المكان', `${row.cities.name_ar}، ولاية ${row.states.name_ar}`],
    ['رقم التواصل', row.contact_phone],
    ['التواصل', [row.contact_whatsapp && 'واتساب', row.contact_call && 'اتصال'].filter(Boolean).join(' و')],
    ['سنة الصنع', row.year],
    ['ساعات التشغيل', isNew ? null : row.hours],
    ['المسافة (كم)', isNew ? null : row.mileage_km],
    ['الحمولة (طن)', row.load_tons],
    ['الإنتاج (طن/ساعة)', row.production_tph],
    ['قوة المحرك (حصان)', row.horsepower],
    ['مصدر الطاقة', { diesel: 'ديزل', electric: 'كهرباء' }[row.power_source]],
    ['التصنيع', { local: 'محلي', imported: 'مستورد' }[row.origin]],
    ['الكمية', row.quantity],
    ['مشغّل أو سائق', yesNo(row.with_operator, 'معاهو', 'من غيرو')],
    ['الحالة', { new: 'جديدة', used: 'مستعملة' }[row.condition]],
    ['الوصف', row.description],
  ].map(([label, value]) => [label, value === null || value === undefined || value === '' ? '—' : String(value)]);
}

function photoStrip(paths, highlight = new Set()) {
  return h('div', { class: 'photos' }, paths.map((path) => {
    const url = photoUrl(path);
    return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', class: highlight.has(path) ? 'new-photo' : null },
      h('img', { src: url, alt: '', loading: 'lazy' }));
  }));
}

/** بيمسح الصور ونسخها الصغيرة. من غير صلاحية المسح الخادم بيرجّع قائمة فاضية. */
async function removePhotoFiles(paths) {
  if (!paths.length) return true;
  const { data, error } = await db.storage.from('listing-photos').remove([...paths, ...paths.map(thumbPath)]);
  return !error && (data?.length ?? 0) >= paths.length;
}

function editCard(edit, reload) {
  const listing = edit.listings;
  const livePhotos = [...listing.listing_photos]
    .sort((a, b) => a.position - b.position)
    .map((photo) => photo.storage_path);
  const before = comparableFields(listing);
  const changes = comparableFields(edit)
    .map(([label, value], i) => [label, before[i][1], value])
    .filter(([, old, value]) => old !== value);
  const photosChanged = livePhotos.join('|') !== edit.photos.join('|');
  // الصور الجديدة بس: بتتمسح لو التعديل اترفض.
  const newPhotos = new Set(edit.photos.filter((path) => !livePhotos.includes(path)));
  const cell = (label, value, className) =>
    h('td', { class: className }, label === 'رقم التواصل' && value !== '—' ? phoneText(value) : value);

  const approve = actionButton('قبول التعديل', 'dark', async () => {
    const unused = await must(db.rpc('approve_listing_edit', { p_listing_id: edit.listing_id }));
    const cleaned = await removePhotoFiles(unused || []);
    toast(cleaned
      ? 'التعديل اتطبّق، والعرض ظاهر بيهو في التطبيق'
      : 'التعديل اتطبّق، لكن الصور القديمة ما اتمسحت. شغّل ملف 20261106120000_admin_moderation.sql');
    reload();
  });
  const reject = actionButton('رفض التعديل', '', async () => {
    const reason = await askReason('رفض التعديل');
    if (!reason) return;
    await mustUpdate(db.from('listing_edits')
      .update({ status: 'rejected', reject_reason: reason })
      .eq('listing_id', edit.listing_id), 'listing_id');
    await removePhotoFiles([...newPhotos]);
    toast('اترفض، والعرض فضل زي ما كان. السبب ظاهر لصاحبو');
    reload();
  });

  return h('div', { class: 'card' },
    h('div', { class: 'card-row' },
      h('img', { class: 'thumb', src: photoUrl(edit.photos[0]), alt: '' }),
      h('div', { class: 'card-text' },
        h('div', { class: 'card-title' }, `${listingTitle(listing)} · ${dealLabel(listing.deal)}`),
        h('div', { class: 'card-meta' },
          `${ownerLine(listing.profiles)} · اتعدّل ${date.format(new Date(edit.updated_at))} · `
          + `${changesLabel(changes.length)}${photosChanged ? ' والصور' : ''}`)),
      h('div', { class: 'actions' }, approve, reject)),
    h('div', { class: 'details' },
      changes.length
        ? h('table', { class: 'diff' },
          h('thead', {}, h('tr', {}, h('th', {}, 'الحقل'), h('th', {}, 'الحالي (ظاهر للناس)'), h('th', {}, 'بعد التعديل'))),
          h('tbody', {}, changes.map(([label, old, value]) =>
            h('tr', {}, h('th', {}, label), cell(label, old, 'old'), cell(label, value, 'new')))))
        : null,
      photosChanged
        ? [
          h('div', { class: 'photo-label' }, 'الصور الحالية'),
          photoStrip(livePhotos),
          h('div', { class: 'photo-label' }, 'الصور بعد التعديل (الجديدة عليها إطار)'),
          photoStrip(edit.photos, newPhotos),
        ]
        : null));
}

async function count(table, column, value) {
  const { count: total, error } = await db.from(table)
    .select('id', { count: 'exact', head: true })
    .eq(column, value);
  if (error) throw error;
  return total;
}

async function listingsTab(main) {
  const reload = () => showPanel('listings');
  const [listings, edits, requests, reports, published] = await Promise.all([
    must(db.from('listings').select(LISTING_QUERY).eq('status', 'pending').order('created_at')),
    // null لو ملف listing_edits لسه ما اتشغّل، عشان باقي الصفحة يفتح.
    db.from('listing_edits').select(EDIT_QUERY)
      .eq('status', 'pending')
      .eq('listings.status', 'published')
      .order('updated_at')
      .then(({ data, error }) => (error ? null : data)),
    must(db.from('buyer_requests').select(REQUEST_QUERY).eq('status', 'pending').order('created_at')),
    must(db.from('reports')
      .select('id, reason, listing_id, request_id, listings(id, brand, model, deal, item_types(name_ar)), buyer_requests(id, deal, item_types(name_ar))')
      .eq('status', 'open')
      .order('created_at')),
    count('listings', 'status', 'published'),
  ]);
  const groups = groupReports(reports);

  const stat = (label, value) => h('div', { class: 'stat' }, h('span', {}, label), h('strong', {}, String(value)));
  const list = (items, render, emptyText) =>
    (items.length ? items.map(render) : [h('p', { class: 'empty' }, emptyText)]);

  main.replaceChildren(
    h('h1', {}, 'العروض والبلاغات'),
    h('div', { class: 'stats' },
      stat('عروض منشورة', published),
      stat('عروض قيد المراجعة', listings.length),
      stat('تعديلات قيد المراجعة', edits ? edits.length : '—'),
      stat('طلبات قيد المراجعة', requests.length),
      stat('بلاغات مفتوحة', reports.length)),
    h('section', {},
      h('h2', {}, 'عروض قيد المراجعة'),
      list(listings, (row) => listingCard(row, reload), 'ما في عروض منتظرة.')),
    h('section', {},
      h('h2', {}, 'تعديلات على عروض منشورة'),
      h('p', { class: 'hint' }, 'العرض بيفضل ظاهر بالنسخة الحالية لحدي ما توافق على التعديل.'),
      edits
        ? list(edits, (edit) => editCard(edit, reload), 'ما في تعديلات منتظرة.')
        : h('p', { class: 'empty' }, 'التعديلات محتاجة ملف 20261106130000_listing_edits.sql يتشغّل في Supabase.')),
    h('section', {},
      h('h2', {}, 'طلبات قيد المراجعة'),
      list(requests, (row) => requestCard(row, reload), 'ما في طلبات منتظرة.')),
    h('section', {},
      h('h2', {}, 'البلاغات'),
      list(groups, (group) => reportCard(group, reload), 'ما في بلاغات مفتوحة.')));
}

// ---------------------------------------------------------------- إدارة المنشور

const PAGE_SIZE = 30;
const thumbPath = (path) => path.replace(/\.jpg$/, '_thumb.jpg');

// [المفتاح، الاسم، الفلتر]. now بيتحسب مرة واحدة لكل تحميل.
const LISTING_FILTERS = [
  ['live', 'منشورة', (query, now) => query.eq('status', 'published').gt('expires_at', now)],
  ['expired', 'منتهية', (query, now) => query.eq('status', 'published').lte('expires_at', now)],
  ['closed', 'تم البيع أو التأجير', (query) => query.in('status', ['sold', 'rented'])],
  ['hidden', 'مخفية', (query) => query.eq('status', 'hidden')],
  ['rejected', 'مرفوضة', (query) => query.eq('status', 'rejected')],
];
const REQUEST_FILTERS = [
  ['live', 'منشورة', (query, now) => query.eq('status', 'published').gt('expires_at', now)],
  ['expired', 'منتهية', (query, now) => query.eq('status', 'published').lte('expires_at', now)],
  ['closed', 'لقيتو', (query) => query.eq('status', 'found')],
  ['hidden', 'مخفية', (query) => query.eq('status', 'hidden')],
  ['rejected', 'مرفوضة', (query) => query.eq('status', 'rejected')],
];

// بيفضل محفوظ لما الصفحة تتحدّث بعد أي عملية.
const manageState = { kind: 'listings', filter: 'live', search: '', loaded: PAGE_SIZE };

const STATUS_LABEL = {
  published: ['منشور', 'live'],
  sold: ['تم البيع', ''],
  rented: ['تم التأجير', ''],
  found: ['لقيتو', ''],
  hidden: ['مخفي', 'danger'],
  rejected: ['مرفوض', 'danger'],
  pending: ['قيد المراجعة', 'pending'],
};

function statusChip(row) {
  const expired = row.status === 'published' && row.expires_at && new Date(row.expires_at) <= new Date();
  const [label, tone] = expired ? ['منتهي', 'pending'] : (STATUS_LABEL[row.status] || [row.status, '']);
  return h('span', { class: `chip ${tone}` }, label);
}

/**
 * البحث بيتبعت للخادم. بنشيل الرموز البتلخبط فلتر «أو»، والرقم بيتبحث من غير الصفر الأول
 * عشان 0912… و +249912… يلقوا نفس العرض.
 */
function searchFilter(text, columns) {
  const clean = text.replace(/[%,()"*\\]/g, ' ').trim();
  if (!clean) return null;
  const digits = clean.replace(/\D/g, '').replace(/^0+/, '');
  const parts = columns.map((column) => `${column}.ilike."%${clean}%"`);
  if (digits.length >= 4) parts.push(`contact_phone.ilike."%${digits}%"`);
  return parts.join(',');
}

function confirmDialog(title, message, confirmLabel) {
  return new Promise((resolve) => {
    const finish = (value) => {
      dialog.close();
      dialog.remove();
      resolve(value);
    };
    const dialog = h('dialog', {},
      h('form', {
        onSubmit: (event) => {
          event.preventDefault();
          finish(true);
        },
      },
        h('h2', {}, title),
        h('p', { class: 'hint' }, message),
        h('div', { class: 'actions' },
          h('button', { class: 'btn danger', type: 'submit' }, confirmLabel),
          // المؤشر على «إلغاء»، عشان Enter ما يمسح حاجة بالغلط.
          h('button', { class: 'btn', type: 'button', autofocus: true, onClick: () => finish(false) }, 'إلغاء'))));
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** الحذف بيمسح العرض أول (وصورو وبلاغاتو والمفضلة بتتمسح معاهو)، وبعدها ملفات الصور. */
async function deleteListing(row) {
  // صور التعديل المنتظر (لو في) بتتمسح كمان. التعديل نفسو بيتمسح مع العرض.
  const { data: edit } = await db.from('listing_edits').select('photos').eq('listing_id', row.id).maybeSingle();
  await mustUpdate(db.from('listings').delete().eq('id', row.id));
  const photos = [...new Set([...row.listing_photos.map((photo) => photo.storage_path), ...(edit?.photos || [])])];
  return removePhotoFiles(photos);
}

function manageListingCard(row, reload) {
  const photos = [...row.listing_photos].sort((a, b) => a.position - b.position);
  const title = listingTitle(row);
  const details = h('div', { class: 'details', hidden: true },
    h('div', { class: 'photos' }, photos.map((photo) => {
      const url = photoUrl(photo.storage_path);
      return h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, h('img', { src: url, alt: 'صورة العرض', loading: 'lazy' }));
    })),
    listingSpecs(row),
    row.description ? h('p', { class: 'description' }, row.description) : null);

  const setStatus = async (status, message) => {
    await mustUpdate(db.from('listings').update({ status, reject_reason: null }).eq('id', row.id));
    toast(message);
    reload();
  };

  const visible = ['published', 'sold', 'rented'].includes(row.status);
  const stats = [
    `${number.format(row.view_count ?? 0)} مشاهدة`,
    `${number.format(row.whatsapp_clicks ?? 0)} واتساب`,
    `${number.format(row.call_clicks ?? 0)} اتصال`,
  ].join(' · ');
  const ends = row.status === 'published' && row.expires_at ? ` · ينتهي ${date.format(new Date(row.expires_at))}` : '';

  return h('div', { class: 'card' },
    h('div', { class: 'card-row' },
      photos[0] ? h('img', { class: 'thumb', src: photoUrl(photos[0].storage_path), alt: '' }) : h('div', { class: 'thumb' }),
      h('div', { class: 'card-text' },
        h('div', { class: 'card-title' }, `${title} · ${dealLabel(row.deal)} · ${priceLine(row.price, row.currency, row.price_unit)}`),
        h('div', { class: 'card-meta' }, `${ownerLine(row.profiles)} · `, phoneText(row.contact_phone), ends),
        h('div', { class: 'card-meta' }, stats),
        row.reject_reason ? h('div', { class: 'card-meta' }, `سبب الرفض: ${row.reject_reason}`) : null),
      statusChip(row),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onClick: () => { details.hidden = !details.hidden; } }, 'التفاصيل'),
        visible
          ? actionButton('إخفاء', '', async () => {
            if (await confirmDialog('إخفاء العرض', `«${title}» بيختفي من التطبيق، وصاحبو بيشوفو «مخفي». تقدر ترجّعو بعدين.`, 'إخفاء')) {
              await setStatus('hidden', 'اتخفى من التطبيق');
            }
          })
          : actionButton(row.status === 'rejected' ? 'قبول ونشر' : 'إظهار', 'dark',
            () => setStatus('published', 'رجع ظاهر في التطبيق')),
        actionButton('حذف', 'danger', async () => {
          const ok = await confirmDialog('حذف العرض نهائياً',
            `«${title}» بيتمسح مع صورو وبلاغاتو، وما بيرجع تاني.`, 'حذف نهائي');
          if (!ok) return;
          const filesGone = await deleteListing(row);
          toast(filesGone ? 'العرض اتمسح مع صورو' : 'العرض اتمسح، لكن الصور لسه في التخزين: شغّل ملف SQL الأخير في Supabase');
          reload();
        }))),
    details);
}

function manageRequestCard(row, reload) {
  const title = `${row.item_types.name_ar} ${row.deal === 'sale' ? 'للشراء' : 'للإيجار'}`;
  const setStatus = async (status, message) => {
    await mustUpdate(db.from('buyer_requests').update({ status, reject_reason: null }).eq('id', row.id));
    toast(message);
    reload();
  };
  const visible = ['published', 'found'].includes(row.status);

  return h('div', { class: 'card' },
    h('div', { class: 'card-row' },
      h('div', { class: 'card-text' },
        h('div', { class: 'card-title' }, title),
        h('div', { class: 'card-meta' }, `${ownerLine(row.profiles)} · ${row.cities.name_ar}، ولاية ${row.states.name_ar} · `, phoneText(row.contact_phone))),
      statusChip(row),
      h('div', { class: 'actions' },
        visible
          ? actionButton('إخفاء', '', async () => {
            if (await confirmDialog('إخفاء الطلب', `«${title}» بيختفي من التطبيق. تقدر ترجّعو بعدين.`, 'إخفاء')) {
              await setStatus('hidden', 'اتخفى من التطبيق');
            }
          })
          : actionButton(row.status === 'rejected' ? 'قبول ونشر' : 'إظهار', 'dark',
            () => setStatus('published', 'رجع ظاهر في التطبيق')),
        actionButton('حذف', 'danger', async () => {
          if (!await confirmDialog('حذف الطلب نهائياً', `«${title}» بيتمسح وما بيرجع تاني.`, 'حذف نهائي')) return;
          await mustUpdate(db.from('buyer_requests').delete().eq('id', row.id));
          toast('الطلب اتمسح');
          reload();
        }))),
    h('p', { class: 'description' }, row.details));
}

async function manageTab(main) {
  const reload = () => showPanel('manage');
  const isListings = manageState.kind === 'listings';
  const table = isListings ? 'listings' : 'buyer_requests';
  const filters = isListings ? LISTING_FILTERS : REQUEST_FILTERS;
  const active = filters.find(([key]) => key === manageState.filter) || filters[0];
  const now = new Date().toISOString();

  let query = db.from(table).select(isListings ? LISTING_QUERY : REQUEST_QUERY);
  query = active[2](query, now);
  const search = searchFilter(manageState.search, isListings ? ['brand', 'model', 'description'] : ['details']);
  if (search) query = query.or(search);

  const [rows, ...counts] = await Promise.all([
    must(query.order('created_at', { ascending: false }).range(0, manageState.loaded - 1)),
    ...filters.map(async ([, , apply]) => {
      const { count: total, error } = await apply(db.from(table).select('id', { count: 'exact', head: true }), now);
      if (error) throw error;
      return total;
    }),
  ]);

  const setState = (changes) => {
    Object.assign(manageState, changes);
    reload();
  };

  const kindButton = (kind, label) => h('button', {
    class: `filter${manageState.kind === kind ? ' active' : ''}`,
    onClick: () => setState({ kind, filter: 'live', search: '', loaded: PAGE_SIZE }),
  }, label);

  const searchBox = h('input', {
    class: 'search',
    type: 'search',
    value: manageState.search,
    placeholder: isListings ? 'ماركة، موديل، رقم، أو كلمة في الوصف' : 'رقم أو كلمة في التفاصيل',
    'aria-label': 'بحث',
  });
  const searchForm = h('form', {
    class: 'search-form',
    onSubmit: (event) => {
      event.preventDefault();
      setState({ search: searchBox.value.trim(), loaded: PAGE_SIZE });
    },
  }, searchBox, h('button', { class: 'btn', type: 'submit' }, 'بحث'));

  const render = isListings ? manageListingCard : manageRequestCard;

  // replaceChildren بيكتب null كنص، فبنشيل الأجزاء الفاضية أول.
  main.replaceChildren(...[
    h('div', { class: 'title-row' }, h('h1', {}, 'إدارة المنشور'), searchForm),
    h('p', { class: 'hint' }, 'كل العروض والطلبات بعد المراجعة: إخفاء، إرجاع، أو حذف نهائي.'),
    h('div', { class: 'filters' }, kindButton('listings', 'العروض'), kindButton('requests', 'الطلبات')),
    h('div', { class: 'filters' }, filters.map(([key, label], index) => h('button', {
      class: `filter light${key === active[0] ? ' active' : ''}`,
      onClick: () => setState({ filter: key, loaded: PAGE_SIZE }),
    }, label, h('span', {}, number.format(counts[index] ?? 0))))),
    manageState.search
      ? h('p', { class: 'hint' }, `نتيجة البحث عن «${manageState.search}» `,
        h('button', { class: 'btn link', onClick: () => setState({ search: '', loaded: PAGE_SIZE }) }, 'مسح البحث'))
      : null,
    h('section', {},
      rows.length
        ? rows.map((row) => render(row, reload))
        : h('p', { class: 'empty' }, manageState.search ? 'ما لقينا حاجة.' : 'ما في حاجة هنا.')),
    rows.length >= manageState.loaded
      ? h('button', {
        class: 'btn load-more',
        onClick: () => setState({ loaded: manageState.loaded + PAGE_SIZE }),
      }, 'عرض المزيد')
      : null,
  ].filter(Boolean));
}

/** الرقم بيتكتب من الشمال لليمين، عشان «+» ما تنقلب للآخر جوة النص العربي. */
const phoneText = (phone) => h('span', { class: 'ltr', style: 'display:inline-block' }, phone);

// ---------------------------------------------------------------- الشركات والإعدادات

/** دوال الإدارة بترمي رموز قصيرة، ودي معناها بالعربي. */
async function adminRpc(name, params) {
  const { data, error } = await db.rpc(name, params);
  if (error?.message === 'admin_account') throw new Error('حساب الإدارة ما بيتوقف ولا بينمسح من هنا');
  if (error) throw error;
  return data;
}

/**
 * [suspension] صف من suspended_users لو الحساب موقوف. [canControl] false لو ملف
 * 20261106140000_account_control.sql لسه ما اتشغّل، فأزرار الإيقاف والحذف ما بتظهر.
 */
function accountActions(user, suspension, canControl, reload) {
  if (!canControl) return [];
  const name = user.name || 'من غير اسم';

  const suspend = suspension
    ? actionButton('إلغاء الإيقاف', '', async () => {
      await adminRpc('admin_unsuspend_user', { p_user_id: user.id });
      toast('الحساب رجع، وعروضو ظاهرة للناس تاني');
      reload();
    })
    : actionButton('إيقاف', '', async () => {
      const reason = await askReason(`إيقاف حساب «${name}»`, {
        confirmLabel: 'إيقاف',
        label: 'السبب (للإدارة بس). الحساب ما بيقدر ينشر أو يعدّل، وعروضو وطلباتو بتختفي من الناس لحدي ما تلغي الإيقاف.',
      });
      if (!reason) return;
      await adminRpc('admin_suspend_user', { p_user_id: user.id, p_reason: reason });
      toast('الحساب اتوقف، وعروضو اختفت من التطبيق');
      reload();
    });

  const remove = actionButton('حذف الحساب', 'danger', async () => {
    const confirmed = await confirmDialog(
      `حذف حساب «${name}»`,
      `بيتمسح الحساب وكل عروضو (${number.format(user.listing_count)}) وطلباتو وصورو ورصيدو نهائياً، وما بيرجع. لو عايز توقفو بس، استعمل «إيقاف».`,
      'حذف نهائي',
    );
    if (!confirmed) return;
    const files = await adminRpc('admin_delete_user', { p_user_id: user.id });
    const photosRemoved = await removePhotoFiles(files?.listing_photos || []);
    const media = files?.media || [];
    let mediaRemoved = true;
    if (media.length) {
      const { data, error } = await db.storage.from('company-media').remove(media);
      mediaRemoved = !error && (data?.length ?? 0) >= media.length;
    }
    toast(photosRemoved && mediaRemoved
      ? 'الحساب اتمسح مع كل بياناتو وصورو'
      : 'الحساب اتمسح، لكن بعض الصور ما اتمسحت من التخزين');
    reload();
  });

  return [suspend, remove];
}

function userCard(user, packages, reload, suspension = null, canControl = false) {
  const setVerified = async (verified) => {
    await mustUpdate(db.from('profiles')
      .update({ verified, company_page_status: 'approved' })
      .eq('id', user.id));
    toast(verified ? 'الشركة بقت موثّقة' : 'التوثيق اتلغى');
    reload();
  };

  const chip = !user.is_company
    ? h('span', { class: 'chip' }, 'فرد')
    : user.company_page_status === 'pending_review'
      ? h('span', { class: 'chip pending' }, 'غيّرت الاسم: محتاجة مراجعة')
      : user.verified
        ? h('span', { class: 'chip verified' }, 'شركة موثّقة')
        : h('span', { class: 'chip' }, 'غير موثّقة');

  return h('div', { class: `card${suspension ? ' suspended' : ''}` },
    h('div', { class: 'card-row' },
      h('div', { class: 'card-text' },
        h('div', { class: 'card-title' }, user.name || 'من غير اسم'),
        h('div', { class: 'card-meta' },
          `${user.is_company ? 'شركة' : 'فرد'} · `,
          h('span', { class: 'ltr', style: 'display:inline-block' }, user.phone ? `+${user.phone}` : user.email || 'من غير رقم'),
          ` · ${number.format(user.listing_count)} عروض · رصيد ${number.format(user.ads_balance)}${user.featured_balance ? ` + ${number.format(user.featured_balance)} مميزة` : ''}`),
        suspension
          ? h('div', { class: 'card-meta danger-text' },
            `موقوف من ${date.format(new Date(suspension.suspended_at))}: ${suspension.reason}`)
          : null),
      suspension ? h('span', { class: 'chip danger' }, 'موقوف') : null,
      chip,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', onClick: () => showGrantDialog(user, packages, reload) }, 'إضافة رصيد'),
        user.is_company && (user.verified
          ? actionButton('إلغاء التوثيق', '', () => setVerified(false))
          : actionButton('توثيق', 'blue', () => setVerified(true))),
        accountActions(user, suspension, canControl, reload))));
}

function supportCard(setting) {
  const whatsapp = h('input', {
    class: 'ltr',
    type: 'tel',
    placeholder: '+249912345678',
    value: setting.whatsapp || '',
  });

  return h('div', { class: 'card' },
    h('div', { class: 'switch-row' }, 'واتساب الإدارة'),
    h('p', { class: 'hint' }, 'زر «التواصل مع الإدارة» في التطبيق بيفتح الرقم ده. اكتبو بالصيغة الدولية.'),
    h('label', { class: 'field' }, 'الرقم', whatsapp),
    h('div', { class: 'actions' },
      actionButton('حفظ', 'dark', async () => {
        const number = whatsapp.value.replace(/[\s-]/g, '');
        if (number && !/^\+[1-9][0-9]{6,14}$/.test(number)) {
          throw new Error('الرقم لازم يبدأ بـ + ومفتاح الدولة');
        }
        await mustUpdate(db.from('app_settings')
          .update({ value: { whatsapp: number }, updated_at: new Date().toISOString() })
          .eq('key', 'support'), 'key');
        toast('اتحفظ الرقم');
      })));
}

async function usersTab(main) {
  const reload = () => showPanel('users');
  const [users, packages, support, suspended] = await Promise.all([
    must(db.rpc('admin_users')),
    must(db.from('ad_packages').select('*').eq('is_active', true).order('sort_order', { ascending: true })),
    must(db.from('app_settings').select('value').eq('key', 'support').single()),
    // null لو ملف account_control لسه ما اتشغّل، عشان الصفحة تفتح عادي.
    db.from('suspended_users').select('user_id, reason, suspended_at')
      .then(({ data, error }) => (error ? null : data)),
  ]);
  const canControl = suspended !== null;
  const suspensions = new Map((suspended || []).map((row) => [row.user_id, row]));
  const filters = h('div', { class: 'filters' });
  let onlySuspended = false;

  const list = h('section', {});
  const search = h('input', {
    class: 'search',
    type: 'search',
    placeholder: 'بحث بالاسم أو الرقم أو الإيميل',
    'aria-label': 'بحث بالاسم أو الرقم أو الإيميل',
    onInput: () => render(),
  });

  function render() {
    const query = search.value.trim().toLowerCase();
    const matches = users.filter((user) =>
      (!onlySuspended || suspensions.has(user.id))
        && ((user.name || '').toLowerCase().includes(query)
          || (user.email || '').toLowerCase().includes(query)
          || (user.phone || '').includes(query.replace(/\D/g, '') || query)));
    list.replaceChildren(...(matches.length
      ? matches.map((user) => userCard(user, packages, reload, suspensions.get(user.id) || null, canControl))
      : [h('p', { class: 'empty' }, onlySuspended ? 'ما في حسابات موقوفة.' : 'ما لقينا مستخدم.')]));
    filters.replaceChildren(
      ...[[false, 'الكل', users.length], [true, 'الموقوفين', suspensions.size]].map(([value, label, total]) =>
        h('button', {
          class: `filter${onlySuspended === value ? ' active' : ''}`,
          onClick: () => {
            onlySuspended = value;
            render();
          },
        }, label, h('span', {}, number.format(total)))));
  }
  render();

  main.replaceChildren(
    h('div', { class: 'title-row' }, h('h1', {}, 'المستخدمين والشركات'), search),
    canControl
      ? filters
      : h('p', { class: 'hint' }, 'الإيقاف والحذف محتاجين ملف 20261106140000_account_control.sql يتشغّل في Supabase.'),
    list,
    h('section', {},
      h('h2', {}, 'الإعدادات'),
      h('div', { class: 'settings' }, supportCard(support.value))));
}

// ---------------------------------------------------------------- الباقات والنشر

const POSTING_MODES = [
  ['free', 'مجاني', 'أي زول ينشر من غير رصيد.'],
  ['paid', 'بالرصيد', 'كل عرض بيخصم إعلان من رصيد صاحبو، والطلبات مجانية. ما تفعّلو قبل رد دعم Google Play.'],
  ['stopped', 'موقوف', 'ما في عرض ولا طلب جديد، والمنشور بيفضل ظاهر.'],
];

function postingCard(setting) {
  const radios = POSTING_MODES.map(([value]) =>
    h('input', { type: 'radio', name: 'posting-mode', value, checked: setting.mode === value }));
  const freeUntil = h('input', { type: 'date', class: 'ltr', value: (setting.free_until || '').slice(0, 10) });

  return h('div', { class: 'card' },
    h('div', { class: 'switch-row' }, 'وضع النشر'),
    POSTING_MODES.map(([, label, hint], index) =>
      h('label', { class: 'mode-row' },
        radios[index],
        h('span', {}, h('strong', {}, label), h('span', { class: 'hint' }, hint)))),
    h('label', { class: 'field' }, 'عرض مجاني لحدي (مع «بالرصيد»، اختياري)', freeUntil),
    h('div', { class: 'actions' },
      actionButton('حفظ', 'dark', async () => {
        const mode = radios.find((radio) => radio.checked).value;
        const until = freeUntil.value ? new Date(`${freeUntil.value}T23:59:59`).toISOString() : null;
        await mustUpdate(db.from('app_settings')
          .update({ value: { mode, free_until: until }, updated_at: new Date().toISOString() })
          .eq('key', 'posting'), 'key');
        toast('اتحفظ وضع النشر');
      })));
}

/** باقة موجودة، أو فورم فاضي لباقة جديدة لو [pkg] فاضي. */
function packageCard(pkg, nextOrder, reload) {
  const nameAr = h('input', { value: pkg?.name_ar ?? '', maxlength: 60 });
  const nameEn = h('input', { class: 'ltr', value: pkg?.name_en ?? '', maxlength: 60 });
  const ads = h('input', { class: 'ltr', type: 'number', min: 1, value: pkg?.ads_count ?? 1 });
  const featured = h('input', { class: 'ltr', type: 'number', min: 0, value: pkg?.featured_count ?? 0 });
  const price = h('input', { class: 'ltr', type: 'number', min: 0, step: 1000, value: pkg?.price_sdg ?? 0 });
  const active = h('input', { type: 'checkbox', checked: pkg?.is_active ?? true });

  return h('div', { class: 'card' },
    h('label', { class: 'switch-row' }, pkg ? pkg.name_ar : 'باقة جديدة', active),
    h('div', { class: 'inline-fields' },
      h('label', { class: 'field' }, 'الاسم بالعربي', nameAr),
      h('label', { class: 'field' }, 'الاسم بالإنجليزي', nameEn)),
    h('div', { class: 'inline-fields' },
      h('label', { class: 'field' }, 'الإعلانات', ads),
      h('label', { class: 'field' }, 'المميزة', featured),
      h('label', { class: 'field' }, 'السعر (ج.س)', price)),
    h('div', { class: 'actions' },
      actionButton(pkg ? 'حفظ' : 'إضافة الباقة', 'dark', async () => {
        const row = {
          name_ar: nameAr.value.trim(),
          name_en: nameEn.value.trim(),
          ads_count: Number(ads.value),
          featured_count: Number(featured.value),
          price_sdg: Number(price.value),
          is_active: active.checked,
        };
        if (!row.name_ar || !row.name_en) throw new Error('اكتب اسم الباقة بالعربي والإنجليزي');
        if (row.ads_count < 1 || row.featured_count < 0 || row.price_sdg < 0) throw new Error('راجع الأرقام');

        if (pkg) await mustUpdate(db.from('ad_packages').update(row).eq('id', pkg.id));
        else await must(db.from('ad_packages').insert({ ...row, sort_order: nextOrder }));
        toast('اتحفظت الباقة');
        reload();
      })));
}

function showGrantDialog(user, packages, reload) {
  const close = () => {
    dialog.close();
    dialog.remove();
  };
  const manual = h('div', { class: 'inline-fields', hidden: packages.length > 0 });
  const choice = h('select', { onChange: () => { manual.hidden = choice.value !== ''; } },
    packages.map((pkg) => h('option', { value: pkg.id },
      `${pkg.name_ar} · ${number.format(pkg.ads_count)} إعلان · ${formatPrice(pkg.price_sdg, 'sdg')}`)),
    h('option', { value: '' }, 'عدد يدوي (تعويض أو تصحيح)'));
  const ads = h('input', { class: 'ltr', type: 'number', value: 1 });
  const featured = h('input', { class: 'ltr', type: 'number', value: 0 });
  manual.append(
    h('label', { class: 'field' }, 'الإعلانات (السالب بيخصم)', ads),
    h('label', { class: 'field' }, 'المميزة', featured));
  const reference = h('input', { class: 'ltr', maxlength: 100 });
  const note = h('input', { maxlength: 300 });
  const submit = h('button', { class: 'btn dark', type: 'submit' }, 'إضافة');

  const dialog = h('dialog', {},
    h('form', {
      onSubmit: async (event) => {
        event.preventDefault();
        submit.disabled = true;
        try {
          await must(choice.value
            ? db.rpc('admin_grant_package', {
              p_user_id: user.id,
              p_package_id: choice.value,
              p_reference: reference.value,
              p_note: note.value,
            })
            : db.rpc('admin_adjust_credits', {
              p_user_id: user.id,
              p_ads: Number(ads.value),
              p_featured: Number(featured.value),
              p_note: note.value,
            }));
          close();
          toast('اتضاف الرصيد');
          reload();
        } catch (error) {
          failed(error);
          submit.disabled = false;
        }
      },
    },
      h('h2', {}, `إضافة رصيد: ${user.name || 'من غير اسم'}`),
      h('label', { class: 'field' }, 'الباقة', choice),
      manual,
      h('label', { class: 'field' }, 'رقم العملية (لو في تحويل)', reference),
      h('label', { class: 'field' }, 'ملاحظة', note),
      h('div', { class: 'actions' },
        submit,
        h('button', { class: 'btn', type: 'button', onClick: close }, 'إلغاء'))));
  document.body.append(dialog);
  dialog.showModal();
}

function saleCard(sale) {
  const details = [
    `${number.format(sale.ads_count)} إعلان`,
    formatPrice(sale.price_sdg, 'sdg'),
    sale.bank_reference && `عملية ${sale.bank_reference}`,
    date.format(new Date(sale.created_at)),
  ];
  return h('div', { class: 'card' },
    h('div', { class: 'card-title' }, `${sale.profiles?.name || 'من غير اسم'} · ${sale.ad_packages?.name_ar}`),
    h('div', { class: 'card-meta' }, details.filter(Boolean).join(' · ')));
}

async function packagesTab(main) {
  const reload = () => showPanel('packages');
  const [setting, packages, sales] = await Promise.all([
    must(db.from('app_settings').select('value').eq('key', 'posting').single()),
    must(db.from('ad_packages').select('*').order('sort_order', { ascending: true })),
    must(db.from('package_purchases')
      .select('*, profiles(name), ad_packages(name_ar)')
      .order('created_at', { ascending: false })
      .limit(30)),
  ]);
  const nextOrder = Math.max(0, ...packages.map((pkg) => pkg.sort_order)) + 1;

  main.replaceChildren(
    h('h1', {}, 'الباقات والنشر'),
    h('section', {}, h('div', { class: 'settings' }, postingCard(setting.value))),
    h('section', {},
      h('h2', {}, 'الباقات'),
      h('p', { class: 'hint' }, 'إطفاء المفتاح بيوقف الباقة، والمباع منها بيفضل في السجل.'),
      h('div', { class: 'settings' },
        packages.map((pkg) => packageCard(pkg, nextOrder, reload)),
        packageCard(null, nextOrder, reload))),
    h('section', {},
      h('h2', {}, 'آخر المبيعات'),
      sales.length
        ? sales.map(saleCard)
        : h('p', { class: 'empty' }, 'لسه ما في مبيعات. الرصيد بيتضاف من تبويب الشركات والإعدادات.')));
}

route().catch(showFailure);
