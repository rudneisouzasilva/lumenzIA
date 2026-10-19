"use client";

import { MotionConfig } from "motion/react";

/** Respeita a preferência "reduzir movimento" do sistema em todas as animações. */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
