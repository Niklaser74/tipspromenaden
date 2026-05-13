/**
 * @file useOnlineStatus.ts
 * @description NetInfo-baserad hook som rapporterar nätverksstatus i realtid.
 *
 * Driver `OfflineBanner` och kan användas på vilken skärm som helst för att
 * gracefulla anrop som annars skulle hänga eller kasta vid offline.
 *
 * `isOnline` är konservativ: vi rapporterar `false` bara när NetInfo
 * uttryckligen säger att vi är offline (eller saknar internet-reachability).
 * Vid initialt unknown-läge antar vi online så att man inte får falskt
 * "offline"-banner under 100 ms vid app-start.
 */
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import NetInfo, { NetInfoState } from "@react-native-community/netinfo";

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(true);

  useEffect(() => {
    if (Platform.OS === "web") {
      // NetInfo fungerar på web men `navigator.onLine` är snabbare och
      // bättre testad. Båda triggar på samma events.
      const update = () =>
        setIsOnline(
          typeof navigator !== "undefined" ? navigator.onLine : true
        );
      update();
      if (typeof window !== "undefined") {
        window.addEventListener("online", update);
        window.addEventListener("offline", update);
        return () => {
          window.removeEventListener("online", update);
          window.removeEventListener("offline", update);
        };
      }
      return;
    }

    const handleChange = (state: NetInfoState) => {
      // Online endast om vi har en connection OCH den anses kunna nå
      // internet. isInternetReachable kan vara null på Android vid
      // uppstart — tolka null som "okänt = anta online" så att vi inte
      // visar falsk banner.
      const reachable =
        state.isInternetReachable === null
          ? state.isConnected
          : state.isInternetReachable;
      setIsOnline(reachable !== false);
    };

    // Hämta initial-state, prenumerera på framtida ändringar.
    NetInfo.fetch().then(handleChange);
    const unsub = NetInfo.addEventListener(handleChange);
    return () => unsub();
  }, []);

  return isOnline;
}
