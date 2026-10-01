// أي مسار غير معروف كان يُصيَّر كصفحة فارغة تماماً: الخادم يرد بقشرة الـSPA
// بنجاح (200)، وReact Router لا يُصيّر شيئاً حين لا يطابق أي <Route> ولا يوجد
// مسار جامع. هذه الصفحة تضمن ألا يرى المستخدم بياضاً أبداً.
const LINKS = [
  { href: '/vendor/login', title: 'لوحة صاحب النشاط' },
  { href: '/owner/login', title: 'لوحة ريكو' },
  { href: '/directory', title: 'الأنشطة التجارية' },
  { href: '/', title: 'الصفحة الرئيسية' },
];

export default function NotFound() {
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 520 }}>
        <h1>الصفحة غير موجودة</h1>
        <p className="subtitle">
          الرابط <code>{window.location.pathname}</code> ما يقابله صفحة. جرّب أحد هذي:
        </p>

        {LINKS.map((l) => (
          <a key={l.href} href={l.href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="place-option" style={{ marginTop: 10, padding: '14px 16px' }}>
              <strong>{l.title}</strong>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
