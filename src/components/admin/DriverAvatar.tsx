"use client";

import type { DriverId } from "@/lib/admin-navigation";

const portraits = {
  zenia: { src: "/avatars/gilberto-rodriguez.jpg", subject: "Gilberto Rodríguez Orejuela", initials: "YP" },
  rafal: { src: "/avatars/joaquin-guzman.webp", subject: "Joaquín Guzmán", initials: "RG" },
} satisfies Record<DriverId, { src: string; subject: string; initials: string }>;

export function DriverAvatar({ driver }: { driver: DriverId }) {
  const { src, subject, initials } = portraits[driver];
  return <span aria-hidden="true" title={`Awatar: ${subject}`}
    className="driver-avatar relative grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg border border-amber-brand/60 bg-surface2 font-bold text-amber-brand">
    {initials}
    {/* eslint-disable-next-line @next/next/no-img-element -- Tiny precompressed local portraits; serve as-is. */}
    <img key={driver} src={src} alt="" width={64} height={64} decoding="async" draggable={false}
      className="absolute inset-0 size-full object-cover object-[50%_35%] grayscale"
      onError={event => { event.currentTarget.style.display = "none"; }} />
  </span>;
}
