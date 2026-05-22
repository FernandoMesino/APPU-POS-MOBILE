import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

type Cafeteria = { id: string; nombre: string };

type AuthState = {
  token: string | null;
  username: string | null;
  cafeterias: Cafeteria[];
  selectedCafeteria: Cafeteria | null;
  isLoading: boolean;

  setAuth: (token: string, username: string, cafeterias: Cafeteria[]) => Promise<void>;
  selectCafeteria: (cafeteria: Cafeteria) => void;
  logout: () => Promise<void>;
  loadToken: () => Promise<boolean>;
};

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  username: null,
  cafeterias: [],
  selectedCafeteria: null,
  isLoading: true,

  setAuth: async (token, username, cafeterias) => {
    await SecureStore.setItemAsync("auth_token", token);
    await SecureStore.setItemAsync("auth_username", username);
    set({ token, username, cafeterias });
  },

  selectCafeteria: (cafeteria) => {
    set({ selectedCafeteria: cafeteria });
  },

  logout: async () => {
    await SecureStore.deleteItemAsync("auth_token");
    await SecureStore.deleteItemAsync("auth_username");
    set({ token: null, username: null, cafeterias: [], selectedCafeteria: null });
  },

  loadToken: async () => {
    const token = await SecureStore.getItemAsync("auth_token");
    const username = await SecureStore.getItemAsync("auth_username");
    if (token && username) {
      set({ token, username, isLoading: false });
      return true;
    }
    set({ isLoading: false });
    return false;
  },
}));
