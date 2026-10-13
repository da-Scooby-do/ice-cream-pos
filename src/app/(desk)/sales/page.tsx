import { Receipt } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, Page, PageHeader, Stat } from "@/components/Page";
import RangePicker from "@/components/RangePicker";
import { money, num } from "@/lib/format";
import { can } from "@/lib/perms";
import { resolveRange } from "@/lib/ranges";
import { listOrders } from "@/lib/server/orders";
import { getShop } from "@/lib/server/shop";
import { listStaff } from "@/lib/server/staff";
import { getSession } from "@/lib/session";
import { shortDate } from "@/lib/time";
import type { Payment } from "@/lib/types";
import SalesTable from "./SalesTable";

export const dynamic = "force-dynamic";
const PAGE = 50;

type SP = { range?: string; from?: string; to?: string; staff?: string; pay?: string; status?: string; page?: string };

export default async function SalesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await getSession();
  if (!can(s, "sales")) redirect("/");
  const sp = await searchParams;
  const r = resolveRange(sp);
  const page = Math.max(1, Number(sp.page) || 1);
  const payment = sp.pay === "cash" || sp.pay === "bank" ? (sp.pay as Payment) : null;
  const status = sp.status === "paid" || sp.status === "void" ? sp.status : null;
  const staff = listStaff();
  const { rows, count, paid, total } = listOrders({
    from: r.from,
    to: r.to,
    staff: sp.staff || null,
    payment,
    status,
    limit: PAGE,
    offset: (page - 1) * PAGE,
  });
  const pages = Math.max(1, Math.ceil(count / PAGE));

  const link = (patch: Partial<SP>) => {
    const q = new URLSearchParams(Object.entries({ ...sp, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `/sales?${q.toString()}`;
  };
  const chip = (active: boolean) =>
    `px-3 py-1.5 rounded-xl text-sm font-semibold ${active ? "bg-ink text-white" : "bg-white ring-1 ring-ink-100"}`;

  return (
    <Page>
      <PageHeader
        title="سجل المبيعات"
        sub={r.from === r.to ? shortDate(r.from) : `${shortDate(r.from)} — ${shortDate(r.to)}`}
        icon={<Receipt size={24} />}
      />
      <RangePicker value={r.key} from={r.from} to={r.to} />

      <div className="flex flex-wrap items-center gap-2">
        <Link href={link({ staff: undefined, page: undefined })} className={chip(!sp.staff)}>
          كل الموظفين
        </Link>
        {staff.map((x) => (
          <Link key={x.id} href={link({ staff: x.id, page: undefined })} className={chip(sp.staff === x.id)}>
            {x.name}
          </Link>
        ))}
        <span className="w-px h-6 bg-ink-200 mx-1" />
        <Link href={link({ pay: undefined, page: undefined })} className={chip(!payment)}>
          كل طرق الدفع
        </Link>
        <Link href={link({ pay: "cash", page: undefined })} className={chip(payment === "cash")}>
          نقدي
        </Link>
        <Link href={link({ pay: "bank", page: undefined })} className={chip(payment === "bank")}>
          تحويل
        </Link>
        <span className="w-px h-6 bg-ink-200 mx-1" />
        <Link href={link({ status: undefined, page: undefined })} className={chip(!status)}>
          الكل
        </Link>
        <Link href={link({ status: "void", page: undefined })} className={chip(status === "void")}>
          الملغاة
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Stat label="عدد الفواتير" value={num(count)} />
        <Stat label="إجمالي المبيعات (بدون الملغاة)" value={money(total)} tone="brand" />
        <Stat label="متوسط الفاتورة" value={money(paid ? total / paid : 0)} />
      </div>

      <Card pad={false}>
        <SalesTable rows={rows} shop={getShop()} canVoid={can(s, "void")} isAdmin={s!.role === "admin"} />
        {pages > 1 && (
          <div className="flex items-center justify-center gap-2 p-4">
            {page > 1 && (
              <Link href={link({ page: String(page - 1) })} className="btn-soft px-4 py-2 text-sm">
                السابق
              </Link>
            )}
            <span className="text-sm text-ink-500 tnum">
              صفحة {num(page)} من {num(pages)}
            </span>
            {page < pages && (
              <Link href={link({ page: String(page + 1) })} className="btn-soft px-4 py-2 text-sm">
                التالي
              </Link>
            )}
          </div>
        )}
      </Card>
    </Page>
  );
}
