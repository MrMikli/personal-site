"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Joystick, GamepadDirectional, Gavel, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight } from "lucide-react";
import GameCard from "@/app/components/GameCard";
import RollingWheel from "./RollingWheel";
import styles from "./HeatRollClient.module.css";

function buildInitialTargets(platforms, defaultGameCounter) {
  if (!platforms.length || defaultGameCounter <= 0) return {};
  const targets = {};

  // If the pool is smaller than platform count, we cannot keep each >= 1.
  // Mirror server behavior: allocate 1 to some platforms and 0 to the rest.
  if (defaultGameCounter < platforms.length) {
    platforms.forEach((p, idx) => {
      targets[p.id] = idx < defaultGameCounter ? 1 : 0;
    });
    return targets;
  }

  // Spread as evenly as possible (difference between any two is at most 1).
  const base = Math.floor(defaultGameCounter / platforms.length);
  const remainder = defaultGameCounter - base * platforms.length;
  platforms.forEach((p, idx) => {
    targets[p.id] = base + (idx < remainder ? 1 : 0);
  });
  return targets;
}

export default function HeatRollClient({
  heatId,
  defaultGameCounter,
  configuredGameCounter,
  totalGameCounter,
  penaltyDelta = 0,
  bonusRollsAvailable,
  platforms,
  initialRolls,
  initialTargets,
  initialSelectedGameId,
  initialWesternRequired = 0,
  isHeatOver = false,
  isAdmin = false,
  initialHeatEffects = [],
  initialEffectInventory = [],
  effectsEnabled = true
}) {
  const router = useRouter();

  const initialConfiguredPool =
    typeof configuredGameCounter === "number" && configuredGameCounter > 0
      ? configuredGameCounter
      : defaultGameCounter;
  const initialTotalPool =
    typeof totalGameCounter === "number" && totalGameCounter > 0
      ? totalGameCounter
      : initialConfiguredPool;
  const initialBonusRollsCount =
    typeof bonusRollsAvailable === "number" && bonusRollsAvailable >= 0
      ? bonusRollsAvailable
      : 0;

  const initialHasAnyPowerups = (initialEffectInventory || []).some(
    (row) => (Number(row?.remainingUses) || 0) > 0
  );
  const initialFirstPowerupKind =
    (initialEffectInventory || []).find((row) => (Number(row?.remainingUses) || 0) > 0)?.kind || null;

  const [isPowerupsOpen, setIsPowerupsOpen] = useState(initialHasAnyPowerups);
  const [selectedPowerupKind, setSelectedPowerupKind] = useState(initialFirstPowerupKind);

  const [inventoryByKind, setInventoryByKind] = useState(() => {
    const base = {
      REWARD_ROLL_POOL_PLUS_30: 0,
      REWARD_BONUS_ROLL_PLATFORM: 0,
      REWARD_MOVE_WHEEL: 0,
      REWARD_VETO_REROLL: 0
    };
    (initialEffectInventory || []).forEach((row) => {
      if (!row?.kind) return;
      base[row.kind] = Number(row.remainingUses) || 0;
    });
    return base;
  });

  const hasAnyPowerups = useMemo(
    () => Object.values(inventoryByKind).some((v) => (Number(v) || 0) > 0),
    [inventoryByKind]
  );

  useEffect(() => {
    // Auto-open if the user gains powerups while on-page.
    if (!isPowerupsOpen && hasAnyPowerups) setIsPowerupsOpen(true);
  }, [hasAnyPowerups, isPowerupsOpen]);

  useEffect(() => {
    // If nothing selected yet, pick the first available powerup.
    if (selectedPowerupKind) return;
    const next = Object.entries(inventoryByKind).find(([, v]) => (Number(v) || 0) > 0)?.[0] || null;
    if (next) setSelectedPowerupKind(next);
  }, [inventoryByKind, selectedPowerupKind]);

  const powerupDescriptions = useMemo(
    () => ({
      REWARD_ROLL_POOL_PLUS_30:
        "(+3 pool) Adds 3 to this heat's configured pool. Must be activated before you roll anything.",
      REWARD_BONUS_ROLL_PLATFORM:
        "(Bonus roll) Adds one extra roll token tied to a platform you choose. Total pool increases, and you can roll the bonus after the configured pool is filled.",
      REWARD_MOVE_WHEEL:
        "(Move wheel) While the wheel is visible for the last roll, shift the selection by -2/-1/+1/+2 to pick a different slot. Costs 1 use per space moved.",
      REWARD_VETO_REROLL:
        "(Veto reroll) Replaces a rolled game with a different eligible game from the same platform. Costs 1 use per veto reroll."
    }),
    []
  );

  const selectedPowerupDescription = selectedPowerupKind
    ? powerupDescriptions[selectedPowerupKind] || ""
    : "Click a powerup to see what it does.";

  const [heatEffects, setHeatEffects] = useState(initialHeatEffects || []);
  const [platformOptions, setPlatformOptions] = useState([]);
  const [bonusPlatformId, setBonusPlatformId] = useState("");
  const [isBonusPlatformPromptOpen, setIsBonusPlatformPromptOpen] = useState(false);
  const [effectsError, setEffectsError] = useState("");

  // Keep heat effects in sync with refreshed server props (router.refresh after activation).
  useEffect(() => {
    setHeatEffects(initialHeatEffects || []);
  }, [initialHeatEffects]);

  const activePoolPlus3Count = useMemo(
    () => (heatEffects || []).filter((e) => e?.kind === "REWARD_ROLL_POOL_PLUS_30" && (Number(e?.poolDelta) || 0) > 0).length,
    [heatEffects]
  );

  const activeBonusByPlatform = useMemo(() => {
    const active = (heatEffects || []).filter(
      (e) =>
        e?.kind === "REWARD_BONUS_ROLL_PLATFORM" &&
        !e?.consumedAt &&
        (Number(e?.remainingUses) || 0) > 0
    );

    const counts = new Map();
    for (const e of active) {
      const platformId = e?.platformId || "";
      const platform = e?.platform || null;
      const label = platform
        ? (platform.abbreviation ? `${platform.name} (${platform.abbreviation})` : platform.name)
        : (platformId ? platformId : "(unknown platform)");

      const key = platformId || label;
      const prev = counts.get(key) || { label, count: 0 };
      prev.count += 1;
      counts.set(key, prev);
    }

    return Array.from(counts.values());
  }, [heatEffects]);

  const bonusConfigSummary = useMemo(() => {
    const allBonus = (heatEffects || []).filter(
      (e) => e?.kind === "REWARD_BONUS_ROLL_PLATFORM" && typeof e?.platformId === "string" && e.platformId
    );

    if (!allBonus.length) return "(none)";

    const byPlatformId = new Map();
    for (const e of allBonus) {
      const platformId = e.platformId;
      const platform = e?.platform || null;
      const label = platform
        ? (platform.abbreviation ? `${platform.name} (${platform.abbreviation})` : platform.name)
        : platformId;

      const prev = byPlatformId.get(platformId) || { label, available: 0, used: 0 };
      const isAvailable = !e?.consumedAt && (Number(e?.remainingUses) || 0) > 0;
      if (isAvailable) prev.available += 1;
      else prev.used += 1;
      byPlatformId.set(platformId, prev);
    }

    const parts = Array.from(byPlatformId.values()).map((row) => {
      const total = row.available + row.used;
      const countLabel = total > 1 ? ` x${total}` : "";
      if (row.available > 0 && row.used > 0) {
        return `${row.label}${countLabel} (${row.available} available, ${row.used} used)`;
      }
      if (row.available > 0) {
        return `${row.label}${countLabel} (available)`;
      }
      return `${row.label}${countLabel} (used)`;
    });

    return parts.join(", ");
  }, [heatEffects]);

  const hasAnyBonusConfig = useMemo(() => {
    return (heatEffects || []).some(
      (e) => e?.kind === "REWARD_BONUS_ROLL_PLATFORM" && typeof e?.platformId === "string" && e.platformId
    );
  }, [heatEffects]);

  const activeEffectLines = useMemo(() => {
    const lines = [];
    if (activePoolPlus3Count > 0) {
      lines.push(`${activePoolPlus3Count}x +3 pool active`);
    }
    for (const entry of activeBonusByPlatform) {
      lines.push(`${entry.count}x bonus roll active (${entry.label})`);
    }
    return lines;
  }, [activePoolPlus3Count, activeBonusByPlatform]);

  const [configuredPool, setConfiguredPool] = useState(
    initialConfiguredPool
  );
  const [totalPool, setTotalPool] = useState(
    initialTotalPool
  );
  const [bonusRollsCount, setBonusRollsCount] = useState(
    initialBonusRollsCount
  );

  const [activePenaltyDelta, setActivePenaltyDelta] = useState(Number(penaltyDelta) || 0);

  useEffect(() => {
    setActivePenaltyDelta(Number(penaltyDelta) || 0);
  }, [penaltyDelta]);

  const rollingRef = useRef(false);
  const [isRolling, setIsRolling] = useState(false);
  const [wheel, setWheel] = useState(null);
  const [wheelAnimationMode, setWheelAnimationMode] = useState("static");
  const [pendingRoll, setPendingRoll] = useState(null);
  const [wheelRollId, setWheelRollId] = useState(null);

  // Keep pool sizes in sync if the server props change (e.g., after activation + refresh).
  useEffect(() => {
    if (rollingRef.current || isRolling) return;
    if (wheel || pendingRoll) return;
    if (typeof configuredGameCounter === "number" && configuredGameCounter > 0) {
      setConfiguredPool(configuredGameCounter);
    }
    if (typeof totalGameCounter === "number" && totalGameCounter > 0) {
      setTotalPool(totalGameCounter);
    } else if (typeof configuredGameCounter === "number" && configuredGameCounter > 0) {
      setTotalPool(configuredGameCounter);
    }
    if (typeof bonusRollsAvailable === "number" && bonusRollsAvailable >= 0) {
      setBonusRollsCount(bonusRollsAvailable);
    }
  }, [configuredGameCounter, totalGameCounter, bonusRollsAvailable, isRolling, wheel, pendingRoll]);

  const [rolls, setRolls] = useState(initialRolls || []);
  const hasInitialTargets = initialTargets && Object.keys(initialTargets).length > 0;
  const [platformTargets, setPlatformTargets] = useState(
    hasInitialTargets
      ? initialTargets
      : buildInitialTargets(platforms || [], initialConfiguredPool)
  );
  const [error, setError] = useState("");
  const [selectedRollId, setSelectedRollId] = useState(null);
  const [finalSelectedGameId, setFinalSelectedGameId] = useState(
    initialSelectedGameId || null
  );
  const [westernRequired, setWesternRequired] = useState(
    typeof initialWesternRequired === "number" && initialWesternRequired > 0
      ? Math.min(initialWesternRequired, initialConfiguredPool)
      : initialConfiguredPool
  );

  const [isLocked, setIsLocked] = useState(
    hasInitialTargets || (initialRolls && initialRolls.length > 0)
  );

  useEffect(() => {
    if (isLocked) return;
    setPlatformTargets(buildInitialTargets(platforms || [], configuredPool));
  }, [platforms, configuredPool, isLocked]);

  const totalConfigured = useMemo(
    () => Object.values(platformTargets).reduce((acc, v) => acc + (Number(v) || 0), 0),
    [platformTargets]
  );

  const platformCount = platforms?.length || 0;
  const minPerPlatform = configuredPool < platformCount ? 0 : 1;
  const maxPerPlatform = configuredPool < platformCount
    ? Math.max(0, configuredPool)
    : Math.max(1, configuredPool - Math.max(platformCount - 1, 0));

  const configMismatch = !isLocked && totalConfigured !== configuredPool;
  const audioRef = useRef(null);
  const fadeTimeoutRef = useRef(null);
  const fadeIntervalRef = useRef(null);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.5);

  const effectiveRollCount = rolls.length + (pendingRoll ? 1 : 0);
  const rollsUsedLabel = `${effectiveRollCount} / ${totalPool} rolled`;

  const volumePct = useMemo(() => {
    const pct = isMuted ? 0 : Math.round((Number(volume) || 0) * 100);
    const snapped = Math.min(100, Math.max(0, Math.round(pct / 5) * 5));
    return snapped;
  }, [isMuted, volume]);

  const volumeFillClass = styles[`volumeFill${volumePct}`] || styles.volumeFill0;

  function stopAudioImmediate() {
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

  // Ensure fresh server-rendered props when revisiting via back/forward.
  useEffect(() => {
    router.refresh();
  }, [router]);

  // If refreshed data arrives (or route cache is invalidated), resync local state.
  useEffect(() => {
    if (rollingRef.current || isRolling) return;
    if (wheel || pendingRoll) return;

    const nextRolls = initialRolls || [];
    const nextHasTargets = initialTargets && Object.keys(initialTargets).length > 0;

    setRolls(nextRolls);
    setPlatformTargets(
      nextHasTargets
        ? initialTargets
        : buildInitialTargets(platforms || [], configuredPool)
    );
    setIsLocked(nextHasTargets || nextRolls.length > 0);
    setFinalSelectedGameId(initialSelectedGameId || null);
    setSelectedRollId((prev) => {
      if (!prev) return null;
      return nextRolls.some((r) => r.id === prev) ? prev : null;
    });
    setWesternRequired(
      typeof initialWesternRequired === "number" && initialWesternRequired > 0
        ? Math.min(initialWesternRequired, configuredPool)
        : configuredPool
    );
  }, [
    initialRolls,
    initialTargets,
    initialSelectedGameId,
    initialWesternRequired,
    configuredPool,
    isRolling,
    wheel,
    pendingRoll
  ]);

  async function handleRoll() {
    if (rollingRef.current || isRolling || isHeatOver) return;
    if (effectiveRollCount >= totalPool) return;
    if (configMismatch) {
      setError(
        `Configured total (${totalConfigured}) must equal the heat pool (${configuredPool}) before rolling.`
      );
      return;
    }
    rollingRef.current = true;
    setIsRolling(true);
    setError("");
    setEffectsError("");

    // Starting a new roll: prevent move-wheel from applying to the previous roll.
    setWheelRollId(null);
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
      // Prime audio under the user gesture to avoid autoplay restrictions,
      // but keep it silent until the wheel animation actually starts.
      if (!isMuted && volume > 0) {
        if (!audioRef.current) {
          const audio = new Audio(
            "/CS_GO%20Case%20Knife%20Opening%20Sound%20Effect.mp3"
          );
          audio.loop = true;
          audio.volume = 0;
          audioRef.current = audio;
        }
        const audio = audioRef.current;
        audio.currentTime = 0;
        audio.volume = 0;
        audio.play().catch(() => {});
      }
    } catch (_e) {
      //
    }
    let hasWheel = false;
    try {
      const res = await fetch(`/api/gauntlet/heats/${heatId}/roll`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platformTargets, westernRequired })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const msg = json?.message || `Failed to roll (HTTP ${res.status})`;
        throw new Error(msg);
      }
      if (json?.targets) {
        setPlatformTargets(json.targets);
        setIsLocked(true);
      }
      if (json?.wheel && json?.roll) {
        hasWheel = true;

        // Sync audio to the moment the wheel begins.
        if (audioRef.current) {
          try {
            audioRef.current.currentTime = 0;
            audioRef.current.volume = isMuted ? 0 : volume;
          } catch (_e) {}
        }

        setWheelAnimationMode("spin");
        setWheel(json.wheel);
        setPendingRoll(json.roll);
        setWheelRollId(json.roll.id || null);
      } else if (json?.roll) {
        // Fallback if wheel data is missing
        setRolls((prev) => [...prev, json.roll]);
      }
    } catch (e) {
      setError(String(e.message || e));
      // On error, stop any playing audio immediately to stop infinite loops
      stopAudioImmediate();
    } finally {
      // If no wheel animation is running, clear rolling state immediately
      if (!hasWheel) {
        setIsRolling(false);
        rollingRef.current = false;
        // Also stop audio in this path since there is no animation
        stopAudioImmediate();
      }
    }
  }

  async function ensurePlatformOptionsLoaded() {
    if (platformOptions.length) return platformOptions;
    try {
      const res = await fetch("/api/platforms");
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Failed to load platforms");
      const list = Array.isArray(json?.platforms) ? json.platforms : [];
      setPlatformOptions(list);
      if (!bonusPlatformId && list[0]?.id) {
        setBonusPlatformId(list[0].id);
      }
      return list;
    } catch (e) {
      setEffectsError(String(e?.message || e));
      return [];
    }
  }

  async function handleActivatePowerup(kind, options = {}) {
    if (isHeatOver) return;
    setEffectsError("");
    try {
      const body = { kind };
      if (kind === "REWARD_BONUS_ROLL_PLATFORM") {
        const requested = options?.platformId || bonusPlatformId;
        await ensurePlatformOptionsLoaded();
        if (!requested) throw new Error("Choose a platform first");
        body.platformId = requested;
      }

      const res = await fetch(`/api/gauntlet/heats/${heatId}/effects/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || `Failed to activate powerup (HTTP ${res.status})`);
      }

      const pool = json?.pool || null;
      if (pool && typeof pool.configuredPool === "number") {
        setConfiguredPool(pool.configuredPool);
      }
      if (pool && typeof pool.bonusRolls === "number") {
        setBonusRollsCount(pool.bonusRolls);
      }
      if (pool && typeof pool.totalPool === "number") {
        setTotalPool(pool.totalPool);
      }

      setInventoryByKind((prev) => ({
        ...prev,
        [kind]: Math.max(0, (Number(prev?.[kind]) || 0) - 1)
      }));

      // If this changes the configured pool size, rebuild default targets while still unlocked.
      if (!isLocked) {
        setPlatformTargets(buildInitialTargets(platforms || [], pool?.configuredPool || configuredPool));
        setWesternRequired((prev) => Math.min(Number(prev) || 0, pool?.configuredPool || configuredPool));
      }

      router.refresh();
    } catch (e) {
      setEffectsError(String(e?.message || e));
    }
  }

  async function openBonusPlatformPrompt() {
    if (isHeatOver) return;
    setEffectsError("");
    const list = await ensurePlatformOptionsLoaded();
    if (!list.length) {
      setEffectsError("No platforms available");
      return;
    }
    if (!bonusPlatformId && list[0]?.id) {
      setBonusPlatformId(list[0].id);
    }
    setIsBonusPlatformPromptOpen(true);
  }

  async function handleMoveWheel(delta) {
    if (isHeatOver) return;
    if (isRolling) return;
    const cost = Math.abs(Number(delta) || 0);
    const available = Number(inventoryByKind.REWARD_MOVE_WHEEL) || 0;
    if (!cost || available < cost) return;
    const activeRollId = pendingRoll?.id || wheelRollId;
    if (!activeRollId) return;
    setEffectsError("");
    try {
      const res = await fetch(
        `/api/gauntlet/heats/${heatId}/rolls/${activeRollId}/move-wheel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ delta })
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Failed to move wheel");

      if (typeof json?.chosenIndex === "number") {
        // Move-wheel should snap instantly; do not replay the spin animation.
        setWheelAnimationMode("static");
        setWheel((prev) => (prev ? { ...prev, chosenIndex: json.chosenIndex } : prev));
      }
      if (json?.roll) {
        if (pendingRoll?.id && pendingRoll.id === activeRollId) {
          setPendingRoll(json.roll);
        } else {
          setRolls((prev) => prev.map((r) => (r.id === activeRollId ? json.roll : r)));
        }
      }
      if (typeof json?.remainingMoves === "number") {
        setInventoryByKind((prev) => ({ ...prev, REWARD_MOVE_WHEEL: json.remainingMoves }));
      }
    } catch (e) {
      setEffectsError(String(e?.message || e));
    }
  }

  async function handleVetoReroll(rollId) {
    if (isHeatOver) return;
    if (!rollId) return;
    setEffectsError("");
    try {
      const res = await fetch(
        `/api/gauntlet/heats/${heatId}/rolls/${rollId}/veto-reroll`,
        { method: "POST" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.message || "Failed to veto reroll");

      // Match technical veto behavior: remove from pool, then let the user roll again.
      setRolls((prev) => prev.filter((r) => r.id !== rollId));
      setSelectedRollId((prev) => (prev === rollId ? null : prev));

      // If the vetoed roll is currently associated with the wheel UI, clear it.
      if (pendingRoll?.id === rollId || wheelRollId === rollId) {
        setWheel(null);
        setPendingRoll(null);
        setWheelRollId(null);
        setIsRolling(false);
        rollingRef.current = false;
      }

      if (typeof json?.remainingVetos === "number") {
        setInventoryByKind((prev) => ({ ...prev, REWARD_VETO_REROLL: json.remainingVetos }));
      }

      // Server-side veto can refund bonus-roll tokens; refresh props to reflect immediately.
      router.refresh();
    } catch (e) {
      setEffectsError(String(e?.message || e));
    }
  }

  function handleWheelComplete() {
    if (pendingRoll) {
      setRolls((prev) => [...prev, pendingRoll]);
      setWheelRollId(pendingRoll.id || null);
      setPendingRoll(null);
    }

    // After the initial spin finishes, keep the wheel in a static state.
    setWheelAnimationMode("static");
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
          } catch (_e) {
            // ignore volume errors
          }
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
    rollingRef.current = false;
  }

  const canMoveWheelNow =
    effectsEnabled &&
    !isHeatOver &&
    !isRolling &&
    (Number(inventoryByKind.REWARD_MOVE_WHEEL) || 0) > 0 &&
    !!wheelRollId &&
    !!(wheel?.games?.length);

  const moveWheelUses = Number(inventoryByKind.REWARD_MOVE_WHEEL) || 0;
  const wheelChosenIndex = typeof wheel?.chosenIndex === "number" ? wheel.chosenIndex : 0;
  const wheelGameCount = wheel?.games?.length || 0;
  function canMoveWheelDelta(delta) {
    if (!canMoveWheelNow) return false;
    const d = Number(delta) || 0;
    const cost = Math.abs(d);
    if (!cost) return false;
    if (moveWheelUses < cost) return false;
    const nextIndex = wheelChosenIndex + d;
    if (nextIndex < 0) return false;
    if (nextIndex >= wheelGameCount) return false;
    return true;
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

  function handleTargetChange(platformId, rawValue) {
    if (isLocked || isHeatOver) return;
    let value = Number(rawValue);
    if (!Number.isFinite(value)) value = minPerPlatform;
    if (value < minPerPlatform) value = minPerPlatform;
    if (value > maxPerPlatform) value = maxPerPlatform;
    setPlatformTargets((prev) => ({ ...prev, [platformId]: value }));
  }

  function handleWesternRequiredChange(rawValue) {
    if (isLocked || isHeatOver) return;
    let value = Number(rawValue);
    if (!Number.isFinite(value) || value < 0) value = 0;
    if (value > configuredPool) value = configuredPool;
    setWesternRequired(value);
  }

  async function handleTechnicalVeto(rollId) {
    if (isHeatOver) return;
    try {
      const res = await fetch(
        `/api/gauntlet/heats/${heatId}/rolls/${rollId}`,
        {
          method: "DELETE"
        }
      );
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.message || "Failed to apply technical veto");
      }
      setRolls((prev) => prev.filter((r) => r.id !== rollId));

      // If the vetoed roll is currently associated with the wheel UI, clear it.
      if (pendingRoll?.id === rollId || wheelRollId === rollId) {
        setWheel(null);
        setPendingRoll(null);
        setWheelRollId(null);
        setIsRolling(false);
        rollingRef.current = false;
      }

      // Bonus-roll deletes can refund tokens; refresh to show updated Bonus: row.
      router.refresh();
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  const isPoolFull = rolls.length >= totalPool;

  useEffect(() => {
    if (!isPoolFull || finalSelectedGameId) return;
    // Default selection to the first roll when pool fills and no final choice yet
    if (!selectedRollId && rolls[0]) {
      setSelectedRollId(rolls[0].id);
    }
  }, [isPoolFull, finalSelectedGameId, selectedRollId, rolls]);

  async function handleChooseGame() {
    if (isHeatOver) {
      setError("This heat is over; you can no longer choose a game.");
      return;
    }
    if (!isPoolFull) {
      setError("You must roll the full pool before choosing a game.");
      return;
    }
    if (!selectedRollId) {
      setError("Please select a game from the list before choosing.");
      return;
    }
    try {
      setError("");
      const res = await fetch(
        `/api/gauntlet/heats/${heatId}/selected-game`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rollId: selectedRollId })
        }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || "Failed to choose game for this heat");
      }
      const chosenGameId = json?.selectedGameId || null;
      if (chosenGameId) {
        setFinalSelectedGameId(chosenGameId);
      }
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function handleUndoPick() {
    if (isHeatOver) {
      setError("This heat is over; you can no longer change your chosen game.");
      return;
    }
    const confirmed = window.confirm(
      "Are you sure you want to undo your picked game for this heat? This should only be used for a genuine technical veto when the game is not actually available to you, not just because you are a little baby a little wussy pussy wahh wahh coward."
    );
    if (!confirmed) return;
    try {
      setError("");
      const res = await fetch(`/api/gauntlet/heats/${heatId}/selected-game`, {
        method: "DELETE"
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || "Failed to undo picked game for this heat");
      }
      setFinalSelectedGameId(null);
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function handleAdminReset() {
    if (!isAdmin || isHeatOver) return;
    const confirmed = window.confirm(
      "Reset all your rolls, configuration, and picked game for this heat? This is an admin-only tool and should normally only be used for testing or fixing a broken signup."
    );
    if (!confirmed) return;
    try {
      setError("");
      const res = await fetch(`/api/gauntlet/heats/${heatId}/reset-signup`, {
        method: "POST"
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || "Failed to reset your rolls for this heat");
      }
      setRolls([]);
      setPlatformTargets(buildInitialTargets(platforms || [], configuredPool));
      setIsLocked(false);
      setFinalSelectedGameId(null);
      setSelectedRollId(null);
      setWheel(null);
      setPendingRoll(null);
      setHeatEffects([]);
      if (typeof window !== "undefined") {
        window.location.reload();
      }
    } catch (e) {
      setError(String(e.message || e));
    }
  }

  async function handleAdminGrantPowerup(kind) {
    if (!isAdmin || isHeatOver) return;
    setEffectsError("");
    try {
      const res = await fetch(`/api/admin/heats/${heatId}/powerups/grant`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind })
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(json?.message || "Failed to add powerup");
      }
      const totalUses = Number(json?.totalUses);
      if (Number.isFinite(totalUses)) {
        setInventoryByKind((prev) => ({ ...prev, [kind]: totalUses }));
      } else {
        setInventoryByKind((prev) => ({ ...prev, [kind]: (Number(prev?.[kind]) || 0) + 1 }));
      }
      setSelectedPowerupKind(kind);
      setIsPowerupsOpen(true);
    } catch (e) {
      setEffectsError(String(e?.message || e));
    }
  }

  return (
    <>
      {effectsEnabled && isBonusPlatformPromptOpen && (
        <div
          className={styles.modalBackdrop}
          role="dialog"
          aria-modal="true"
          aria-label="Choose platform for bonus roll"
          onClick={() => setIsBonusPlatformPromptOpen(false)}
        >
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Choose a platform for your bonus roll</div>
            <select
              className={styles.powerupSelect}
              value={bonusPlatformId}
              onChange={(e) => setBonusPlatformId(e.target.value)}
            >
              {platformOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.abbreviation ? ` (${p.abbreviation})` : ""}
                </option>
              ))}
            </select>
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.powerupButton}
                onClick={() => setIsBonusPlatformPromptOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.powerupButton}
                disabled={!bonusPlatformId}
                onClick={async () => {
                  setIsBonusPlatformPromptOpen(false);
                  await handleActivatePowerup("REWARD_BONUS_ROLL_PLATFORM", { platformId: bonusPlatformId });
                }}
              >
                Use
              </button>
            </div>
          </div>
        </div>
      )}

      <div
        className={styles.configRow}
      >
        <div
          aria-label="Roll configuration"
          className={styles.configCard}
        >
          <h2 className={styles.configTitle}>Configuration</h2>
          <div className={styles.configHelp}>
            <div className={styles.cautionTitle}>Caution:</div>
            <div>Once you roll, your configuration for this heat is locked.</div>
            <br />
            <div>Choose how many rolls to aim for on each platform (normally min 1 each; can be 0 if pool &lt; platform count).</div>
          </div>
          <div
            className={styles.targets}
          >
            {(platforms || []).map((p) => (
              <label
                key={p.id}
                className={styles.targetRow}
              >
                <span>
                  {p.name}
                  {p.abbreviation ? ` (${p.abbreviation})` : ""}:
                </span>
                {isLocked ? (
                  <span>{platformTargets[p.id] ?? 0}</span>
                ) : (
                  <input
                    type="number"
                    min={minPerPlatform}
                    max={maxPerPlatform}
                    value={platformTargets[p.id] ?? ""}
                    onChange={(e) => handleTargetChange(p.id, e.target.value)}
                    className={styles.targetInput}
                  />
                )}
              </label>
            ))}

            {hasAnyBonusConfig ? (
              <div className={styles.targetRow}>
                <span>Bonus:</span>
                <span>{bonusConfigSummary}</span>
              </div>
            ) : null}

            {activePenaltyDelta < 0 ? (
              <div className={styles.targetRow}>
                <span>Penalty:</span>
                <span>{activePenaltyDelta} pool (from giving up previous heat)</span>
              </div>
            ) : null}
          </div>
          {!isLocked && (
            <div className={styles.totals}>
                      Configured total: {totalConfigured} out of {configuredPool}
              {configMismatch && (
                <div className={styles.totalsError}>
                          Total must equal {configuredPool} before you can roll.
                </div>
              )}
            </div>
          )}

          <div className={styles.western}>
            <label className={styles.westernLabel}>
              <span>Minimum western-release games:</span>
              {isLocked ? (
                <span>{westernRequired}</span>
              ) : (
                <input
                  type="number"
                  min={0}
                    max={configuredPool}
                  value={westernRequired}
                  disabled={isHeatOver}
                  onChange={(e) => handleWesternRequiredChange(e.target.value)}
                  className={styles.westernInput}
                />
              )}
            </label>
            <div className={styles.westernHelp}>
              At least this many of your rolled games will be guaranteed to have a Western-region release (EU, NA, AU, WW). <br /> 
              Reminder: You are always allowed to do a technical veto any game that can't be acquired in English, this just makes rolling faster if you're certain you don't want to deal with any moonrunes at all. 
            </div>
          </div>
        </div>

        {isAdmin && !isHeatOver && (
          <div
            className={styles.adminBox}
          >
            <div className={styles.adminTitle}>Admin only</div>
            <div className={styles.adminText}>
              Reset your rolls, configuration, and picked game for this heat.
            </div>
            <button
              type="button"
              onClick={handleAdminReset}
              className={styles.adminButton}
            >
              Reset my rolls
            </button>

            {effectsEnabled && (
              <>
                <div className={styles.adminText}>
                  Add powerups to your inventory (testing).
                </div>
                <div className={styles.adminPowerupsGrid}>
                  <button
                    type="button"
                    onClick={() => handleAdminGrantPowerup("REWARD_ROLL_POOL_PLUS_30")}
                    className={styles.adminButton}
                  >
                    Add #1
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdminGrantPowerup("REWARD_BONUS_ROLL_PLATFORM")}
                    className={styles.adminButton}
                  >
                    Add #2
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdminGrantPowerup("REWARD_MOVE_WHEEL")}
                    className={styles.adminButton}
                  >
                    Add #3
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAdminGrantPowerup("REWARD_VETO_REROLL")}
                    className={styles.adminButton}
                  >
                    Add #4
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {effectsEnabled && (
        <section
          aria-label="Powerups"
          className={`${styles.powerupsBox} ${!isPowerupsOpen ? styles.powerupsBoxCollapsed : ""}`.trim()}
        >
          <div className={styles.powerupsHeaderRow}>
            <div className={styles.powerupsTitle}>Powerups</div>
            <button
              type="button"
              className={styles.powerupsToggle}
              aria-label={isPowerupsOpen ? "Collapse powerups" : "Expand powerups"}
              onClick={() => setIsPowerupsOpen((prev) => !prev)}
            >
              {isPowerupsOpen ? "Hide" : "Show"}
            </button>
          </div>

          {!isPowerupsOpen ? (
            <div className={styles.powerupsCollapsedSummary}>
              {hasAnyPowerups
                ? "Powerups available. Click Show to use them."
                : "No powerups yet. Beat heats to earn powerups."}
            </div>
          ) : (
            <>
              <div className={styles.powerupsRow}>
                <div
                  className={`${styles.powerupChip} ${selectedPowerupKind === "REWARD_ROLL_POOL_PLUS_30" ? styles.powerupChipSelected : ""}`.trim()}
                  onClick={() => setSelectedPowerupKind("REWARD_ROLL_POOL_PLUS_30")}
                >
                  <div className={styles.powerupIcon} aria-hidden="true"><Plus size={14} /></div>
                  <div className={styles.powerupMeta}>x{inventoryByKind.REWARD_ROLL_POOL_PLUS_30 || 0}</div>
                  <button
                    type="button"
                    className={styles.powerupButton}
                    disabled={isHeatOver || isLocked || (inventoryByKind.REWARD_ROLL_POOL_PLUS_30 || 0) <= 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleActivatePowerup("REWARD_ROLL_POOL_PLUS_30");
                    }}
                    title={isLocked ? "Activate before rolling" : "Use on this heat"}
                  >
                    Use
                  </button>
                </div>

                <div
                  className={`${styles.powerupChip} ${selectedPowerupKind === "REWARD_BONUS_ROLL_PLATFORM" ? styles.powerupChipSelected : ""}`.trim()}
                  onClick={() => setSelectedPowerupKind("REWARD_BONUS_ROLL_PLATFORM")}
                >
                  <div className={styles.powerupIcon} aria-hidden="true"><Joystick size={14} /></div>
                  <div className={styles.powerupMeta}>x{inventoryByKind.REWARD_BONUS_ROLL_PLATFORM || 0}</div>
                  <button
                    type="button"
                    className={styles.powerupButton}
                    disabled={isHeatOver || (inventoryByKind.REWARD_BONUS_ROLL_PLATFORM || 0) <= 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      openBonusPlatformPrompt();
                    }}
                    onMouseEnter={(e) => {
                      e.stopPropagation();
                      ensurePlatformOptionsLoaded();
                    }}
                  >
                    Use
                  </button>
                </div>

                <div
                  className={`${styles.powerupChip} ${selectedPowerupKind === "REWARD_MOVE_WHEEL" ? styles.powerupChipSelected : ""}`.trim()}
                  onClick={() => setSelectedPowerupKind("REWARD_MOVE_WHEEL")}
                >
                  <div className={styles.powerupIcon} aria-hidden="true"><GamepadDirectional size={14} /></div>
                  <div className={styles.powerupMeta}>x{inventoryByKind.REWARD_MOVE_WHEEL || 0}</div>
                </div>

                <div
                  className={`${styles.powerupChip} ${selectedPowerupKind === "REWARD_VETO_REROLL" ? styles.powerupChipSelected : ""}`.trim()}
                  onClick={() => setSelectedPowerupKind("REWARD_VETO_REROLL")}
                >
                  <div className={styles.powerupIcon} aria-hidden="true"><Gavel size={14} /></div>
                  <div className={styles.powerupMeta}>x{inventoryByKind.REWARD_VETO_REROLL || 0}</div>
                </div>
              </div>

              <div className={styles.powerupsDescription}>{selectedPowerupDescription}</div>

              {activeEffectLines.length ? (
                <div className={styles.powerupsActiveEffects}>
                  {activeEffectLines.map((line) => (
                    <div key={line} className={styles.powerupsActiveEffectLine}>
                      {line}
                    </div>
                  ))}
                </div>
              ) : null}

              {effectsError ? <div className={styles.effectsError}>{effectsError}</div> : null}
            </>
          )}
        </section>
      )}

      {error && (
        <div className={styles.error}>{error}</div>
      )}

      <section
        aria-label="Rolling area"
        className={styles.rollingArea}
      >
        <div className={styles.rollingTop}>
          <p className={styles.rollingNote}>
            {isHeatOver
              ? "This heat is over. You can review your pool, but cannot roll again."
              : ""}
          </p>
          {!isHeatOver && (
            <div
              className={styles.volumeRow}
            >
              <button
                type="button"
                onClick={handleToggleMute}
                aria-label={isMuted ? "Unmute sound" : "Mute sound"}
                className={styles.muteButton}
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
                className={styles.volumeBar}
                onClick={handleVolumeBarClick}
              >
                <div
                  className={`${styles.volumeFill} ${volumeFillClass}`.trim()}
                />
              </div>
            </div>
          )}
        </div>

        <RollingWheel
          games={wheel?.games || []}
          chosenIndex={wheel?.chosenIndex}
          startDelayMs={1500}
          slotPlatforms={wheel?.slotPlatforms || null}
          animationMode={wheelAnimationMode}
          onComplete={handleWheelComplete}
        />

        {canMoveWheelNow ? (
          <div className={styles.moveWheelRow}>
            <div className={styles.moveWheelLabel}>Move wheel (uses powerups):</div>
            <div className={styles.moveWheelButtons}>
              <button
                type="button"
                className={styles.moveWheelButton}
                onClick={() => handleMoveWheel(-2)}
                disabled={!canMoveWheelDelta(-2)}
                title="Costs 2 uses"
              >
                <div><ChevronsLeft /></div>
              </button>
              <button
                type="button"
                className={styles.moveWheelButton}
                onClick={() => handleMoveWheel(-1)}
                disabled={!canMoveWheelDelta(-1)}
                title="Costs 1 use"
              >
                <div><ChevronLeft /></div>
              </button>
              <button
                type="button"
                className={styles.moveWheelButton}
                onClick={() => handleMoveWheel(1)}
                disabled={!canMoveWheelDelta(1)}
                title="Costs 1 use"
              >
                <div><ChevronRight /></div>
              </button>
              <button
                type="button"
                className={styles.moveWheelButton}
                onClick={() => handleMoveWheel(2)}
                disabled={!canMoveWheelDelta(2)}
                title="Costs 2 uses"
              >
                <div><ChevronsRight /></div>
              </button>
            </div>
          </div>
        ) : null}

        <button
          onClick={handleRoll}
          disabled={
            isHeatOver ||
            isRolling ||
            rolls.length >= totalPool ||
            configMismatch
          }
          className={`${styles.rollButton} ${(isHeatOver || isRolling || rolls.length >= totalPool || configMismatch) ? styles.rollButtonDisabled : ""}`.trim()}
        >
          {isHeatOver
            ? "Heat over"
            : rolls.length >= totalPool || configMismatch
            ? "Can't roll"
            : isRolling
            ? "Rolling..."
            : "Let's go gambling!"}
        </button>
      </section>

      <section aria-label="Rolled games pool" className={styles.poolSection}>
        <div
          className={styles.poolHeader}
        >
          <h3 className={styles.poolTitle}>Pool</h3>
          <span className={styles.poolMeta}>{rollsUsedLabel}</span>
        </div>
        <div className={styles.poolTip}>
            Tip: Click on a game in the pool to visit the Backloggd page for that game.
        </div>
        {rolls.length === 0 ? (
          <p className={styles.poolEmpty}>
            No games in the pool yet. Once you roll, they will appear here.
          </p>
        ) : (
          <div className={styles.poolOuter}>
            <div className={styles.poolInner}>
              {rolls.map((roll) => (
                <GameCard
                  key={roll.id}
                  game={roll.game}
                  variant="pool"
                  platformLabelOverride={
                    roll.platform
                      ? (roll.platform.abbreviation || roll.platform.name)
                      : null
                  }
                  onTechnicalVeto={() => handleTechnicalVeto(roll.id)}
                  onVetoReroll={
                    !isHeatOver && (inventoryByKind.REWARD_VETO_REROLL || 0) > 0
                      ? () => handleVetoReroll(roll.id)
                      : null
                  }
                />
              ))}
            </div>
          </div>
        )}
      </section>

      {isPoolFull && (
        <section
          aria-label="Choose final game"
          className={styles.finalSection}
        >
          <h3 className={styles.finalTitle}>Final choice for this heat</h3>
          {finalSelectedGameId ? (
            <>
              <p className={styles.finalSuccess}>
                You have chosen your game for this heat.
              </p>
              {!isHeatOver && (
                <div className={styles.undoWrap}>
                  <button
                    type="button"
                    onClick={handleUndoPick}
                    className={styles.undoButton}
                  >
                    Undo pick (technical veto)
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              <p className={styles.finalBody}>
                {isHeatOver
                  ? "This heat is over. You cannot change your chosen game anymore."
                  : "Select one of your rolled games to be your official pick for this heat."}
              </p>
              <div
                className={styles.finalRow}
              >
                <select
                  value={selectedRollId || ""}
                  onChange={(e) => setSelectedRollId(e.target.value || null)}
                  disabled={isHeatOver}
                  className={styles.finalSelect}
                >
                  <option value="" disabled>
                    Choose a game
                  </option>
                  {rolls.map((roll) => {
                    const g = roll.game;
                    const year = g.releaseDateHuman
                      ? new Date(g.releaseDateHuman).getFullYear()
                      : null;
                    const rolledPlatformLabel = roll.platform
                      ? (roll.platform.abbreviation
                        ? `${roll.platform.name} (${roll.platform.abbreviation})`
                        : roll.platform.name)
                      : "";
                    const labelParts = [g.name];
                    if (year) labelParts.push(`(${year})`);
                    if (rolledPlatformLabel) labelParts.push(`- ${rolledPlatformLabel}`);
                    return (
                      <option key={roll.id} value={roll.id}>
                        {labelParts.join(" ")}
                      </option>
                    );
                  })}
                </select>
                <button
                  type="button"
                  onClick={handleChooseGame}
                  className={`${styles.chooseButton} ${isHeatOver ? styles.chooseButtonDisabled : ""}`.trim()}
                  disabled={isHeatOver}
                >
                  Choose
                </button>
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
