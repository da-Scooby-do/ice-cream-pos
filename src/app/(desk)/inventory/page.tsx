import { Boxes, ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Page, PageHeader } from "@/components/Page";
import { PrintButton } from "@/components/PrintHost";
import { StockMonthSlip } from "@/components/slips";
import { canAny, can } from "@/lib/perms";
import { stockMonth } from "@/lib/server/reports";
import { currentShift } from "@/lib/server/shifts";
import { getShop } from "@/lib/server/shop";
import { stockLevels } from "@/lib/server/stock";
import { getSession } from "@/lib/session";
import { addMonths, isMonth, localDate, monthLabel, monthOf } from "@/lib/time";
import { LedgerTable, RestockTable, StockBoard } from "./StockBoard";

export const dynamic = "force-dynamic";

type SP = { tab?: string; m?: string };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<SP> }) {
  const s = await getSession();
  if (!canAny(s, ["stock_add", "stock_edit", "products"])) redirect("/");
  const sp = await searchParams;
  const tab = sp.tab === "restocks" || sp.tab === "ledger" ? sp.tab : "levels";
  const now = monthOf(localDate());
  const ym = isMonth(sp.m) ? sp.m : now;

  const tabLink = (t: string, label: string) => (
    <Link
      href={`/inventory?tab=${t}&m=${ym}`}
      className={`px-4 py-2 rounded-xl text-sm font-semibold ${tab === t ? "bg-white shadow-sm" : "text-ink-500"}`}
    >
      {label}
    </Link>
  );
  const monthNav = (
    <div className="flex items-center gap-1.5">
      <Link href={`/inventory?tab=${tab}&m=${addMonths(ym, -1)}`} className="btn-soft px-3 py-2" aria-label="الشهر السابق">
        <ChevronRight size={18} />
      </Link>
      <span className="font-bold px-2">{monthLabel(ym)}</span>
      {ym < now ? (
        <Link href={`/inventory?tab=${tab}&m=${addMonths(ym, 1)}`} className="btn-soft px-3 py-2" aria-label="الشهر التالي">
          <ChevronLeft size={18} />
        </Link>
      ) : (
        <span className="btn-soft px-3 py-2 opacity-30">
          <ChevronLeft size={18} />
        </span>
      )}
    </div>
  );

  const month = tab === "levels" ? null : stockMonth(ym);

  return (
    <Page>
      <PageHeader
        title="المخزون"
        sub="الكميات الحالية، التوريدات بتاريخها، وحركة المخزون في الشهر"
        icon={<Boxes size={24} />}
        actions={
          month && tab === "ledger" ? (
            <PrintButton slip={<StockMonthSlip m={month} shop={getShop()} />} label="طباعة جرد الشهر" />
          ) : null
        }
      />
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-2xl bg-ink-100/70 p-1 gap-1">
          {tabLink("levels", "المخزون الحالي")}
          {tabLink("restocks", "التوريدات")}
          {tabLink("ledger", "حركة الشهر")}
        </div>
        {tab !== "levels" && monthNav}
      </div>

      {tab === "levels" && (
        <StockBoard
          items={stockLevels()}
          canAdd={can(s, "stock_add")}
          canEdit={can(s, "stock_edit")}
          shiftOpen={!!currentShift()}
        />
      )}
      {tab === "restocks" && month && <RestockTable rows={month.restocks} />}
      {tab === "ledger" && month && <LedgerTable rows={month.items} />}
    </Page>
  );
}
