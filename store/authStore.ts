import { create } from "zustand";
import * as SecureStore from "expo-secure-store";
import { tokenVencido } from "../services/jwt";

type Cafeteria = { id: string; nombre: string };

type AuthState = {
  token: string | null;
  username: string | null;
  cafeterias: Cafeteria[];
  selectedCafeteria: Cafeteria | null;
  isLoading: boolean;

  setAuth: (token: string, username: string, cafeterias: Cafeteria[]) => Promise<void>;
  selectCafeteria: (cafeteria: Cafeteria) => Promise<void>;
  logout: () => Promise<void>;
  loadToken: () => Promise<boolean>;
};

// Claves de almacenamiento seguro
const K_TOKEN = "auth_token";
const K_USERNAME = "auth_username";
const K_CAFETERIAS = "auth_cafeterias";
const K_CAFETERIA = "auth_cafeteria";

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  username: null,
  cafeterias: [],
  selectedCafeteria: null,
  isLoading: true,

  setAuth: async (token, username, cafeterias) => {
    set({ token, username, cafeterias });
    await SecureStore.setItemAsync(K_TOKEN, token);
    await SecureStore.setItemAsync(K_USERNAME, username);
    await SecureStore.setItemAsync(K_CAFETERIAS, JSON.stringify(cafeterias));
  },

  selectCafeteria: async (cafeteria) => {
    set({ selectedCafeteria: cafeteria });
    await SecureStore.setItemAsync(K_CAFETERIA, JSON.stringify(cafeteria));
  },

  logout: async () => {
    set({ token: null, username: null, cafeterias: [], selectedCafeteria: null });
    await SecureStore.deleteItemAsync(K_TOKEN);
    await SecureStore.deleteItemAsync(K_USERNAME);
    await SecureStore.deleteItemAsync(K_CAFETERIAS);
    await SecureStore.deleteItemAsync(K_CAFETERIA);
  },

  loadToken: async () => {
    const token = await SecureStore.getItemAsync(K_TOKEN);
    const username = await SecureStore.getItemAsync(K_USERNAME);

    // El token vive en SecureStore indefinidamente, pero el backend lo vence.
    // Sin este chequeo la app entraba al POS con un token muerto: el primer
    // request devolvía 401, saltaba "No se pudieron cargar los productos" y
    // recién ahí el interceptor deslogueaba. Mejor detectarlo acá y mandar al
    // login de una, sin el error de por medio.
    if (token && tokenVencido(token)) {
      await SecureStore.deleteItemAsync(K_TOKEN);
      await SecureStore.deleteItemAsync(K_USERNAME);
      await SecureStore.deleteItemAsync(K_CAFETERIAS);
      await SecureStore.deleteItemAsync(K_CAFETERIA);
      set({
        token: null,
        username: null,
        cafeterias: [],
        selectedCafeteria: null,
        isLoading: false,
      });
      return false;
    }

    if (token && username) {
      const cafeteriasRaw = await SecureStore.getItemAsync(K_CAFETERIAS);
      const cafeteriaRaw = await SecureStore.getItemAsync(K_CAFETERIA);

      let cafeterias: Cafeteria[] = [];
      let selectedCafeteria: Cafeteria | null = null;
      try {
        if (cafeteriasRaw) cafeterias = JSON.parse(cafeteriasRaw);
        if (cafeteriaRaw) selectedCafeteria = JSON.parse(cafeteriaRaw);
      } catch {
        // Datos corruptos → se ignoran, el usuario re-selecciona
      }

      set({ token, username, cafeterias, selectedCafeteria, isLoading: false });
      return true;
    }

    set({ isLoading: false });
    return false;
  },
}));
