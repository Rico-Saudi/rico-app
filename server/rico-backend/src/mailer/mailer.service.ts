import { Injectable } from '@nestjs/common';
import { OtpPurpose } from '../customers/schemas/customer-otp.schema';

const SUBJECT_BY_PURPOSE: Record<'invite' | 'reset', string> = {
  invite: 'دعوة لإدارة نشاطك التجاري في ريكو',
  reset: 'إعادة تعيين كلمة المرور - لوحة ريكو',
};

const INTRO_BY_PURPOSE: Record<'invite' | 'reset', string> = {
  invite: 'تمت دعوتك لإدارة نشاطك التجاري على ريكو. اضغط الرابط التالي لتعيين كلمة مرورك (صالح لمدة 24 ساعة):',
  reset: 'اضغط الرابط التالي لإعادة تعيين كلمة مرورك (صالح لمدة 24 ساعة):',
};

const OTP_COPY: Record<OtpPurpose, { subject: (brand: string) => string; intro: string; note: string }> = {
  verify_email: {
    subject: (brand) => `رمز تفعيل حسابك في ${brand}`,
    intro: 'رمز تفعيل حسابك هو:',
    note: 'إذا ما أنشأت حساباً، تجاهل هذه الرسالة ولن يُفعّل أي حساب.',
  },
  reset_password: {
    subject: (brand) => `رمز إعادة تعيين كلمة المرور في ${brand}`,
    intro: 'رمز إعادة تعيين كلمة المرور هو:',
    note: 'إذا ما طلبت إعادة التعيين، تجاهل هذه الرسالة وكلمة مرورك تبقى كما هي.',
  },
};

// Everything interpolated into an email body below is user-typed (a display
// name, a job description), so it is escaped rather than trusted — an email
// client renders the HTML we send it.
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Brand green + gold, matching the app's theme — the email is the first
// thing a new user sees outside the app, so it shouldn't look like a
// different product.
function otpHtml({ brandName, greeting, intro, code, minutes, note }: {
  brandName: string;
  greeting: string;
  intro: string;
  code: string;
  minutes: number;
  note: string;
}): string {
  return `<div dir="rtl" style="margin:0;padding:24px;background:#FAF8F5;font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;color:#39424B">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E3DA;border-radius:18px;overflow:hidden">
    <div style="background:#006C35;padding:18px 22px;color:#FFFFFF;font-size:17px;font-weight:700">${brandName}</div>
    <div style="padding:24px 22px">
      <p style="margin:0 0 12px;font-size:15px;color:#131A20">${greeting}</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7">${intro}</p>
      <div style="margin:0 0 16px;padding:16px;background:#EBF4EF;border:1px solid #D7E8DE;border-radius:12px;text-align:center">
        <span style="font-size:30px;font-weight:700;letter-spacing:8px;color:#00532A;direction:ltr;display:inline-block">${code}</span>
      </div>
      <p style="margin:0 0 6px;font-size:13px;color:#6E7883">الرمز صالح لمدة ${minutes} دقائق فقط.</p>
      <p style="margin:0;font-size:13px;color:#6E7883">${note}</p>
    </div>
    <div style="border-top:1px solid #E8E3DA;padding:14px 22px;font-size:12px;color:#A0A8B1">${brandName} — لا ترد على هذه الرسالة.</div>
  </div>
</div>`;
}

// Sends invite/password-reset emails via Resend. If RESEND_API_KEY isn't set
// (local dev), falls back to logging the link to the console instead of
// failing — lets the whole auth flow be tested end-to-end without a real
// email account. Requires a verified sending domain (SPF/DKIM/DMARC) in
// production for links to reliably land in inboxes, not spam.
@Injectable()
export class MailerService {
  async sendPasswordSetupEmail({
    email,
    link,
    purpose,
  }: {
    email: string;
    link: string;
    purpose: 'invite' | 'reset';
  }): Promise<void> {
    await this.send({
      email,
      subject: SUBJECT_BY_PURPOSE[purpose],
      html: `<p>مرحباً،</p><p>${INTRO_BY_PURPOSE[purpose]}</p><p><a href="${link}">${link}</a></p><p>إذا لم تطلب هذا، تجاهل هذه الرسالة.</p>`,
      devLine: `${purpose} link for ${email}: ${link}`,
    });
  }

