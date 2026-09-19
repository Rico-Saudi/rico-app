import { useState, useEffect, useCallback, useMemo } from 'react';
import { errorMessage } from './api';

// Mirrors the server's PROFESSION_SLUG_PATTERN. Checked here too so the
// owner is told before the round trip, not after it.
const SLUG_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;

const EMPTY_FORM = { slug: '', label: '', group: '', aliases: '', isActive: true };

const ERRORS = {
  profession_exists: 'فيه مهنة بنفس المعرّف.',
  group_unknown: 'القسم غير معروف.',
  slug_invalid: 'المعرّف لازم يكون بحروف إنجليزية صغيرة وأرقام و_ فقط.',
  profession_not_found: 'المهنة غير موجودة.',
};

function parseAliases(raw) {
  return raw
    .split(/[،,\n]/)
    .map((a) => a.trim())
    .filter(Boolean);
}

/**
 * The trades the app offers.
 *
 * They used to be a constant in the Flutter app and in the server's source,
 * so adding one because three people asked for it meant a release. This is
 * where they live now: what is added here is searchable in the app, pickable
 * in the profile sheet, and visible to the intent classifier immediately —
 * on phones that are already installed.
 */
export default function ProfessionsPanel({ authedFetch }) {
  const [data, setData] = useState(null); // null = loading
  const [form, setForm] = useState(EMPTY_FORM);
  const [formStatus, setFormStatus] = useState(null);
  const [editing, setEditing] = useState(null); // slug being edited inline
  const [draft, setDraft] = useState(null);
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('');

  const load = useCallback(async () => {
    const res = await authedFetch('/owner/professions');
    if (!res) return;
    setData(await res.json());
  }, [authedFetch]);

  useEffect(() => {
    load();
  }, [load]);

  const groups = data?.groups ?? [];

  // A list of 100+ trades is not something anyone scrolls — the same reason
  // the app's picker has a search box.
  const visible = useMemo(() => {
    const needle = query.trim();
    return (data?.items ?? []).filter((item) => {
      if (groupFilter && item.group !== groupFilter) return false;
      if (!needle) return true;
      return (
        item.label.includes(needle) ||
        item.slug.includes(needle.toLowerCase()) ||
        item.aliases.some((a) => a.includes(needle))
      );
    });
  }, [data, query, groupFilter]);

  async function handleCreate(e) {
    e.preventDefault();
    setFormStatus(null);

    if (!SLUG_PATTERN.test(form.slug)) {
      return setFormStatus({ type: 'error', message: ERRORS.slug_invalid });
    }
    if (!form.group) {
      return setFormStatus({ type: 'error', message: 'اختر القسم اللي تظهر تحته.' });
    }

    const res = await authedFetch('/owner/professions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        slug: form.slug.trim(),
        label: form.label.trim(),
        group: form.group,
        aliases: parseAliases(form.aliases),
        isActive: form.isActive,
      }),
    });
    if (!res) return;

    if (res.ok) {
      setFormStatus({ type: 'success', message: `أضيفت «${form.label.trim()}» ووصلت للتطبيق على طول.` });
      setForm(EMPTY_FORM);
      load();
    } else {
      const body = await res.clone().json().catch(() => null);
      setFormStatus({ type: 'error', message: ERRORS[body?.error] || (await errorMessage(res, 'تعذر إضافة المهنة.')) });
    }
  }

  async function patch(slug, body) {
    const res = await authedFetch(`/owner/professions/${slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (res?.ok) load();
    return res;
  }

  function startEdit(item) {
    setEditing(item.slug);
    setDraft({ label: item.label, group: item.group, aliases: item.aliases.join('، ') });
  }

  async function saveEdit(slug) {
    const res = await patch(slug, {
      label: draft.label.trim(),
      group: draft.group,
      aliases: parseAliases(draft.aliases),
    });
    if (res?.ok) {
      setEditing(null);
      setDraft(null);
    }
  }

  async function remove(item) {
    // The count is already on the row, so the confirmation can say what is
    // actually at stake instead of asking "are you sure?" in the abstract.
    if (item.professionalCount > 0) {
      return window.alert(
        `ما تنحذف: فيه ${item.professionalCount} شخص مسجّلين على «${item.label}». ` +
          'أوقفها بدل ما تحذفها — يبقى ملفهم شغّال وتختفي من قائمة التطبيق.',
      );
    }
    if (!window.confirm(`تحذف «${item.label}» نهائياً؟`)) return;

    const res = await authedFetch(`/owner/professions/${item.slug}`, { method: 'DELETE' });
    if (!res) return;
    if (res.ok) load();
    else {
      const body = await res.clone().json().catch(() => null);
      window.alert(
        body?.error === 'profession_in_use'
          ? `ما تنحذف: فيه ${body.professionalCount} شخص مسجّلين عليها. أوقفها بدل الحذف.`
          : await errorMessage(res, 'تعذر حذف المهنة.'),
      );
    }
  }

  const activeCount = (data?.items ?? []).filter((i) => i.isActive).length;

  return (
    <div>
      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>إضافة مهنة</h1>
        <p className="note" style={{ marginTop: 0 }}>
          المهنة اللي تضيفها هنا تظهر في منتقي المهن بالتطبيق وتصير قابلة للبحث فوراً — بلا تحديث للتطبيق.
        </p>
        <form onSubmit={handleCreate}>
          <label htmlFor="professionLabel">الاسم العربي</label>
          <input
            id="professionLabel"
            required
            maxLength={60}
            placeholder="مثال: فني ألواح شمسية"
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />

          <label htmlFor="professionSlug">المعرّف (slug)</label>
          <input
            id="professionSlug"
            required
            dir="ltr"
            placeholder="solar_panel_technician"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase() })}
          />
          <p className="note" style={{ marginTop: 4 }}>
            حروف إنجليزية صغيرة وأرقام و_ فقط. ما ينتغيّر بعد الحفظ — محفوظ في ملفات المسجّلين عليه.
          </p>

          <label htmlFor="professionGroup">القسم</label>
          <select
            id="professionGroup"
            required
            value={form.group}
            onChange={(e) => setForm({ ...form, group: e.target.value })}
          >
            <option value="">— اختر القسم —</option>
            {groups.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.label}
              </option>
            ))}
          </select>

          <label htmlFor="professionAliases">صيغ يكتبها الناس (اختياري)</label>
          <input
            id="professionAliases"
            placeholder="ألواح شمسية، طاقة شمسية، سخان شمسي"
            value={form.aliases}
            onChange={(e) => setForm({ ...form, aliases: e.target.value })}
          />
          <p className="note" style={{ marginTop: 4 }}>
            تفصلها بفاصلة. تُستخدم للمطابقة داخل التطبيق حين تنقطع الشبكة فقط. لا تكتب كلمة تعني <b>محلاً</b> (مثل
            «عفش» أو «ميكانيكي») — بتخلي التطبيق يرد على سؤال عن محل بقائمة أشخاص.
          </p>

          <button className="full" type="submit">
            إضافة
          </button>
        </form>
        {formStatus && <div className={`status ${formStatus.type}`}>{formStatus.message}</div>}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>
          المهن ({activeCount} مفعّلة من {data?.items?.length ?? 0})
        </h1>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', margin: '10px 0 14px' }}>
          <input
            style={{ flex: '1 1 220px', margin: 0 }}
            placeholder="ابحث بالاسم أو المعرّف أو الصيغ..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <select
            style={{ flex: '0 1 220px', margin: 0 }}
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
          >
            <option value="">كل الأقسام</option>
            {groups.map((g) => (
              <option key={g.slug} value={g.slug}>
                {g.label}
              </option>
            ))}
          </select>
        </div>

        {data === null && <p className="note">جاري التحميل...</p>}
        {data !== null && visible.length === 0 && <p className="note">ما فيه مهنة تطابق البحث.</p>}

        {visible.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>المهنة</th>
                <th>القسم</th>
                <th>الصيغ</th>
                <th>المسجّلون</th>
                <th>الحالة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) =>
                editing === item.slug ? (
                  <tr key={item.slug}>
                    <td>
                      <input
                        style={{ margin: 0 }}
                        value={draft.label}
                        onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                      />
                      <span className="note" dir="ltr">
                        {item.slug}
                      </span>
                    </td>
                    <td>
                      <select
                        style={{ margin: 0 }}
                        value={draft.group}
                        onChange={(e) => setDraft({ ...draft, group: e.target.value })}
                      >
                        {groups.map((g) => (
                          <option key={g.slug} value={g.slug}>
                            {g.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td colSpan={2}>
                      <input
                        style={{ margin: 0 }}
                        value={draft.aliases}
                        onChange={(e) => setDraft({ ...draft, aliases: e.target.value })}
                      />
                    </td>
                    <td />
                    <td className="actions" style={{ width: 'auto' }}>
                      <button onClick={() => saveEdit(item.slug)}>حفظ</button>
                      <button
                        className="secondary"
                        onClick={() => {
                          setEditing(null);
                          setDraft(null);
                        }}
                      >
                        إلغاء
                      </button>
                    </td>
                  </tr>
                ) : (
                  <tr key={item.slug}>
                    <td>
                      {item.label}
                      <br />
                      <span className="note" dir="ltr">
                        {item.slug}
                      </span>
                    </td>
                    <td>{item.groupLabel}</td>
                    <td style={{ maxWidth: 260 }}>
                      {item.aliases.length ? item.aliases.join('، ') : <span className="note">—</span>}
                    </td>
                    <td>{item.professionalCount}</td>
                    <td>
                      <span className={`badge ${item.isActive ? 'active' : 'suspended'}`}>
                        {item.isActive ? 'مفعّلة' : 'موقوفة'}
                      </span>
                    </td>
                    <td className="actions" style={{ width: 'auto' }}>
                      <button className="secondary" onClick={() => startEdit(item)}>
                        تعديل
                      </button>
                      <button className="secondary" onClick={() => patch(item.slug, { isActive: !item.isActive })}>
                        {item.isActive ? 'إيقاف' : 'تفعيل'}
                      </button>
                      <button className="secondary" onClick={() => remove(item)}>
                        حذف
                      </button>
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
