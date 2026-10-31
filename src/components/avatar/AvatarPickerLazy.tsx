"use client";

import dynamic from "next/dynamic";

/** The picker's code (crop, grids) loads only when someone opens it. */
const AvatarPicker = dynamic(() => import("./AvatarPicker"), { ssr: false });
export default AvatarPicker;
