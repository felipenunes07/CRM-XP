import { env } from "../../lib/env.js";
import { HttpError } from "../../lib/httpError.js";
import { buildProspectingTextQuery } from "./prospectingCore.js";

interface GoogleTextSearchPlace {
  id: string;
  displayName?: {
    text?: string;
  };
  formattedAddress?: string;
  googleMapsUri?: string;
  primaryTypeDisplayName?: {
    text?: string;
  };
}

interface GooglePlaceDetails {
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
}

async function parseGoogleResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    const errorPayload = payload.error as Record<string, unknown> | undefined;
    const message =
      typeof errorPayload?.message === "string"
        ? errorPayload.message
        : typeof payload.message === "string"
          ? payload.message
          : "Google Places request failed";
    throw new HttpError(response.status, message);
  }

  return payload as T;
}

function ensureGoogleApiKey() {
  if (!env.GOOGLE_MAPS_API_KEY) {
    throw new HttpError(503, "Google Places nao esta configurado neste ambiente.");
  }

  return env.GOOGLE_MAPS_API_KEY;
}

export async function searchGooglePlacesText(input: {
  keyword: string;
  state: string;
  city?: string | null;
  pageSize?: number;
}) {
  const apiKey = ensureGoogleApiKey();
  const pageSize = Math.max(1, Math.min(input.pageSize ?? env.PROSPECTING_SEARCH_PAGE_SIZE, env.PROSPECTING_SEARCH_PAGE_SIZE));

  const response = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask":
        "places.id,places.displayName,places.formattedAddress,places.googleMapsUri,places.primaryTypeDisplayName",
    },
    body: JSON.stringify({
      textQuery: buildProspectingTextQuery(input.keyword, input.state, input.city),
      languageCode: "pt-BR",
      regionCode: "BR",
      pageSize,
      rankPreference: "RELEVANCE",
    }),
  });

  const payload = await parseGoogleResponse<{ places?: GoogleTextSearchPlace[] }>(response);
  return payload.places ?? [];
}

export async function getGooglePlaceDetails(placeId: string) {
  const apiKey = ensureGoogleApiKey();
  const url = new URL(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`);
  url.searchParams.set("languageCode", "pt-BR");
  url.searchParams.set("regionCode", "BR");

  const response = await fetch(url, {
    headers: {
      "x-goog-api-key": apiKey,
      "x-goog-fieldmask": "nationalPhoneNumber,websiteUri,rating,userRatingCount",
    },
  });

  return parseGoogleResponse<GooglePlaceDetails>(response);
}
