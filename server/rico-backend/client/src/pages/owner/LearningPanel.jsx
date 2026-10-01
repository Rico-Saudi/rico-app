import { useState, useEffect, useCallback } from 'react';
import { errorMessage, CATEGORY_LABELS } from './api';

const GAP_STATUS_LABELS = {
  open: 'بانتظار حل',
  proposed: 'فيه اقتراح',
  taught: 'اتعلّمه ريكو',
  ignored: 'متجاهَل',
};

const KIND_LABELS = {
  example: 'مثال تعليمي',
  profession: 'مهنة جديدة',
  skip: 'خارج نطاق ريكو',
};

const DIALECT_LABELS = { any: 'كل اللهجات', saudi: 'سعودي', jordanian: 'أردني' };

// أسباب فشل جولة التدريب، بلغة صاحب اللوحة. الأكواد جاية من LlmService
// عبر TrainingRun.error — عرضها خام («server_misconfigured») بيخلّي المالك
// يشوف عطلاً ما بيعرف شو يعمل فيه، مع إن أغلبها إعدادات بيقدر يصلّحها.
const RUN_ERRORS = {
  server_misconfigured: 'ما في مفتاح نموذج مضبوط على الخادم — التدريب محتاج LLM. ظبّط GROQ_API_KEY (أو OPENROUTER_API_KEY مع LLM_PROVIDER=openrouter) وأعد تشغيل الخادم.',
  upstream_unreachable: 'ما وصلنا لمزوّد النموذج — تأكد من الشبكة وجرّب كمان شوي.',
  upstream_error: 'مزوّد النموذج رجّع خطأ.',
  parse_error: 'النموذج ردّ بإشي مش JSON. جرّب كمان مرة؛ إذا تكررت، المشكلة بالموديل المختار.',
};

// أخطاء المزوّد اللي بنعرف نميّزها بحالة HTTP. الفرق مهم: حد الاستهلاك
// بيزول لحاله بعد شوي، أما المفتاح المرفوض فبده تدخّل.
const UPSTREAM_STATUS_ERRORS = {
  401: 'مفتاح النموذج مرفوض — تأكد إنه صحيح وما انسحب.',
  403: 'المفتاح ما إله صلاحية على هذا الموديل.',
  429: 'تجاوزت حد الاستهلاك عند مزوّد النموذج (توكنات اليوم أو الدقيقة). استنى شوي وجرّب، أو رقّي الخطة.',
  500: 'عطل عند مزوّد النموذج نفسه — جرّب كمان شوي.',
  503: 'مزوّد النموذج مشغول هلأ — جرّب كمان شوي.',
};

const ERRORS = {
  lesson_already_reviewed: 'الاقتراح انراجع من قبل — حدّث الصفحة.',
  lesson_teaches_nothing: 'الاقتراح ما فيه لا بحث ولا رد — ما في إشي يتعلّمه.',
  profession_proposal_incomplete: 'بيانات المهنة ناقصة.',
  gap_not_found: 'السؤال مش موجود.',
};

/** يترجم نية واحدة لجملة عربية، بدل ما نعرض JSON على عين المالك. */
function describeIntent(intent) {
  if (intent.kind === 'deals') return `🔥 عروض${intent.label ? ` — ${intent.label}` : ''}`;
  if (intent.kind === 'professional') return `🔧 صاحب مهنة — ${intent.label || intent.profession}`;
  if (intent.kind === 'order') return `🧾 طلب من «${intent.placeName}»`;
  const category = intent.category === 'other' ? intent.label : CATEGORY_LABELS[intent.category] || intent.category;
  const rank = { cheapest: ' (الأرخص)', open_now: ' (مفتوح الآن)', best_rated: ' (الأعلى تقييماً)' }[intent.rank] || '';
  return `📍 ${category}${rank}${intent.brandHint ? ` — ${intent.brandHint}` : ''}`;
}

function timeAgo(iso) {
  if (!iso) return '—';
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `قبل ${minutes} دقيقة`;
  if (minutes < 1440) return `قبل ${Math.round(minutes / 60)} ساعة`;
  return `قبل ${Math.round(minutes / 1440)} يوم`;
}

