"use client";

// Photos for the demo fleet. energy-brain's demo vehicles are three
// "BrightDrop 400 #0n" and one "E-Transit #01", so the catalogue matches on
// make/model text (and the DEMO-BD/DEMO-ET plates as a fallback) rather than
// on ids — that way it keeps working whichever layer supplies the vehicle.
//
// Production resolves the same pictures from the shared EV catalogue
// (getVehicleImageUrl → .../Vehicles/Electric/<repositoryEvId>.png). The
// sandbox has no repositoryEvId to key on, so the four fixture models carry
// their catalogue shot locally and are matched by name instead. Each file is
// cropped to the vehicle so "cover" fills its frame rather than floating in
// the studio white the catalogue ships with.

import { IoCarSport } from "react-icons/io5";
import type { Vehicle } from "@/data/types";

export interface VehiclePhotoAsset {
  src: string;
  alt: string;
  /** "cover" for studio shots that carry their own backdrop, "contain" for
   *  cut-outs trimmed to the vehicle (nothing to crop into). */
  fit: "cover" | "contain";
}

type VehicleLike = Pick<Vehicle, "make" | "model" | "reg">;

const CATALOG: { match: RegExp; photo: VehiclePhotoAsset }[] = [
  {
    match: /bright\s?drop|zevo|\bBD\d/i,
    photo: { src: "/vehicles/brightdrop-400.png", alt: "BrightDrop 400", fit: "cover" },
  },
  {
    match: /e-?\s?transit|\bET\d/i,
    photo: { src: "/vehicles/ford-e-transit.png", alt: "Ford E-Transit Cargo Van", fit: "contain" },
  },
  {
    // Eco Mobility's 4W fleet — "MG / ZS EV EXECUTIVE".
    match: /\bzs\s?ev\b|\bmg\b.*\bzs\b/i,
    photo: { src: "/vehicles/mg-zs-ev.png", alt: "MG ZS EV", fit: "cover" },
  },
  {
    // Etash 3W cargo — "Piaggio Vehicles Pvt Ltd / Ape E-Xtra FX Max".
    match: /\bape\b|piaggio/i,
    photo: {
      src: "/vehicles/piaggio-ape-e-xtra.png",
      alt: "Piaggio Ape E-Xtra FX Max",
      fit: "cover",
    },
  },
  {
    // Etash 3W cargo — "Mahindra Electric Mobility Ltd / ZOR grand DV".
    match: /\bzor\b/i,
    photo: {
      src: "/vehicles/mahindra-zor-grand.png",
      alt: "Mahindra Zor Grand",
      fit: "cover",
    },
  },
];

export function vehiclePhotoFor(vehicle: VehicleLike | undefined): VehiclePhotoAsset | null {
  if (!vehicle) return null;
  // Model name first; the plate is only a fallback so a stray letter pair in a
  // registration can't outvote an explicit make/model.
  const name = `${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim();
  for (const entry of CATALOG) if (name && entry.match.test(name)) return entry.photo;
  for (const entry of CATALOG) if (entry.match.test(vehicle.reg ?? "")) return entry.photo;
  return null;
}

export default function VehiclePhoto({
  vehicle,
  width,
  height,
  radius = 8,
  className,
}: {
  vehicle: VehicleLike | undefined;
  width: number;
  height: number;
  radius?: number;
  className?: string;
}) {
  const photo = vehiclePhotoFor(vehicle);

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center overflow-hidden ${className ?? ""}`}
      style={{ width, height, borderRadius: radius, background: "#f5f5f3" }}
      title={photo?.alt}
    >
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element -- static demo asset, no layout shift to optimise
        <img
          src={photo.src}
          alt={photo.alt}
          style={{ width: "100%", height: "100%", objectFit: photo.fit }}
        />
      ) : (
        <IoCarSport style={{ fontSize: Math.round(Math.min(width, height) * 0.5), color: "#9ca3af" }} />
      )}
    </div>
  );
}
