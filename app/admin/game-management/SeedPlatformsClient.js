"use client";
import { useState } from "react";
import styles from "./SeedPlatformsClient.module.css";

export default function SeedPlatformsClient() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSeed() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/igdb/seed-platforms", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json?.message || "Failed to seed platforms");
      }
      setResult(json);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button onClick={handleSeed} disabled={loading}>
        {loading ? "Seeding platforms..." : "Seed all platforms from IGDB"}
      </button>
      {result && (
        <div className={styles.result}>
          Inserted: {result.inserted} / Fetched: {result.totalFetched}
        </div>
      )}
      {error && (
        <div className={styles.error}>
          Error: {error}
        </div>
      )}
    </div>
  );
}
