import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 text-center">
      <h2 className="text-2xl font-bold text-slate-800 mb-2">
        ไม่พบหน้าที่ต้องการ (404)
      </h2>
      <p className="text-sm text-slate-500 mb-4">
        หน้าเว็บที่คุณกำลังเข้าถึงไม่มีอยู่ในระบบ
      </p>
      <Link
        href="/"
        className="rounded-xl bg-[#0066FF] px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 transition"
      >
        กลับหน้าหลัก
      </Link>
    </div>
  );
}
