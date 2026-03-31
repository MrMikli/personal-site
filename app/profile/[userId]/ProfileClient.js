"use client";

import { useMemo, useState } from "react";
import UserRollsClient from "./UserRollsClient";
import styles from "./page.module.css";

function SettingsPanel({ username, canViewSettings, passwordTargetUserId }) {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const canSubmit = canViewSettings && password.length > 0 && confirmPassword.length > 0 && !submitting;

  async function onSubmit(e) {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!canViewSettings) {
      setError("You do not have permission to view these settings.");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/profile/${encodeURIComponent(passwordTargetUserId)}/password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password, confirmPassword })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data?.message || "Failed to update password.");
        return;
      }

      setPassword("");
      setConfirmPassword("");
      setSuccess(`Password updated for ${username}.`);
    } catch {
      setError("Network error while updating password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.settingsWrap}>
      <div className={styles.sectionCard}>
        <h2 className={styles.sectionTitle}>Change password</h2>
        <p className={styles.sectionSubtitle}>
          Set a new password for <span className={styles.mono}>{username}</span>.
        </p>

        <form onSubmit={onSubmit} className={styles.form}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>New password</div>
            <input
              className={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
            />
          </label>

          <label className={styles.field}>
            <div className={styles.fieldLabel}>Repeat new password</div>
            <input
              className={styles.input}
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              minLength={8}
              maxLength={72}
              autoComplete="new-password"
            />
          </label>

          <div className={styles.formActions}>
            <button type="submit" disabled={!canSubmit}>
              {submitting ? "Saving…" : "Update password"}
            </button>
          </div>

          {error ? <div className={styles.errorBox}>{error}</div> : null}
          {success ? <div className={styles.successBox}>{success}</div> : null}
          {!canViewSettings ? (
            <div className={styles.noticeBox}>
              Settings are only visible on your own profile, unless you’re an admin.
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}

export default function ProfileClient({ user, gauntlets, initialGauntletId, canViewSettings, passwordTargetUserId }) {
  const tabs = useMemo(() => {
    return [
      { key: "gauntlets", label: "Gauntlets", enabled: true },
      { key: "settings", label: "Settings", enabled: !!canViewSettings }
    ];
  }, [canViewSettings]);

  const [activeTab, setActiveTab] = useState("gauntlets");

  function selectTab(key) {
    const found = tabs.find((t) => t.key === key);
    if (!found) return;
    if (!found.enabled) return;
    setActiveTab(key);
  }

  return (
    <div className={styles.profileBody}>
      <div className={styles.tabRow}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`${styles.tabButton} ${activeTab === t.key ? styles.tabActive : ""}`}
            disabled={!t.enabled}
            onClick={() => selectTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === "gauntlets" ? (
        <UserRollsClient user={user} gauntlets={gauntlets} initialGauntletId={initialGauntletId} showHeader={true} />
      ) : null}

      {activeTab === "settings" ? (
        <SettingsPanel
          username={user.username}
          canViewSettings={canViewSettings}
          passwordTargetUserId={passwordTargetUserId}
        />
      ) : null}
    </div>
  );
}
