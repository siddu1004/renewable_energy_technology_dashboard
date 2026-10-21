import { useEffect, useRef, useState } from "react";

interface AnimatedValueProps {
  value: number;
  decimals?: number;
  duration?: number;
  className?: string;
  id?: string;
}

export function AnimatedValue({
  value,
  decimals = 2,
  duration = 380,
  className = "",
  id,
}: AnimatedValueProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isUpdating, setIsUpdating] = useState(false);
  const prevValueRef = useRef(value);
  const animFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const startVal = prevValueRef.current;
    const endVal = value;
    prevValueRef.current = value;

    if (startVal === endVal || isNaN(value)) {
      setDisplayValue(value);
      return;
    }

    setIsUpdating(true);
    const pulseTimer = setTimeout(() => setIsUpdating(false), 300);

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      // Smooth ease-out cubic curve
      const easeOut = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (endVal - startVal) * easeOut;

      setDisplayValue(current);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(endVal);
        startTimeRef.current = null;
      }
    };

    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    startTimeRef.current = null;
    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      clearTimeout(pulseTimer);
    };
  }, [value, duration]);

  const formatted = typeof displayValue === "number" && !isNaN(displayValue)
    ? displayValue.toFixed(decimals)
    : "0.00";

  return (
    <span
      id={id}
      className={`smooth-value-transition ${isUpdating ? "value-pulse" : ""} ${className}`}
      style={{
        display: "inline-block",
        transition: "color 0.2s ease, text-shadow 0.2s ease",
      }}
    >
      {formatted}
    </span>
  );
}
