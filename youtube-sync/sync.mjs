// مزامنة قنوات يوتيوب مع أقسام موقع كربلاء ميديا حسب ملف الخطة (plan.txt)
// - يقرأ الخطة، يجلب اسم وصورة كل قناة من يوتيوب
// - ينشئ القسم إن لم يكن موجوداً، وينشئ القناة داخله، أو يضيفها لقسمها إن كانت موجودة
// - لا يحذف شيئاً ولا يعدّل اسم أو صورة قناة موجودة (حتى لا يفسد تعديلاتك اليدوية)
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const DEFAULT_DB_URL = 'https://karbalamedia80-default-rtdb.firebaseio.com';
const DEFAULT_REFERER = 'https://h-80.github.io/';

// ---------- قراءة صيغ القنوات ----------
export function parseChannelRef(input) {
    const s = String(input || '').trim();
    if (!s) return null;
    if (/^UC[\w-]{22}$/.test(s)) return { id: s };
    if (s.startsWith('@')) return { forHandle: s };
    let u;
    try { u = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s); } catch (e) { return null; }
    if (!/(^|\.)youtube\.com$/i.test(u.hostname)) return null;
    const seg = u.pathname.split('/').filter(Boolean).map(x => { try { return decodeURIComponent(x); } catch (e) { return x; } });
    if (!seg.length) return null;
    if (seg[0].startsWith('@')) return { forHandle: seg[0] };
    if (seg[0] === 'channel' && seg[1]) return { id: seg[1] };
    if (seg[0] === 'user' && seg[1]) return { forUsername: seg[1] };
    if (seg[0] === 'c' && seg[1]) return { forHandle: '@' + seg[1] };
    return null;
}

export function refKey(ref) {
    if (!ref) return '';
    if (ref.id) return 'id:' + ref.id;
    if (ref.forHandle) return 'h:' + ref.forHandle.toLowerCase();
    if (ref.forUsername) return 'u:' + ref.forUsername.toLowerCase();
    return '';
}

export function canonicalLink(ref, resolvedId) {
    if (resolvedId) return 'https://www.youtube.com/channel/' + resolvedId + '/playlists';
    if (ref.id) return 'https://www.youtube.com/channel/' + ref.id + '/playlists';
    if (ref.forHandle) return 'https://www.youtube.com/' + encodeURI(ref.forHandle) + '/playlists';
    return 'https://www.youtube.com/user/' + encodeURI(ref.forUsername) + '/playlists';
}

// ---------- قراءة ملف الخطة ----------
export function parsePlan(text) {
    const sections = [];
    const errors = [];
    let cur = null;
    String(text).split(/\r?\n/).forEach((raw, i) => {
        const line = raw.trim();
        const n = i + 1;
        if (!line || line.startsWith('#')) return;
        const m = line.match(/^\[(.+)\]$/);
        if (m) {
            const names = m[1].split('>').map(x => x.trim()).filter(Boolean);
            if (!names.length) { errors.push(`سطر ${n}: اسم القسم فارغ`); cur = null; return; }
            cur = { path: names, line: n, entries: [] };
            sections.push(cur);
            return;
        }
        if (!cur) { errors.push(`سطر ${n}: قناة بدون قسم قبلها: ${line}`); return; }
        const ref = parseChannelRef(line);
        if (!ref) { errors.push(`سطر ${n}: رابط قناة غير مفهوم: ${line}`); return; }
        cur.entries.push({ raw: line, ref, line: n });
    });
    return { sections, errors };
}

// ---------- أدوات البيانات ----------
function normParent(v) {
    if (v === null || v === undefined) return '';
    const s = String(v).trim();
    return ['null', 'undefined', 'false', '0'].includes(s.toLowerCase()) ? '' : s;
}
const normName = s => String(s || '').trim().toLowerCase();

function channelCategoryIds(ch) {
    let ids = [];
    if (ch.categoryIds) ids = Array.isArray(ch.categoryIds) ? ch.categoryIds : Object.values(ch.categoryIds);
    else if (ch.categories) ids = Array.isArray(ch.categories) ? ch.categories : Object.values(ch.categories);
    else if (ch.categoryId) ids = [ch.categoryId];
    else if (ch.catId) ids = [ch.catId];
    return ids.map(String).filter(x => x && x !== 'undefined');
}

