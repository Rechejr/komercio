'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { DUR, EASE } from '@/lib/motion';
import { useReducedMotion } from '@/lib/motion';

// ── Allowed HTML tags ─────────────────────────────────────────────────────────
type AllowedContainerTags = 'div' | 'ul' | 'ol' | 'section' | 'tbody';
type AllowedItemTags = 'div' | 'li' | 'tr' | 'section';

const MOTION_CONTAINERS = {
  div:     motion.div,
  ul:      motion.ul,
  ol:      motion.ol,
  section: motion.section,
  tbody:   motion.tbody,
} as const;

const MOTION_ITEMS = {
  div:     motion.div,
  li:      motion.li,
  tr:      motion.tr,
  section: motion.section,
} as const;

// ── StaggerList ───────────────────────────────────────────────────────────────
// Contenedor semántico. Solo wrappea con el tag correcto; la animación
// la maneja cada StaggerItem individualmente.
interface StaggerListProps {
  children: React.ReactNode;
  className?: string;
  as?: AllowedContainerTags;
}

export function StaggerList({
  children,
  className,
  as = 'div',
}: StaggerListProps) {
  const prefersReduced = useReducedMotion();
  const Tag = (prefersReduced ? as : as) as React.ElementType;

  if (prefersReduced) {
    return <Tag className={className}>{children}</Tag>;
  }

  const MotionTag = MOTION_CONTAINERS[as] as React.ElementType;
  return <MotionTag className={className}>{children}</MotionTag>;
}

// ── StaggerItem ───────────────────────────────────────────────────────────────
// Cada ítem anima con fadeUp y un delay = min(index, 12) * 0.06s
type StaggerItemProps = {
  children: React.ReactNode;
  className?: string;
  as?: AllowedItemTags;
  /** Índice del ítem para calcular el delay (se capa en 12) */
  index?: number;
} & React.HTMLAttributes<HTMLElement>;

const STAGGER_STEP = 0.06;
const STAGGER_CAP  = 12;

export function StaggerItem({
  children,
  className,
  as = 'div',
  index = 0,
  ...rest
}: StaggerItemProps) {
  const prefersReduced = useReducedMotion();

  if (prefersReduced) {
    const Tag = as as React.ElementType;
    return <Tag className={className} {...rest}>{children}</Tag>;
  }

  const MotionTag = MOTION_ITEMS[as] as React.ElementType;
  const delay = Math.min(index, STAGGER_CAP) * STAGGER_STEP;

  return (
    <MotionTag
      className={className}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: DUR.md, ease: EASE.spring }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}
