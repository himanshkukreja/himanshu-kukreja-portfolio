"use client";

import { useEffect } from "react";
import { holdRouteProgress } from "./progressStore";

/** Rendered inside route skeletons: keeps the top progress bar running until the real page replaces them. */
export default function ProgressHold() {
  useEffect(() => holdRouteProgress(), []);
  return null;
}
