"use client";

// Photos for the demo fleet, from the same place production gets them: the
// shared EV catalogue behind getVehicleImageUrl (src/utils/misc.js), which
// serves <repositoryEvId>.png out of the tsx-static bucket. The sandbox has no
// repositoryEvId to key on — nothing here comes from the vehicles API — so the
// catalogue id is recorded per model and matched on make/model text instead
// (the DEMO-BD/DEMO-ET plates are a fallback), which keeps working whichever
// layer supplies the vehicle. A local copy of each shot is the fallback for
// when the bucket can't be reached, so a demo without a network still has
// pictures.
//
// The catalogue shoots every vehicle small in a square of studio white, so a
// plain object-fit leaves the thumbnail mostly empty. Each entry carries the
// box the vehicle actually occupies and the image is scaled and offset to sit
// that box in the frame — cover, but against the vehicle rather than the
// canvas it was shot on.

import { useState } from "react";
import { IoCarSport } from "react-icons/io5";
import type { Vehicle } from "@/data/types";

/** Mirrors VITE_VEHICLE_IMAGE_BASE_URL / getVehicleImageUrl in production. */
const CATALOG_BASE_URL =
  process.env.NEXT_PUBLIC_VEHICLE_IMAGE_BASE_URL ||
  "https://tsx-static.s3.ap-south-1.amazonaws.com/Vehicles/Electric";

export function vehicleCatalogUrl(repositoryEvId: number | string): string {
  return `${CATALOG_BASE_URL}/${repositoryEvId}.png`;
}

/** The part of the image the vehicle fills, as fractions of width/height. */
interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface VehiclePhotoAsset {
  /** Catalogue id, as production's repositoryEvId. */
  catalogId?: number;
  /** Served from /public when the catalogue is unreachable. */
  fallbackSrc: string;
  alt: string;
  /** Intrinsic width / height of the file. */
  aspect: number;
  crop: CropBox;
  /**
   * "cover" fills the frame and lets the ends of a long vehicle run past it.
   * "contain" is for the ones shot nearly square — a three-wheeler seen from
   * the front is barely wider than it is tall, and covering a landscape frame
   * with it would cut the roof and the wheels off. What shows beside it is the
   * studio white of the shot itself, against a white frame, so it does not
   * read as an empty box. Defaults to cover.
   */
  fit?: "cover" | "contain";
}

type VehicleLike = Pick<Vehicle, "make" | "model" | "reg">;

const FULL_FRAME: CropBox = { x: 0, y: 0, w: 1, h: 1 };

const CATALOG: { match: RegExp; photo: VehiclePhotoAsset }[] = [
  {
    match: /bright\s?drop|zevo|\bBD\d/i,
    photo: {
      fallbackSrc: "/vehicles/brightdrop-400.png",
      alt: "BrightDrop 400",
      aspect: 1.853,
      crop: FULL_FRAME,
    },
  },
  {
    match: /e-?\s?transit|\bET\d/i,
    photo: {
      fallbackSrc: "/vehicles/ford-e-transit.png",
      alt: "Ford E-Transit Cargo Van",
      aspect: 1.6809,
      crop: { x: 0.0559, y: 0.0256, w: 0.8831, h: 0.9744 },
    },
  },
  {
    // Eco Mobility's 4W fleet — "MG / ZS EV EXECUTIVE".
    match: /\bzs\s?ev\b|\bmg\b.*\bzs\b/i,
    photo: {
      catalogId: 238,
      fallbackSrc: "/vehicles/mg-zs-ev.png",
      alt: "MG ZS EV",
      aspect: 1,
      crop: { x: 0.0935, y: 0.2915, w: 0.844, h: 0.4545 },
      fit: "contain",
    },
  },
  {
    // Etash 3W cargo — "Piaggio Vehicles Pvt Ltd / Ape E-Xtra FX Max".
    match: /\bape\b|piaggio/i,
    photo: {
      catalogId: 139,
      fallbackSrc: "/vehicles/piaggio-ape-e-xtra.png",
      alt: "Piaggio Ape E-Xtra FX Max",
      aspect: 1,
      crop: { x: 0.12, y: 0.2167, w: 0.7967, h: 0.6817 },
      fit: "contain",
    },
  },
  {
    // Etash 3W cargo — "Mahindra Electric Mobility Ltd / ZOR grand DV". The
    // catalogue shot carries a "ZOR GRAND / ELECTRIC" wordmark above the
    // vehicle; the crop starts below both lines so neither rides into frame.
    match: /\bzor\b/i,
    photo: {
      catalogId: 136,
      fallbackSrc: "/vehicles/mahindra-zor-grand.png",
      alt: "Mahindra Zor Grand",
      aspect: 1,
      crop: { x: 0.135, y: 0.1917, w: 0.78, h: 0.76 },
      fit: "contain",
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

/**
 * Size and position for the image so its crop box fills the frame: scale the
 * whole picture until the vehicle spans the frame on both axes (or fits inside
 * it, for the near-square shots), then slide the vehicle's centre onto the
 * frame's.
 */
function coverCrop(photo: VehiclePhotoAsset, width: number, height: number) {
  const { crop, aspect } = photo;
  const span = photo.fit === "contain" ? Math.min : Math.max;
  const displayWidth = span(width / crop.w, (height / crop.h) * aspect);
  const displayHeight = displayWidth / aspect;
  return {
    width: displayWidth,
    height: displayHeight,
    left: width / 2 - displayWidth * (crop.x + crop.w / 2),
    top: height / 2 - displayHeight * (crop.y + crop.h / 2),
  };
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
  const [catalogFailed, setCatalogFailed] = useState(false);

  const src =
    photo?.catalogId && !catalogFailed
      ? vehicleCatalogUrl(photo.catalogId)
      : photo?.fallbackSrc;
  const box = photo ? coverCrop(photo, width, height) : null;

  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center overflow-hidden ${className ?? ""}`}
      style={{
        width,
        height,
        borderRadius: radius,
        // White behind a catalogue shot: what sits beside a "contain" vehicle
        // is the studio white it was photographed on, and the frame has to
        // meet it without a seam.
        background: photo ? "#ffffff" : "#f5f5f3",
        position: "relative",
      }}
      title={photo?.alt}
    >
      {photo && box && src ? (
        // eslint-disable-next-line @next/next/no-img-element -- catalogue asset on a fixed frame, nothing to optimise
        <img
          src={src}
          alt={photo.alt}
          // The catalogue is a remote bucket; drop to the bundled copy rather
          // than leaving a blank frame if it is unreachable.
          onError={() => setCatalogFailed(true)}
          style={{
            position: "absolute",
            width: box.width,
            height: box.height,
            left: box.left,
            top: box.top,
            maxWidth: "none",
          }}
        />
      ) : (
        <IoCarSport style={{ fontSize: Math.round(Math.min(width, height) * 0.5), color: "#9ca3af" }} />
      )}
    </div>
  );
}
