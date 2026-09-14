// auth.js

let accessToken = null;
let refreshIntervalId = null;

let currentUser = null;

// Decode JWT to get user info
function parseJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(jsonPayload);
  } catch (e) {
    return null;
  }
}

// Check if user is currently authenticated (has valid session)
async function checkAuthStatus() {
  if (!accessToken) {
    const refreshed = await refreshToken();
    if (!refreshed) return false;
  }
  
  if (accessToken && !currentUser) {
    const decoded = parseJwt(accessToken);
    if (decoded) {
      currentUser = { id: decoded.id, username: decoded.username, role: decoded.role };
    }
  }
  
  return !!accessToken;
}


// Returns { setupComplete, isAuthenticated } or null on error
async function getAuthStatus() {
  try {
    const res = await fetch('/api/auth/status');
    if (res.ok) {
      return await res.json();
    }
  } catch (e) {
    console.error('Status check failed', e);
  }
  return null;
}

async function login(username, password) {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    
    if (res.ok) {
      const data = await res.json();
      accessToken = data.accessToken;
      startTokenRefresh();
      return true;
    }
    return false;
  } catch (e) {
    console.error('Login failed', e);
    return false;
  }
}

async function logout() {
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch (e) {
    console.error('Logout failed', e);
  } finally {
    accessToken = null;
    stopTokenRefresh();
    window.location.href = '/index.html';
  }
}

async function refreshToken() {
  try {
    const res = await fetch('/api/auth/refresh', { method: 'POST' });
    if (res.ok) {
      const data = await res.json();
      accessToken = data.accessToken;
      startTokenRefresh();
      return true;
    }
  } catch (e) {
    console.error('Refresh failed', e);
  }
  accessToken = null;
  return false;
}

function startTokenRefresh() {
  stopTokenRefresh();
  // Refresh every 10 minutes (600000 ms)
  refreshIntervalId = setInterval(refreshToken, 600000);
}

function stopTokenRefresh() {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
}

function getAuthHeaders() {
  return accessToken ? { 'Authorization': `Bearer ${accessToken}` } : {};
}

async function apiFetch(url, options = {}) {
  const headers = { ...options.headers, ...getAuthHeaders() };
  
  let res = await fetch(url, { ...options, headers });
  
  if (res.status === 401) {
    // Try to refresh token once
    const refreshed = await refreshToken();
    if (refreshed) {
      const newHeaders = { ...options.headers, ...getAuthHeaders() };
      res = await fetch(url, { ...options, headers: newHeaders });
    } else {
      // Force redirect to login (don't call logout to avoid loop)
      accessToken = null;
      stopTokenRefresh();
      window.location.href = '/index.html';
      throw new Error('Unauthorized');
    }
  }
  
  return res;
}
