// frontend/src/features/auth/authSlice.js
import { createSlice } from '@reduxjs/toolkit';

const AUTH_STORAGE_KEY = 'missive_auth';

function loadStoredAuth() {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed?.accessToken && parsed?.user) {
        return {
          user: parsed.user,
          accessToken: parsed.accessToken,
          workspace: parsed.workspace || null,
          role: parsed.role || null,
          permissions: parsed.permissions || [],
          workspaces: parsed.workspaces || [],
          isAuthenticated: true,
        };
      }
    }
  } catch (e) {
    // Corrupted storage; ignore
  }
  return null;
}

function saveStoredAuth(data) {
  try {
    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    // Storage quota or private mode; ignore
  }
}

function removeStoredAuth() {
  try {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  } catch (e) {
    // Ignore
  }
}

const initialState = loadStoredAuth() || {
  user: null,
  accessToken: null,
  workspace: null, // { id, name, slug }
  role: null,      // { id, name, slug }
  permissions: [], // ['clients.create', 'websites.view', ...]
  workspaces: [],  // list of accessible workspaces
  isAuthenticated: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setCredentials(state, action) {
      const { user, accessToken, workspace, role, permissions, workspaces } = action.payload;
      state.user = user;
      state.accessToken = accessToken;
      state.workspace = workspace;
      state.role = role;
      state.permissions = permissions || [];
      state.workspaces = workspaces || [];
      state.isAuthenticated = true;

      saveStoredAuth({
        user,
        accessToken,
        workspace,
        role,
        permissions,
        workspaces,
      });
    },
    clearCredentials(state) {
      state.user = null;
      state.accessToken = null;
      state.workspace = null;
      state.role = null;
      state.permissions = [];
      state.workspaces = [];
      state.isAuthenticated = false;

      removeStoredAuth();
    },
    updateAccessToken(state, action) {
      state.accessToken = action.payload;
      saveStoredAuth({
        user: state.user,
        accessToken: action.payload,
        workspace: state.workspace,
        role: state.role,
        permissions: state.permissions,
        workspaces: state.workspaces,
      });
    },
    setActiveWorkspace(state, action) {
      const { workspace, role, permissions, accessToken } = action.payload;
      state.workspace = workspace;
      state.role = role;
      state.permissions = permissions || [];
      if (accessToken) state.accessToken = accessToken;

      saveStoredAuth({
        user: state.user,
        accessToken: state.accessToken,
        workspace,
        role,
        permissions,
        workspaces: state.workspaces,
      });
    },
  },
});

export const {
  setCredentials,
  clearCredentials,
  updateAccessToken,
  setActiveWorkspace,
} = authSlice.actions;

// Selectors
export const selectCurrentUser = (state) => state.auth.user;
export const selectIsAuthenticated = (state) => state.auth.isAuthenticated;
export const selectActiveWorkspace = (state) => state.auth.workspace;
export const selectCurrentRole = (state) => state.auth.role;
export const selectUserPermissions = (state) => state.auth.permissions;
export const selectUserWorkspaces = (state) => state.auth.workspaces;

export default authSlice.reducer;
