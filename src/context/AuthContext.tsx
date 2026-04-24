/**
 * @file AuthContext.tsx
 * @description React-kontext för autentiseringsstatus i Tipspromenaden-appen.
 *
 * Tillhandahåller den inloggade användaren och laddningsstatus till alla
 * komponenter i trädet via React Context API. Lyssnar på Firebase Auth-ändringar
 * via `onAuthChange` och uppdaterar kontexten automatiskt när användaren
 * loggar in eller ut.
 *
 * Används av:
 * - `App.tsx` – för att bestämma vilken navigationsstack som visas.
 * - `LoginScreen` – för att detektera om användaren redan är inloggad.
 * - `HomeScreen` och andra skärmar – för att visa användarspecifikt innehåll.
 */

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { View, ActivityIndicator, StyleSheet } from "react-native";
import { AppUser, onAuthChange } from "../services/auth";
import { syncMyWalksFromCloud } from "../services/walkSync";
import { pullWalkTagsFromCloud } from "../services/walkTagsSync";

/**
 * Formen på värdet som tillhandahålls av `AuthContext`.
 */
interface AuthContextType {
  /** Den aktuellt inloggade användaren, eller `null` om ingen är inloggad. */
  user: AppUser | null;
  /**
   * `true` medan Firebase kontrollerar om det finns en befintlig session vid appstart.
   * Används för att visa en laddningsindikator och undvika felaktig omdirigering
   * innan autentiseringsstatusen är känd.
   */
  loading: boolean;
}

/**
 * Kontextobjektet med standardvärden för TypeScript-typsäkerhet.
 * Standardvärdet används aldrig i praktiken eftersom `AuthProvider` alltid omger appen.
 */
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
});

/**
 * Tillhandahåller autentiseringskontext till alla barnkomponenter.
 * Ska placeras högt upp i komponentträdet, vanligtvis direkt i `App.tsx`.
 * Prenumererar på Firebase Auth-ändringar när komponenten monteras och
 * avslutar prenumerationen automatiskt när den avmonteras.
 *
 * @param children - Barnkomponenter som ska ha tillgång till autentiseringskontexten.
 *
 * @example
 * // I App.tsx:
 * export default function App() {
 *   return (
 *     <AuthProvider>
 *       <NavigationContainer>
 *         ...
 *       </NavigationContainer>
 *     </AuthProvider>
 *   );
 * }
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);
  // Spåra vilka uid:n vi redan synkat i denna process så vi inte rör
  // Firestore varje gång onAuthChange fyr:ar (t.ex. vid token-refresh).
  const syncedUidsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let unsub: (() => void) | undefined;
    try {
      unsub = onAuthChange((u) => {
        setUser(u ?? null);
        setLoading(false);

        // Vid inloggning: hämta ev. promenader som bara finns i molnet
        // (t.ex. efter ny-installation från Play Store där lokala
        // AsyncStorage startade tomt) in i den lokala listan. Fire-and-
        // forget — fel loggas men blockerar inte UI. Kör endast en gång
        // per uid under denna app-körning.
        if (u?.uid && !u.isAnonymous && !syncedUidsRef.current.has(u.uid)) {
          syncedUidsRef.current.add(u.uid);
          syncMyWalksFromCloud(u.uid).catch((err) => {
            console.warn("[AuthProvider] walk sync failed:", err);
          });
          pullWalkTagsFromCloud(u.uid).catch((err) => {
            console.warn("[AuthProvider] tag sync failed:", err);
          });
        }
      });
    } catch (e) {
      console.error("[AuthProvider] Failed to subscribe to auth state:", e);
      // If Firebase auth fails to initialize (e.g. on web before SDK is ready),
      // treat the user as unauthenticated and allow the app to continue.
      setUser(null);
      setLoading(false);
    }
    return () => {
      if (unsub) unsub();
    };
  }, []);

  // Show a minimal loading screen while Firebase resolves the auth state.
  // This prevents child screens from receiving an undefined auth state.
  if (loading) {
    return (
      <View style={authStyles.loadingContainer}>
        <ActivityIndicator size="large" color="#2D7A3A" />
      </View>
    );
  }

  return (
    <AuthContext.Provider value={{ user, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

const authStyles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#F5F0E8",
  },
});

/**
 * Hook för att komma åt autentiseringskontext i en funktionskomponent.
 * Returnerar den aktuellt inloggade användaren och laddningsstatus.
 *
 * Måste anropas inuti ett `AuthProvider`-träd, annars returneras standardvärden.
 *
 * @returns Kontextvärdet med `user` och `loading`.
 *
 * @example
 * function MyComponent() {
 *   const { user, loading } = useAuth();
 *
 *   if (loading) return <ActivityIndicator />;
 *   if (!user) return <Text>Inte inloggad</Text>;
 *
 *   return <Text>Välkommen, {user.displayName}!</Text>;
 * }
 */
export function useAuth() {
  return useContext(AuthContext);
}
