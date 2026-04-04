import type { AuthResponse, InvestigationSummary, NoteInfo } from '../types/api';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

function getHeaders(): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = localStorage.getItem('auth_token');
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

export async function register(
  email: string, password: string, displayName: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, display_name: displayName }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Registration failed');
  }
  const data: AuthResponse = await res.json();
  localStorage.setItem('auth_token', data.token);
  return data;
}

export async function login(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.detail || 'Login failed');
  }
  const data: AuthResponse = await res.json();
  localStorage.setItem('auth_token', data.token);
  return data;
}

export function logout(): void {
  localStorage.removeItem('auth_token');
}

export function isAuthenticated(): boolean {
  return !!localStorage.getItem('auth_token');
}

// --- Investigations ---

export async function listInvestigations(): Promise<InvestigationSummary[]> {
  const res = await fetch(`${API_BASE}/api/investigations`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch investigations');
  return res.json();
}

export async function createInvestigation(
  title: string, rootAddress: string, rootChain: string, description?: string
): Promise<InvestigationSummary> {
  const res = await fetch(`${API_BASE}/api/investigations`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ title, root_address: rootAddress, root_chain: rootChain, description }),
  });
  if (!res.ok) throw new Error('Failed to create investigation');
  return res.json();
}

export async function getInvestigation(id: string): Promise<InvestigationSummary & { graph_data: string | null }> {
  const res = await fetch(`${API_BASE}/api/investigations/${id}`, { headers: getHeaders() });
  if (!res.ok) throw new Error('Failed to fetch investigation');
  return res.json();
}

export async function updateInvestigation(
  id: string, updates: { title?: string; description?: string; graph_data?: string; status?: string }
): Promise<InvestigationSummary> {
  const res = await fetch(`${API_BASE}/api/investigations/${id}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update investigation');
  return res.json();
}

export async function deleteInvestigation(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/investigations/${id}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to delete investigation');
}

// --- Notes ---

export async function listNotes(investigationId: string): Promise<NoteInfo[]> {
  const res = await fetch(`${API_BASE}/api/investigations/${investigationId}/notes`, {
    headers: getHeaders(),
  });
  if (!res.ok) throw new Error('Failed to fetch notes');
  return res.json();
}

export async function createNote(
  investigationId: string, targetType: string, content: string, targetId?: string
): Promise<NoteInfo> {
  const res = await fetch(`${API_BASE}/api/investigations/${investigationId}/notes`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ target_type: targetType, target_id: targetId, content }),
  });
  if (!res.ok) throw new Error('Failed to create note');
  return res.json();
}