  // The app's own email verification / password reset. Unlike the dashboard
  // emails this carries a code, not a link: the recipient is on a phone with
  // the app already open, so typing six digits back into it beats bouncing
  // through a browser that can't hand the session back to the app.
  async sendOtpEmail({
    email,
    name,
    code,
    purpose,
    brandName,
    ttlMinutes,
  }: {
    email: string;
    name: string;
    code: string;
    purpose: OtpPurpose;
    brandName: string;
    ttlMinutes: number;
  }): Promise<void> {
    const copy = OTP_COPY[purpose];
    await this.send({
      email,
      subject: copy.subject(brandName),
      html: otpHtml({
        brandName,
        greeting: `هلا ${escapeHtml(name)}،`,
        intro: copy.intro,
        code,
        minutes: ttlMinutes,
        note: copy.note,
      }),
      devLine: `${purpose} code for ${email}: ${code}`,
    });
  }

  // A customer asked this tradesperson to call them. The lead is already
  // saved and visible in their in-app inbox before this is attempted — the
  // email is a nudge, not the delivery mechanism, which is why
  // ProfessionalsService treats a failure here as a warning and moves on.
  async sendProfessionalRequestEmail({
    to,
    professionalName,
    customerName,
    customerPhone,
    professionLabel,
    note,
    brandName,
  }: {
    to: string;
    professionalName: string;
    customerName: string;
    customerPhone: string;
    professionLabel: string;
    note: string | null;
    brandName: string;
  }): Promise<void> {
    const safeCustomer = escapeHtml(customerName);
    const safePhone = escapeHtml(customerPhone);
    await this.send({
      email: to,
      subject: `طلب جديد من عميل في ${brandName}`,
      html: `<div dir="rtl" style="margin:0;padding:24px;background:#FAF8F5;font-family:'IBM Plex Sans Arabic',Tahoma,Arial,sans-serif;color:#39424B">
  <div style="max-width:480px;margin:0 auto;background:#FFFFFF;border:1px solid #E8E3DA;border-radius:18px;overflow:hidden">
    <div style="background:#006C35;padding:18px 22px;color:#FFFFFF;font-size:17px;font-weight:700">${brandName}</div>
    <div style="padding:24px 22px">
      <p style="margin:0 0 12px;font-size:15px;color:#131A20">هلا ${escapeHtml(professionalName)}،</p>
      <p style="margin:0 0 16px;font-size:15px;line-height:1.7">وصلك طلب جديد على مهنتك (${escapeHtml(professionLabel)}):</p>
      <div style="margin:0 0 16px;padding:16px;background:#EBF4EF;border:1px solid #D7E8DE;border-radius:12px">
        <p style="margin:0 0 6px;font-size:15px;font-weight:700;color:#00532A">${safeCustomer}</p>
        <p style="margin:0;font-size:15px;color:#00532A;direction:ltr;text-align:right">${safePhone}</p>
        ${note ? `<p style="margin:10px 0 0;font-size:14px;line-height:1.7;color:#39424B">${escapeHtml(note)}</p>` : ''}
      </div>
      <p style="margin:0;font-size:13px;color:#6E7883">تواصل معه مباشرة على رقمه، وتلقى الطلب كمان داخل التطبيق.</p>
    </div>
    <div style="border-top:1px solid #E8E3DA;padding:14px 22px;font-size:12px;color:#A0A8B1">${brandName} — لا ترد على هذه الرسالة.</div>
  </div>
</div>`,
      devLine: `professional request for ${to}: ${customerName} ${customerPhone}`,
    });
  }

  private async send({
    email,
    subject,
    html,
    devLine,
  }: {
    email: string;
    subject: string;
    html: string;
    devLine: string;
  }): Promise<void> {
    const apiKey = process.env.RESEND_API_KEY;

    if (!apiKey) {
      console.log(`[dev email fallback] ${devLine}`);
      return;
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM_EMAIL || 'Rico <onboarding@resend.dev>',
        to: [email],
        subject,
        html,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`resend_error:${response.status}:${text.slice(0, 200)}`);
    }
  }
}
