// Shared Google Maps JS API loader — mirrors ergOS-frontend/src/utils/
// googleMapsLoader.js. setOptions() must run exactly once app-wide no matter
// how many map components mount; routing every importLibrary() call through
// this module guarantees the script is never double-loaded.
//
// setOptions() touches `window`, so configuration is deferred to the first
// importLibrary() call (which only ever happens client-side, inside effects).

import {
  importLibrary as loaderImportLibrary,
  setOptions,
  type LibraryMap,
} from "@googlemaps/js-api-loader";

export const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

let configured = false;

export function importLibrary<T extends keyof LibraryMap>(
  libraryName: T,
): Promise<LibraryMap[T]> {
  if (!apiKey) {
    return Promise.reject(
      new Error(
        "Google Maps API key missing — set NEXT_PUBLIC_GOOGLE_MAPS_API_KEY in .env.local",
      ),
    );
  }
  if (!configured) {
    setOptions({ key: apiKey });
    configured = true;
  }
  return loaderImportLibrary(libraryName);
}

// POI/transit-free base style used by every production map component.
export const POI_OFF_STYLES: google.maps.MapTypeStyle[] = [
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  {
    featureType: "poi.business",
    elementType: "labels",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "poi.business",
    elementType: "geometry",
    stylers: [{ visibility: "off" }],
  },
];
