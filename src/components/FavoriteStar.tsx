"use client";

import { useOptimistic, useTransition } from "react";
import { toggleFavorite } from "@/app/actions/favorites";

/**
 * Stern zum Merken eines Items. Der Zustand springt sofort um, noch bevor der
 * Server geantwortet hat - sonst fuehlt sich das Anklicken traege an. Geht
 * das Speichern schief, faellt er von selbst auf den echten Stand zurueck.
 */
export default function FavoriteStar({
  itemId,
  favorit,
  itemName,
}: {
  itemId: string;
  favorit: boolean;
  itemName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [optimistisch, setzeOptimistisch] = useOptimistic(favorit);

  return (
    <button
      type="button"
      onClick={() =>
        startTransition(async () => {
          setzeOptimistisch(!optimistisch);
          await toggleFavorite(itemId);
        })
      }
      disabled={pending}
      aria-pressed={optimistisch}
      title={optimistisch ? "Aus Favoriten entfernen" : "Zu Favoriten hinzufügen"}
      aria-label={
        optimistisch
          ? `„${itemName}“ aus den Favoriten entfernen`
          : `„${itemName}“ zu den Favoriten hinzufügen`
      }
      className={`favorite-star${optimistisch ? " favorite-star-on" : ""}`}
    >
      <span aria-hidden>{optimistisch ? "★" : "☆"}</span>
    </button>
  );
}
