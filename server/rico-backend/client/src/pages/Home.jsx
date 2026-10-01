const LINKS = [
  {
    href: '/directory',
    title: 'الأنشطة التجارية',
    desc: 'تصفح كل الأنشطة المسجّلة في ريكو، مع فلترة حسب الفئة.',
  },
  {
    href: '/submit-deal',
    title: 'أضف عرضك',
    desc: 'نموذج عام لأي صاحب نشاط لإرسال عرض/خصم — يخضع للمراجعة قبل النشر.',
  },
  {
    href: '/vendor/login',
    title: 'لوحة صاحب النشاط',
    desc: 'تسجيل الدخول بالبريد الإلكتروني وكلمة المرور لإدارة منتجاتك وخصوماتك وعروضك.',
  },
  {
    href: '/owner/login',
    title: 'لوحة ريكو',
    desc: 'لفريق ريكو الداخلي — مراجعة الأنشطة وطلبات الربط والعروض، والتحليلات.',
  },
];

export default function Home() {
  return (
    <div className="page">
      <div className="card" style={{ maxWidth: 640 }}>
        <h1>لوحة ريكو</h1>
        <p className="subtitle">اختر أين تريد الذهاب.</p>

        {LINKS.map((l) => (
          <a key={l.href} href={l.href} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div className="place-option" style={{ marginTop: 10, padding: '14px 16px' }}>
              <strong>{l.title}</strong>
              <small>{l.desc}</small>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