function channelRefKeys(ch) {
    const keys = new Set();
    if (ch.ytChannelId) keys.add('id:' + ch.ytChannelId);
    const urls = [];
    if (ch.links && typeof ch.links === 'object') {
        Object.values(ch.links).forEach(l => urls.push(typeof l === 'string' ? l : (l && l.url)));
    }
    ['url', 'link', 'mainLink'].forEach(p => { if (typeof ch[p] === 'string') urls.push(ch[p]); });
    urls.forEach(u => { const k = refKey(parseChannelRef(u)); if (k) keys.add(k); });
    return keys;
}

async function ensureCategory(db, cats, names, dry, log) {
    let parentId = '';
    for (const name of names) {
        let found = Object.keys(cats).find(id => normName(cats[id].name) === normName(name) && normParent(cats[id].parentId) === parentId);
        if (!found) {
            const data = { name, parentId, link: '', img: '' };
            found = dry ? 'DRY_' + Object.keys(cats).length : await db.push('categories', data);
            cats[found] = data;
            log(`  + قسم جديد: ${name}`);
        }
        parentId = found;
    }
    return parentId;
}

// ---------- المزامنة ----------
export async function syncPlan({ plan, db, fetchChannel, dry = false, log = console.log }) {
    const cats = await db.getAll('categories');
    const chans = await db.getAll('channels');
    const infoCache = {};
    const stats = { created: 0, linked: 0, unchanged: 0, failed: 0, categories: 0 };
    const failures = [];
    const catCountBefore = Object.keys(cats).length;

    for (const sec of plan.sections) {
        log(`\n[${sec.path.join(' > ')}]`);
        const catId = await ensureCategory(db, cats, sec.path, dry, log);
        for (const e of sec.entries) {
            const key = refKey(e.ref);
            try {
                if (!infoCache[key]) infoCache[key] = await fetchChannel(e.ref);
                const info = infoCache[key];
                const existingId = Object.keys(chans).find(id => {
                    const keys = channelRefKeys(chans[id]);
                    return keys.has('id:' + info.id) || keys.has(key);
                });

                if (existingId) {
                    const ch = chans[existingId];
                    const ids = channelCategoryIds(ch);
                    const patch = {};
                    if (!ids.includes(String(catId))) {
                        patch.categoryIds = [...ids, String(catId)];
                        if (!ch.categoryId) patch.categoryId = String(catId);
                    }
                    if (!ch.ytChannelId) patch.ytChannelId = info.id;
                    if (Object.keys(patch).length) {
                        if (!dry) await db.update('channels/' + existingId, patch);
                        Object.assign(ch, patch);
                        if (patch.categoryIds) { stats.linked++; log(`  ~ ${info.title}: أُضيفت لهذا القسم (كانت موجودة)`); }
                        else stats.unchanged++;
                    } else {
                        stats.unchanged++;
                        log(`  = ${info.title}: موجودة مسبقاً`);
                    }
                } else {
                    const data = {
                        name: info.title,
                        img: info.thumb || '',
                        categoryIds: [String(catId)],
                        categoryId: String(catId),
                        links: { Main: { label: 'Main', url: canonicalLink(e.ref, info.id) } },
                        ytChannelId: info.id,
                        source: 'youtube-sync'
                    };
                    const newId = dry ? 'DRY_CH_' + Object.keys(chans).length : await db.push('channels', data);
                    chans[newId] = data;
                    stats.created++;
                    const extra = info.videoCount != null ? ` (${info.videoCount} فيديو)` : '';
                    log(`  + ${info.title}${extra}`);
                }
            } catch (err) {
                stats.failed++;
                failures.push(`سطر ${e.line} (${e.raw}): ${err.message}`);
                log(`  ! فشل: ${e.raw} -> ${err.message}`);
            }
        }
    }
    stats.categories = Object.keys(cats).length - catCountBefore;
    return { stats, failures };
}