/**
 * شو ما فهمه ريكو، وشو تعلّمه منه.
 *
 * ريكو ما ينعمله fine-tune — يشتغل ببرومبت وقوائم. فـ"التدريب" هنا: كل
 * فترة يقرأ الأسئلة اللي فشل فيها، ويقترح لكل وحدة حلاً (مثال تعليمي،
 * مهنة جديدة، أو "هذا خارج نطاقي")، والمالك يوافق بضغطة — والدرس ينزرع
 * ببرومبت ريكو خلال ثوانٍ، على الجوالات المنصّبة أصلاً وبلا إصدار جديد.
 *
 * الموافقة يدوية بالقصد: البرومبت صوت ريكو عند كل مستخدم، ومثال غلط
 * يعلّمه يرد غلط على الكل.
 */
export default function LearningPanel({ authedFetch }) {
  const [stats, setStats] = useState(null);
  const [proposals, setProposals] = useState(null);
  const [taught, setTaught] = useState([]);
  const [gaps, setGaps] = useState(null);
  const [gapTotal, setGapTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('open');
  const [query, setQuery] = useState('');
  const [drafts, setDrafts] = useState({}); // lessonId → تعديلات المالك قبل الموافقة
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const limit = 25;

  const load = useCallback(async () => {
    const [statsRes, pendingRes, approvedRes] = await Promise.all([
      authedFetch('/owner/learning/stats'),
      authedFetch('/owner/learning/lessons?status=pending'),
      authedFetch('/owner/learning/lessons?status=approved'),
    ]);
    if (!statsRes || !pendingRes || !approvedRes) return;
    setStats(await statsRes.json());
    setProposals(await pendingRes.json());
    setTaught((await approvedRes.json()).filter((l) => l.kind === 'example'));
  }, [authedFetch]);

  const loadGaps = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), limit: String(limit) });
    if (statusFilter) params.set('status', statusFilter);
    if (query.trim()) params.set('q', query.trim());

    const res = await authedFetch(`/owner/learning/gaps?${params}`);
    if (!res) return;
    const data = await res.json();
    setGaps(data.items || []);
    setGapTotal(data.total || 0);
  }, [authedFetch, page, statusFilter, query]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadGaps();
  }, [loadGaps]);

  async function post(path, body) {
    setBusy(true);
    setMessage(null);
    const res = await authedFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    setBusy(false);
    if (!res) return null;
    if (!res.ok) {
      const parsed = await res.clone().json().catch(() => null);
      setMessage({ type: 'error', text: ERRORS[parsed?.error] || (await errorMessage(res, 'ما زبط الإجراء.')) });
      return null;
    }
    await Promise.all([load(), loadGaps()]);
    return res.json();
  }

  async function train() {
    const run = await post('/owner/learning/train');
    if (!run) return;
    if (run.skipped) return setMessage({ type: 'error', text: 'في جولة تدريب شغّالة هلأ — استنى تخلص.' });
    setMessage({
      type: run.error ? 'error' : 'success',
      text: run.error
        ? `فشلت الجولة — ${UPSTREAM_STATUS_ERRORS[run.errorStatus] || RUN_ERRORS[run.error] || run.error}`
        : `قرأ ريكو ${run.gapsConsidered} سؤال وطلع منها ${run.proposalsCreated} اقتراح.`,
    });
  }

  async function approve(lesson) {
    const edits = drafts[lesson._id] || {};
    const approved = await post(`/owner/learning/lessons/${lesson._id}/approve`, edits);
    if (approved) {
      setDrafts((d) => ({ ...d, [lesson._id]: undefined }));
      setMessage({
        type: 'success',
        text:
          lesson.kind === 'profession'
            ? `أُضيفت «${lesson.profession?.label}» لقائمة المهن — صارت قابلة للبحث بالتطبيق على طول.`
            : lesson.kind === 'skip'
              ? 'تمام — هالأسئلة ما رح تظهر بالطابور مرة ثانية.'
              : 'اتعلّمها ريكو — صارت ببرومبته من هلأ، بلا إصدار جديد.',
      });
    }
  }

  async function setGapStatus(gap, status) {
    setBusy(true);
    const res = await authedFetch(`/owner/learning/gaps/${gap._id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setBusy(false);
    if (res?.ok) loadGaps();
  }

  const totalPages = Math.max(1, Math.ceil(gapTotal / limit));
  const draftOf = (lesson) => drafts[lesson._id] || {};
  const setDraft = (lesson, patch) =>
    setDrafts((d) => ({ ...d, [lesson._id]: { ...(d[lesson._id] || {}), ...patch } }));

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{stats?.openAsks ?? '—'}</div>
          <div className="stat-label">سؤال ما فهمه ريكو، لسا بلا حل</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{proposals?.length ?? '—'}</div>
          <div className="stat-label">اقتراح بانتظار موافقتك</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">
            {stats ? `${stats.approvedExamples}/${stats.promptCapacity}` : '—'}
          </div>
          <div className="stat-label">درس فعّال ببرومبت ريكو</div>
        </div>
        <div className="stat-card">
          <div className="stat-value" style={{ fontSize: 17 }}>{timeAgo(stats?.lastRun?.createdAt)}</div>
          <div className="stat-label">آخر جولة تدريب</div>
        </div>
      </div>

      <div className="owner-wide-card">
        <div className="owner-toolbar" style={{ marginBottom: 0 }}>
          <div>
            <h1 style={{ fontSize: 17, margin: 0 }}>تدريب ريكو</h1>
            <p className="note" style={{ marginTop: 8 }}>
              ريكو يقرأ الأسئلة اللي فشل فيها ويقترح لكل وحدة حلاً. ما شي بيوصل مستخدماً قبل موافقتك — ولمّا
              توافق، الدرس يصير ببرومبته خلال ثواني، على الجوالات المنصّبة أصلاً وبلا إصدار جديد.
            </p>
          </div>
          <button type="button" disabled={busy} onClick={train}>
            {busy ? 'شغّال...' : 'درّب ريكو الآن'}
          </button>
        </div>
        {message && <p className={`status ${message.type}`}>{message.text}</p>}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>اقتراحات بانتظار موافقتك ({proposals?.length ?? 0})</h1>
        {proposals === null && <p className="note">جاري التحميل...</p>}
        {proposals?.length === 0 && (
          <p className="note">ما في اقتراحات. اضغط «درّب ريكو الآن» إذا كان في أسئلة بانتظار حل.</p>
        )}

        {proposals?.map((lesson) => (
          <div key={lesson._id} style={{ borderTop: '1px solid #EEE', paddingTop: 14, marginTop: 14 }}>
            <div className="row">
              <span className={`badge ${lesson.kind === 'skip' ? 'rejected' : 'pending_review'}`}>
                {KIND_LABELS[lesson.kind] || lesson.kind}
              </span>
              <span style={{ fontSize: 12.5, color: '#888' }}>
                يغطي {lesson.coverage} سؤال · {DIALECT_LABELS[lesson.dialect] || lesson.dialect}
              </span>
            </div>

            {lesson.note && <p className="note" style={{ marginTop: 8 }}>{lesson.note}</p>}

            {lesson.kind === 'example' && (
              <>
                <label htmlFor={`msg-${lesson._id}`}>صياغة المستخدم</label>
                <input
                  id={`msg-${lesson._id}`}
                  maxLength={300}
                  value={draftOf(lesson).message ?? lesson.message}
                  onChange={(e) => setDraft(lesson, { message: e.target.value })}
                />

                {lesson.intents?.length > 0 ? (
                  <p style={{ fontSize: 14, marginTop: 10 }}>
                    <strong>ريكو رح يرد بـ:</strong>{' '}
                    {lesson.intents.map((i, n) => (
                      <span key={n} style={{ marginInlineEnd: 10 }}>{describeIntent(i)}</span>
                    ))}
                  </p>
                ) : (
                  <>
                    <label htmlFor={`reply-${lesson._id}`}>الرد (بدون بحث)</label>
                    <textarea
                      id={`reply-${lesson._id}`}
                      rows={2}
                      maxLength={600}
                      value={draftOf(lesson).reply ?? lesson.reply ?? ''}
                      onChange={(e) => setDraft(lesson, { reply: e.target.value })}
                    />
                  </>
                )}
              </>
            )}

            {lesson.kind === 'profession' && (
              <p style={{ fontSize: 14, marginTop: 10 }}>
                🔧 <strong>{lesson.profession?.label}</strong> <span dir="ltr">({lesson.profession?.slug})</span>
                {lesson.profession?.aliases?.length > 0 && (
                  <span style={{ color: '#888' }}> · صياغات: {lesson.profession.aliases.join('، ')}</span>
                )}
              </p>
            )}

            {lesson.kind === 'skip' && (
              <p style={{ fontSize: 14, marginTop: 10 }}>
                «{lesson.message}» — الموافقة معناها: لا تعرض هالأسئلة عليّ مرة ثانية.
              </p>
            )}

            <div className="actions">
              <button type="button" disabled={busy} onClick={() => approve(lesson)}>
                {lesson.kind === 'profession' ? 'أضف المهنة' : lesson.kind === 'skip' ? 'تجاهلها' : 'علّمها لريكو'}
              </button>
              <button
                className="secondary"
                type="button"
                disabled={busy}
                onClick={() => post(`/owner/learning/lessons/${lesson._id}/reject`)}
              >
                رفض
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="owner-wide-card">
        <div className="owner-toolbar">
          <h1 style={{ fontSize: 17, margin: 0 }}>الأسئلة اللي ما فهمها ريكو ({gapTotal})</h1>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              placeholder="دوّر بالأسئلة..."
              value={query}
              onChange={(e) => {
                setPage(1);
                setQuery(e.target.value);
              }}
            />
            <select
              value={statusFilter}
              onChange={(e) => {
                setPage(1);
                setStatusFilter(e.target.value);
              }}
            >
              <option value="">كل الحالات</option>
              {Object.entries(GAP_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        {gaps === null && <p className="note">جاري التحميل...</p>}
        {gaps?.length === 0 && <p className="note">ما في أسئلة بهاي الحالة.</p>}
        {gaps?.length > 0 && (
          <table>
            <thead>
              <tr><th>السؤال</th><th>تكرر</th><th>آخر مرة</th><th>الحالة</th><th /></tr>
            </thead>
            <tbody>
              {gaps.map((gap) => (
                <tr key={gap._id}>
                  <td>
                    {gap.message}
                    {gap.variants?.length > 1 && (
                      <small style={{ display: 'block', color: '#888' }}>
                        وصيغ ثانية: {gap.variants.filter((v) => v !== gap.message).join(' · ')}
                      </small>
                    )}
                  </td>
                  <td>{gap.count}</td>
                  <td>{timeAgo(gap.lastSeenAt)}</td>
                  <td>
                    <span className={`badge ${gap.status === 'taught' ? 'active' : gap.status === 'ignored' ? 'rejected' : 'pending_review'}`}>
                      {GAP_STATUS_LABELS[gap.status] || gap.status}
                    </span>
                  </td>
                  <td>
                    {gap.status === 'ignored' ? (
                      <button className="secondary" type="button" disabled={busy} onClick={() => setGapStatus(gap, 'open')}>
                        رجّعه
                      </button>
                    ) : (
                      <button className="secondary" type="button" disabled={busy} onClick={() => setGapStatus(gap, 'ignored')}>
                        تجاهل
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {gapTotal > limit && (
          <div className="pagination">
            <button className="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>السابق</button>
            <span>{page} / {totalPages}</span>
            <button className="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>التالي</button>
          </div>
        )}
      </div>

      <div className="owner-wide-card">
        <h1 style={{ fontSize: 17 }}>دروس ريكو الفعّالة ({taught.length})</h1>
        <p className="note" style={{ marginTop: 0 }}>
          هاي الأمثلة موجودة ببرومبت ريكو هلأ. سحب أي وحدة يشيلها من البرومبت فوراً.
        </p>
        {taught.length === 0 && <p className="note">ما تعلّم ريكو ولا درس بعد.</p>}
        {taught.length > 0 && (
          <table>
            <thead>
              <tr><th>الرسالة</th><th>الناتج</th><th>اللهجة</th><th /></tr>
            </thead>
            <tbody>
              {taught.map((lesson) => (
                <tr key={lesson._id}>
                  <td>{lesson.message}</td>
                  <td>
                    {lesson.intents?.length
                      ? lesson.intents.map((i, n) => <div key={n}>{describeIntent(i)}</div>)
                      : `💬 ${lesson.reply}`}
                  </td>
                  <td>{DIALECT_LABELS[lesson.dialect] || lesson.dialect}</td>
                  <td>
                    <button
                      className="secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => post(`/owner/learning/lessons/${lesson._id}/retire`)}
                    >
                      اسحبه
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
