import { useCallback, useEffect, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";

export type UpdateStatus = "idle" | "checking" | "available" | "downloading" | "ready" | "error";

// Drives the in-app updater: checks GitHub releases once on launch, and downloads +
// installs + relaunches when the user accepts. check() throws in dev builds and on
// releases that aren't signed/configured yet — those are swallowed (update stays null),
// so the banner only ever appears for a real, verified update.
export function useUpdater() {
  const [update, setUpdate] = useState<Update | null>(null);
  const [status, setStatus] = useState<UpdateStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  const runCheck = useCallback(async () => {
    setStatus("checking");
    setError(null);
    try {
      const found = await check();
      if (found) {
        setUpdate(found);
        setStatus("available");
      } else {
        setStatus("idle");
      }
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const install = useCallback(async () => {
    if (!update) return;
    setStatus("downloading");
    setError(null);
    try {
      await update.downloadAndInstall();
      setStatus("ready");
      await relaunch();
    } catch (e) {
      setStatus("error");
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [update]);

  useEffect(() => {
    void runCheck();
  }, [runCheck]);

  return { update, status, error, runCheck, install };
}