// ---------- يوتيوب ----------
export function makeYouTubeFetcher(apiKey, referer = DEFAULT_REFERER) {
    return async function fetchChannel(ref) {
        const q = new URLSearchParams({ part: 'snippet,statistics', key: apiKey });
        if (ref.id) q.set('id', ref.id);
        else if (ref.forHandle) q.set('forHandle', ref.forHandle);
        else if (ref.forUsername) q.set('forUsername', ref.forUsername);
        const r = await fetch('https://www.googleapis.com/youtube/v3/channels?' + q.toString(), { headers: { Referer: referer } });
        let j;
        try { j = await r.json(); } catch (e) { throw new Error('رد غير مفهوم من يوتيوب'); }
        if (j.error) {
            const msg = j.error.message || 'خطأ من يوتيوب';
            if (/referer|referrer|blocked/i.test(msg)) throw new Error(msg + ' (راجع تقييد مفتاح يوتيوب: يجب أن يسمح بـ ' + referer + '*)');
            throw new Error(msg);
        }
        const c = (j.items || [])[0];
        if (!c) throw new Error('لم يتم العثور على القناة');
        const t = c.snippet.thumbnails || {};
        return {
            id: c.id,
            title: c.snippet.title,
            thumb: (t.high || t.medium || t.default || {}).url || '',
            videoCount: c.statistics ? Number(c.statistics.videoCount) : null
        };
    };
}

// ---------- Firebase عبر الرابط المباشر (REST) بدون مفتاح، مثل لوحة التحكم ----------
export function makeRestDb(dbUrl) {
    const base = dbUrl.replace(/\/+$/, '');
    async function call(method, p, body) {
        const r = await fetch(`${base}/${p}.json`, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        let j = null;
        try { j = await r.json(); } catch (e) {}
        if (!r.ok) {
            const why = j && j.error ? j.error : ('HTTP ' + r.status);
            throw new Error(`Firebase رفض العملية (${method} ${p}): ${why}`);
        }
        return j;
    }
    return {
        getAll: async p => (await call('GET', p)) || {},
        push: async (p, data) => (await call('POST', p, data)).name,
        update: (p, data) => call('PATCH', p, data),
        close: async () => {}
    };
}

// ---------- Firebase بصلاحيات المدير (اختياري، إذا وُجد السر FIREBASE_SERVICE_ACCOUNT) ----------
async function makeFirebaseDb(serviceAccountJson, dbUrl) {
    const admin = (await import('firebase-admin')).default;
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(serviceAccountJson)), databaseURL: dbUrl });
    const rdb = admin.database();
    return {
        getAll: async p => (await rdb.ref(p).once('value')).val() || {},
        push: async (p, data) => { const r = rdb.ref(p).push(); await r.set(data); return r.key; },
        update: (p, data) => rdb.ref(p).update(data),
        close: () => admin.app().delete()
    };
}

async function main() {
    const dry = String(process.env.DRY_RUN || '').toLowerCase() === 'true';
    const apiKey = process.env.YOUTUBE_API_KEY;
    const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!apiKey) throw new Error('السر YOUTUBE_API_KEY غير موجود في إعدادات GitHub');

    const here = path.dirname(fileURLToPath(import.meta.url));
    const plan = parsePlan(readFileSync(path.join(here, 'plan.txt'), 'utf8'));
    if (plan.errors.length) {
        console.error('أخطاء في ملف الخطة:\n' + plan.errors.join('\n'));
        process.exit(1);
    }
    const total = plan.sections.reduce((n, s) => n + s.entries.length, 0);
    console.log(`الخطة: ${plan.sections.length} قسم، ${total} قناة${dry ? ' (تجربة فقط، بدون كتابة)' : ''}`);
    if (!total) { console.log('الخطة فارغة، لا شيء للمزامنة.'); return; }

    const dbUrl = process.env.FIREBASE_DATABASE_URL || DEFAULT_DB_URL;
    const db = sa ? await makeFirebaseDb(sa, dbUrl) : makeRestDb(dbUrl);
    try {
        const { stats, failures } = await syncPlan({
            plan, db, dry,
            fetchChannel: makeYouTubeFetcher(apiKey, process.env.YT_REFERER || DEFAULT_REFERER)
        });
        console.log(`\nالنتيجة: ${stats.created} قناة جديدة، ${stats.linked} أُضيفت لقسم، ${stats.unchanged} بدون تغيير، ${stats.categories} قسم جديد، ${stats.failed} فشل`);
        if (failures.length) { console.error('\nالإخفاقات:\n' + failures.join('\n')); process.exitCode = 1; }
    } finally {
        await db.close();
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main().catch(e => { console.error('خطأ: ' + e.message); process.exit(1); });
}
