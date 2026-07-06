'use client';

import { useEffect } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { useReducedMotion } from '@/lib/motion';

const copFormatter = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
});

const bareFormatter = new Intl.NumberFormat('es-CO', {
  maximumFractionDigits: 0,
});

interface CountUpProps {
  value: number;
  bare?: boolean;
  className?: string;
}

export function CountUp({ value, bare = false, className }: CountUpProps) {
  const prefersReduced = useReducedMotion();

  const motionVal = useMotionValue(0);
  const spring = useSpring(motionVal, {
    damping: 30,
    stiffness: 80,
    mass: 1,
  });
  const display = useTransform(spring, (v) =>
    bare ? bareFormatter.format(v) : copFormatter.format(v),
  );

  useEffect(() => {
    motionVal.set(value);
  }, [value, motionVal]);

  if (prefersReduced) {
    return (
      <span className={className}>
        {bare ? bareFormatter.format(value) : copFormatter.format(value)}
      </span>
    );
  }

  return <motion.span className={className}>{display}</motion.span>;
}
