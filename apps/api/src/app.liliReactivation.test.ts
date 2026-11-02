import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: { id: 'test', email: 'test@example.invalid', name: 'Teste', role: 'ADMIN', permissions: ['automations.view', 'automations.manage'] },
  prepare: vi.fn(), preview: vi.fn(),
}));
vi.mock('./modules/crm/reactivationSetupService.js', () => ({ prepareLiliReactivation: state.prepare, previewLiliReactivation: state.preview }));
vi.mock('./modules/platform/authMiddleware.js', async (original) => ({
  ...await original<object>(),
  requireAuth: (req: any, _res: unknown, next: () => void) => { req.user = state.user; next(); },
}));
import { createApp } from './app.js';

describe('rotas da regua Lili', () => {
  beforeEach(() => {
    state.prepare.mockReset().mockResolvedValue({ stages: [] });
    state.preview.mockReset().mockResolvedValue({ stages: [] });
    state.user.role = 'ADMIN'; state.user.permissions = ['automations.view', 'automations.manage'];
  });
  it('consulta a simulacao sem preparar ou disparar mensagens', async () => {
    expect((await request(createApp()).get('/api/automations/lili-reactivation/preview')).status).toBe(200);
    expect(state.preview).toHaveBeenCalledOnce();
    expect(state.prepare).not.toHaveBeenCalled();
  });
  it('permite preparar somente a quem gerencia automacoes', async () => {
    expect((await request(createApp()).post('/api/automations/lili-reactivation/prepare')).status).toBe(200);
    expect(state.prepare).toHaveBeenCalledOnce();
  });
  it('respeita negacao explicita mesmo para administrador', async () => {
    state.user.permissions = ['automations.view'];
    expect((await request(createApp()).post('/api/automations/lili-reactivation/prepare')).status).toBe(403);
    expect(state.prepare).not.toHaveBeenCalled();
  });
  it('protege a simulacao de usuarios sem acesso a automacoes', async () => {
    state.user.permissions = [];
    expect((await request(createApp()).get('/api/automations/lili-reactivation/preview')).status).toBe(403);
    expect(state.preview).not.toHaveBeenCalled();
  });
});
