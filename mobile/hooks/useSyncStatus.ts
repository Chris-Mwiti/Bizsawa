import { useEffect, useState } from "react";
import { database } from "../db/database";
import { Q } from "@nozbe/watermelondb";

export type SyncStatus = "synced" | "pending" | "conflict" | "failed";

// Maps Watermelon _status + conflicts table to UI badge (§3.5, §4)
export function useSyncStatus(table: string, recordId: string): SyncStatus {
  const [status, setStatus] = useState<SyncStatus>("synced");
  useEffect(() => {
    let unsubConflicts: any;
    let unsubRecord: any;
    const check = async () => {
      try {
        // Check conflicts first
        const confCol: any = (database as any).get("conflicts");
        const conflicts = await confCol.query(Q.where("record_id", recordId), Q.where("table_name", table)).fetch() as any[];
        const hasConflict = conflicts.some((c: any) => !c.resolution);
        if (hasConflict) {
          setStatus("conflict");
          return;
        }
        // Check Watermelon _status (created/updated/deleted vs synced)
        const rec: any = await (database as any).get(table).find(recordId).catch(() => null);
        if (!rec) { setStatus("synced"); return; }
        const rawStatus = rec._raw._status as string;
        if (rawStatus === "created" || rawStatus === "updated" || rawStatus === "deleted") {
          setStatus("pending");
        } else {
          setStatus("synced");
        }
      } catch {
        setStatus("synced");
      }
    };
    check();
    // Observe conflicts for this record
    const confCol: any = (database as any).get("conflicts");
    unsubConflicts = confCol.query(Q.where("record_id", recordId)).observe().subscribe(() => check());
    // Observe record
    (async () => {
      try {
        const rec: any = await (database as any).get(table).find(recordId);
        unsubRecord = rec.observe().subscribe(() => check());
      } catch {}
    })();
    return () => {
      unsubConflicts?.unsubscribe?.();
      unsubRecord?.unsubscribe?.();
    };
  }, [table, recordId]);
  return status;
}

export function useHasConflicts(): boolean {
  const [has, setHas] = useState(false);
  useEffect(() => {
    const col: any = (database as any).get("conflicts");
    const sub = col.query(Q.where("resolution", null)).observe().subscribe((rows: any[]) => setHas(rows.length > 0));
    return () => sub.unsubscribe();
  }, []);
  return has;
}
