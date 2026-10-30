import { all, get, nowIso, run, tx } from "@/lib/db/sqlite";
import { makeBackup } from "./backup";
import { queueReportsFor, syncSoon } from "./sync";

// مسح بيانات التجربة | clear the test data before the shop starts for real.
//
// Removes every sale, shift, income/expense and stock movement, and gives back
// to stock what the test sales took. Products, flavors, prices, staff, stock
// items and settings stay. A backup is made first, so it can be undone from
// «النسخ الاحتياطي». Receipt numbers start again from 1.

export type ClearResult = { orders: number; shifts: number; money: number; backup: string };

export async function clearTestData(): Promise<ClearResult> {
  const backup = await makeBackup("manual");
  const count = (t: string) => Number(get<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t}`)!.n);
  const res = { orders: count("orders"), shifts: count("shifts"), money: count("money_entries"), backup: backup.file };
  // the days the phone reports show, so they are published again (empty)
  const dates = all<{ d: string }>(
    `SELECT business_date AS d FROM shifts UNION SELECT business_date FROM orders
     UNION SELECT business_date FROM money_entries UNION SELECT business_date FROM stock_moves`
  ).map((r) => r.d);

  tx(() => {
    // what the test sales took (and voids gave back) returns to stock
    run(`UPDATE stock_items
         SET qty = ROUND(qty - (SELECT COALESCE(SUM(delta), 0) FROM stock_moves m
                               WHERE m.stock_item_id = stock_items.id AND m.reason IN ('sale', 'void')), 3),
             updated_at = $now
         WHERE id IN (SELECT stock_item_id FROM stock_moves WHERE reason IN ('sale', 'void'))`, { now: nowIso() });
    run("DELETE FROM stock_moves");
    run("DELETE FROM order_items");
    run("DELETE FROM orders");
    run("DELETE FROM money_entries");
    run("DELETE FROM shifts");
  });

  queueReportsFor(dates);
  syncSoon();
  return res;
}
