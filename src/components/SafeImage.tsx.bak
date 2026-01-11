"use client";
import Image, { ImageProps } from "next/image";
import { useState, useCallback } from "react";

export default function SafeImage(props: ImageProps) {
  const { alt, className, ...rest } = props;
  const [visible, setVisible] = useState(true);

  const handleError = useCallback(() => {
    setVisible(false);
  }, []);

  if (!visible) return null;

  return (
    <Image
      {...rest}
      alt={alt}
      className={className}
      onError={handleError}
    />
  );
}
