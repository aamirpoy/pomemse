import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Lang = "en" | "ar";

const AR: Record<string, string> = {
  "My time": "وقتي",
  "Admin": "الإدارة",
  "Sign out": "تسجيل الخروج",
  "Check in": "تسجيل الدخول",
  "Check out": "تسجيل الخروج",
  "check in": "تسجيل الدخول",
  "check out": "تسجيل الخروج",
  "Add a note if needed (e.g. reason for being late or leaving early). You can skip this.": "أضف ملاحظة إذا لزم الأمر (مثل سبب التأخير أو المغادرة المبكرة). يمكنك التخطي.",
  "Optional note…": "ملاحظة اختيارية…",
  "Skip": "تخطي",
  "Save note &": "حفظ الملاحظة و",
  "Going out for work": "الخروج للعمل",
  "Where are you going? (e.g. client meeting, site visit). Your hours keep counting.": "إلى أين تذهب؟ (مثل اجتماع عميل أو زيارة موقع). ساعاتك تستمر في الاحتساب.",
  "Reason…": "السبب…",
  "Cancel": "إلغاء",
  "Go out": "خروج",
  "Registered device": "الجهاز المسجل",
  "Could not load device approval.": "تعذر تحميل حالة الجهاز.",
  "Checking approval…": "جارٍ التحقق…",
  "Approved": "تمت الموافقة",
  "Waiting for admin approval": "بانتظار موافقة المسؤول",
  "Blocked — contact your admin": "محظور — تواصل مع المسؤول",
  "Not registered": "غير مسجل",
  "Retry": "إعادة المحاولة",
  "Register this device": "تسجيل هذا الجهاز",
  "Set up face / fingerprint": "إعداد الوجه / البصمة",
  "Your admin requires face or fingerprint verification at check-in. Set it up once on this device.": "يتطلب المسؤول التحقق بالوجه أو البصمة عند تسجيل الدخول. قم بإعداده مرة واحدة على هذا الجهاز.",
  "Set up now": "إعداد الآن",
  "Checked in at": "سجلت الدخول الساعة",
  "so far": "حتى الآن",
  "Hi": "مرحباً",
  "there": "بك",
  "you're not checked in.": "لم تسجل الدخول بعد.",
  "Out for work since": "خارج للعمل منذ",
  "Back in office": "العودة إلى المكتب",
  "Going out for work / meeting": "الخروج للعمل / اجتماع",
  "Please wait…": "يرجى الانتظار…",
  "Today": "اليوم",
  "This week": "هذا الأسبوع",
  "Last 30 days": "آخر 30 يوماً",
  "My timesheet": "سجل دوامي",
  "No records yet. Check in when you arrive at the office.": "لا توجد سجلات بعد. سجل الدخول عند وصولك إلى المكتب.",
  "now": "الآن",
  "Note from": "ملاحظة من",
  "Language": "اللغة",
  "Checked in. Have a good day!": "تم تسجيل الدخول. يوماً سعيداً!",
  "Checked out. See you next time!": "تم تسجيل الخروج. نراك لاحقاً!",
  "Welcome back!": "مرحباً بعودتك!",
  "Marked as out for work. Your hours keep counting.": "تم تسجيلك خارجاً للعمل. ساعاتك تستمر في الاحتساب.",
  "Please allow location access.": "يرجى السماح بالوصول إلى الموقع.",
  "Please allow location access to check in.": "يرجى السماح بالوصول إلى الموقع لتسجيل الدخول.",
  "This device is already approved.": "هذا الجهاز معتمد بالفعل.",
  "Device sent to your admin for approval.": "تم إرسال الجهاز إلى المسؤول للموافقة.",
  "Face / fingerprint set up on this device.": "تم إعداد الوجه / البصمة على هذا الجهاز.",
  "Setup cancelled.": "تم إلغاء الإعداد.",
  "You must be at the office to check in or out.": "يجب أن تكون في المكتب لتسجيل الدخول أو الخروج.",
};

type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (s: string) => string; locale: string };
const LangCtx = createContext<Ctx>({ lang: "en", setLang: () => {}, t: (s) => s, locale: "en-GB" });

export function translate(lang: Lang, s: string) {
  return lang === "ar" ? AR[s] ?? s : s;
}

/** `enabled` comes from the employee's testing-version access; when off, English is forced. */
export function LanguageProvider({ enabled, children }: { enabled: boolean; children: ReactNode }) {
  const [saved, setSaved] = useState<Lang>("en");
  useEffect(() => { if (localStorage.getItem("pome-lang") === "ar") setSaved("ar"); }, []);
  const lang: Lang = enabled ? saved : "en";
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    return () => { document.documentElement.lang = "en"; document.documentElement.dir = "ltr"; };
  }, [lang]);
  const setLang = (l: Lang) => { localStorage.setItem("pome-lang", l); setSaved(l); };
  return (
    <LangCtx.Provider value={{ lang, setLang, t: (s) => translate(lang, s), locale: lang === "ar" ? "ar-AE" : "en-GB" }}>
      {children}
    </LangCtx.Provider>
  );
}

export const useLang = () => useContext(LangCtx);
