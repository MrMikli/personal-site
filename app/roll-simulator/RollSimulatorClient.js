"use client";

import { useEffect, useRef, useState } from "react";
import RollingWheel from "@/app/gauntlet/heat/RollingWheel";

export default function RollSimulatorClient({ platforms }) {
  const [selectedPlatformIds, setSelectedPlatformIds] = useState(
    () => platforms.map((p) => p.id)
  );
  const [onlyWestern, setOnlyWestern] = useState(false);
  const [wheel, setWheel] = useState(null);
  const [isRolling, setIsRolling] = useState(false);
  const [error, setError] = useState("");

  const audioRef = useRef(null);
  const fadeTimeoutRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);

  const hasAnySelected = selectedPlatformIds.length > 0;

  function togglePlatform(id) {
    setSelectedPlatformIds((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((x) => x !== id);
        return next;
      }
      return [...prev, id];
    });
  }

  function handleVolumeBarClick(event) {
    if (!event.currentTarget) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, relativeX / rect.width));
    setVolume(ratio);
    const shouldMute = ratio === 0;
    setIsMuted(shouldMute);
    if (audioRef.current) {
      try {
        audioRef.current.volume = ratio;
        if (shouldMute) {
          audioRef.current.pause();
        } else if (isRolling) {
          audioRef.current.play().catch(() => {});
        }
      } catch (_e) {}
    }
  }

  function handleToggleMute() {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        if (next) {
          audioRef.current.pause();
        } else if (isRolling) {
          audioRef.current.volume = volume;
          audioRef.current.play().catch(() => {});
        }
      }
      return next;
    });
  }

  function stopAudioImmediately() {
    if (!audioRef.current) return;
    try {
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
        fadeTimeoutRef.current = null;
      }
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    } catch (_e) {}
  }

  function handleWheelComplete() {
    // After the wheel stops, let the sound play for 1s more,
    // then fade it out over 0.5s instead of cutting abruptly.
    if (audioRef.current && !isMuted) {
      const audio = audioRef.current;
      const startVolume = audio.volume ?? 1;
      if (fadeTimeoutRef.current) {
        clearTimeout(fadeTimeoutRef.current);
      }
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
      }
      fadeTimeoutRef.current = setTimeout(() => {
        const durationMs = 500;
        const steps = 10;
        const stepDuration = durationMs / steps;
        let currentStep = 0;
        fadeIntervalRef.current = setInterval(() => {
          currentStep += 1;
          const ratio = Math.max(0, 1 - currentStep / steps);
          try {
            audio.volume = startVolume * ratio;
          } catch (_e) {}
          if (currentStep >= steps) {
            clearInterval(fadeIntervalRef.current);
            fadeIntervalRef.current = null;
            try {
              audio.pause();
              audio.currentTime = 0;
              audio.volume = startVolume;
            } catch (_e) {}
          }
        }, stepDuration);
      }, 1000);
    }
    setIsRolling(false);
  }

  async function handleRoll() {
    if (isRolling) return;
    if (!hasAnySelected) {
      setError("Select at least one platform to roll from.");
      return;
    }
    setError("");
    setIsRolling(true);
    setWheel(null);

    // Cancel any in-progress fade-out when starting a new roll
    if (fadeTimeoutRef.current) {
      clearTimeout(fadeTimeoutRef.current);
      fadeTimeoutRef.current = null;
    }
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }

    try {
      if (!isMuted && volume > 0) {
        if (!audioRef.current) {
          const audio = new Audio(
            "/CS_GO%20Case%20Knife%20Opening%20Sound%20Effect.mp3"
          );
          audio.loop = true;
          audio.volume = volume;
          audioRef.current = audio;
        }
        const audio = audioRef.current;
        audio.currentTime = 0;
        audio.volume = volume;
        audio.play().catch(() => {});
      }
    } catch (_e) {}

    try {
      const res = await fetch("/api/roll-simulator/roll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          platformIds: selectedPlatformIds,
          onlyWestern
        })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || "Failed to roll");
      }
      if (json?.wheel) {
        setWheel(json.wheel);
      }
    } catch (e) {
      setError(String(e.message || e));
      stopAudioImmediately();
      setIsRolling(false);
    }
  }

  useEffect(() => {
    return () => {
      stopAudioImmediately();
    };
  }, []);

  return (
    <>
      <div
        style={{
          marginTop: 8,
          display: "flex",
          gap: 16,
          alignItems: "flex-start",
          flexWrap: "wrap"
        }}
      >
        <div
          aria-label="Roll configuration"
          style={{
            padding: 12,
            borderRadius: 8,
            border: "1px solid #e0e0e0",
            background: "#fafafa",
            display: "grid",
            gap: 8,
            width: "fit-content"
          }}
        >
          <h2 style={{ margin: 0, fontSize: 16, color: "#333" }}>Configuration</h2>
          <div style={{ fontSize: 13, color: "#444", maxWidth: 520 }}>
            Choose which consoles to roll from. This simulator never saves rolls
            or ties them to any user or heat.
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              flexDirection: "column",
              marginTop: 4
            }}
          >
            {platforms.length === 0 ? (
              <span style={{ fontSize: 13, color: "#666" }}>
                No platforms with games were found. Sync some games first.
              </span>
            ) : (
              platforms.map((p) => {
                const checked = selectedPlatformIds.includes(p.id);
                return (
                  <label
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 13,
                      color: "#333"
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => togglePlatform(p.id)}
                    />
                    <span>
                      {p.name}
                      {p.abbreviation ? ` (${p.abbreviation})` : ""}
                      {typeof p.gamesCount === "number"
                        ? `  ${p.gamesCount} games`
                        : ""}
                    </span>
                  </label>
                );
              })
            )}
          </div>
          <div style={{ fontSize: 13, color: "#333", marginTop: 8 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input
                type="checkbox"
                checked={onlyWestern}
                onChange={(e) => setOnlyWestern(e.target.checked)}
              />
              <span>Only roll games with a Western-region release</span>
            </label>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              Western-region means EU, NA, AU, or Worldwide release flags from
              IGDB. This is just a filter for the simulator and does not affect
              any real heat.
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div style={{ color: "crimson", marginTop: 8 }}>{error}</div>
      )}

      <section
        aria-label="Rolling area"
        style={{
          marginTop: 8,
          padding: 24,
          borderRadius: 12,
          border: "1px solid #ddd",
          minHeight: 220,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at top, rgba(255,255,255,0.9), rgba(245,245,245,0.95))",
          gap: 16
        }}
      >
        <div style={{ textAlign: "center", maxWidth: 480 }}>
          <p style={{ color: "#666", marginBottom: 8 }}>
            This simulator is just for fun and experimentation.
          </p>
          <div
            style={{
              marginTop: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8
            }}
          >
            <button
              type="button"
              onClick={handleToggleMute}
              aria-label={isMuted ? "Unmute sound" : "Mute sound"}
              style={{
                width: 26,
                height: 26,
                borderRadius: "999px",
                border: "1px solid #d1d5db",
                background: "#f9fafb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                padding: 0
              }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                width="14"
                height="14"
                aria-hidden="true"
              >
                <path
                  d="M3 9v6h4l5 4V5L7 9H3z"
                  fill={isMuted ? "#9ca3af" : "#374151"}
                />
                {isMuted && (
                  <>
                    <line
                      x1="16"
                      y1="8"
                      x2="21"
                      y2="16"
                      stroke="#b91c1c"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <line
                      x1="21"
                      y1="8"
                      x2="16"
                      y2="16"
                      stroke="#b91c1c"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </>
                )}
              </svg>
            </button>
            <div
              aria-hidden="true"
              style={{
                position: "relative",
                width: 80,
                height: 6,
                borderRadius: 999,
                background: "#e5e7eb",
                overflow: "hidden"
              }}
              onClick={handleVolumeBarClick}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  width: isMuted ? "0%" : `${Math.round(volume * 100)}%`,
                  background: "#4b5563",
                  transition: "width 150ms ease-out, background-color 150ms ease-out"
                }}
              />
            </div>
          </div>
        </div>

        {wheel && (
          <RollingWheel
            games={wheel.games}
            chosenIndex={wheel.chosenIndex}
            onComplete={handleWheelComplete}
          />
        )}

        <button
          onClick={handleRoll}
          disabled={isRolling || !hasAnySelected}
          style={{
            padding: "8px 20px",
            borderRadius: 999,
            border: "none",
            background:
              isRolling || !hasAnySelected
                ? "#ccc"
                : "#222",
            color: "white",
            cursor:
              isRolling || !hasAnySelected
                ? "default"
                : "pointer",
            fontWeight: 600
          }}
        >
          {isRolling ? "Rolling..." : "Let&apos;s go gambling!"}
        </button>
      </section>
    </>
  );
}
