"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import styles from "./AdminMaskToggle.module.css";

export default function AdminMaskToggle({ enabled }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function onChange(e) {
    const nextEnabled = e.target.checked;

    startTransition(async () => {
      const res = await fetch("/api/auth/view-as-non-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: nextEnabled })
      });

      if (!res.ok) {
        // Keep it simple: revert the UI on next refresh if something goes wrong.
        router.refresh();
        return;
      }

      router.refresh();
    });
  }

  return (
    <label className={styles.wrap} title="Temporarily hide admin-only UI and permissions">
      <input
        type="checkbox"
        checked={!!enabled}
        onChange={onChange}
        disabled={isPending}
      />
      <span className={styles.label}>
        View as non-admin{enabled ? " (masked)" : ""}
      </span>
    </label>
  );
}
